use core::mem;

use error_stack::{Report, ResultExt as _, ensure};
use hash_graph_store::error::UpdateError;
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, OpenTemporalBound, Timestamp,
    TransactionTime,
};
use postgres_types::ToSql;
use tokio_postgres::{GenericClient as _, error::SqlState};
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Entity,
        entity::id::{DraftId, EntityEditionId, EntityId},
    },
    ontology::{InheritanceDepth, entity_type::EntityTypeUuid},
    principal::actor::ActorId,
};
use uuid::Uuid;

use super::patch::{DraftTransition, EntityPatchWrite};
use crate::store::{
    AsClient, InTransaction, PostgresStore,
    error::RaceConditionOnUpdate,
    postgres::{
        knowledge::entity::{
            LockedEntityEdition, insert_entity_edition_cache_statement,
            provenance::SqlEntityEditionProvenance,
        },
        query::{
            bulk_insert,
            rows::{
                EntityDraftRow, EntityEditionRow, EntityIsOfTypeRow, EntityTemporalMetadataRow,
                PostgresRow,
            },
        },
    },
};

/// Retains the previous edition before the transaction that replaces it.
fn transaction_history_row(
    previous: &LockedEntityEdition,
    transaction_time: Timestamp<TransactionTime>,
) -> Option<EntityTemporalMetadataRow> {
    let ClosedTemporalBound::Inclusive(start) = *previous.transaction_time.start();
    (start < transaction_time).then(|| EntityTemporalMetadataRow {
        web_id: previous.entity_id.web_id,
        entity_uuid: previous.entity_id.entity_uuid,
        draft_id: previous.entity_id.draft_id,
        entity_edition_id: previous.entity_edition_id,
        decision_time: previous.decision_time,
        transaction_time: LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(start),
            OpenTemporalBound::Exclusive(transaction_time),
        ),
    })
}

/// Retains the previous edition before the patched decision time in the current transaction.
fn decision_history_row(
    previous: &LockedEntityEdition,
    transaction_time: Timestamp<TransactionTime>,
    decision_time: Timestamp<DecisionTime>,
) -> Option<EntityTemporalMetadataRow> {
    let ClosedTemporalBound::Inclusive(start) = *previous.decision_time.start();
    (start < decision_time).then(|| EntityTemporalMetadataRow {
        web_id: previous.entity_id.web_id,
        entity_uuid: previous.entity_id.entity_uuid,
        draft_id: previous.entity_id.draft_id,
        entity_edition_id: previous.entity_edition_id,
        transaction_time: LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(transaction_time),
            OpenTemporalBound::Unbounded,
        ),
        decision_time: LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(start),
            OpenTemporalBound::Exclusive(decision_time),
        ),
    })
}

impl<C: AsClient> PostgresStore<C, InTransaction> {
    /// Flushes pending editions, publication changes, and temporal histories in bulk.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn persist_entity_patches(
        &self,
        actor_id: ActorId,
        entities: &mut [Entity],
        pending: &mut Vec<EntityPatchWrite>,
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(), Report<UpdateError>> {
        if pending.is_empty() {
            return Ok(());
        }
        let writes = mem::take(pending);
        self.insert_entity_patch_editions(entities, &writes).await?;
        self.publish_entity_patches(actor_id, entities, &writes, transaction_time)
            .await?;
        self.write_entity_patch_histories(entities, &writes, transaction_time)
            .await
    }

    /// Executes a patch statement with its SQL recorded on the database span.
    async fn execute_entity_patch_statement(
        &self,
        statement: &str,
        parameters: &[&(dyn ToSql + Sync)],
    ) -> Result<u64, Report<UpdateError>> {
        self.as_client()
            .execute(statement, parameters)
            .instrument(tracing::info_span!(
                "WRITE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement
            ))
            .await
            .change_context(UpdateError)
    }

    /// Inserts a table's patch rows through the shared UNNEST compiler.
    async fn insert_entity_patch_rows<R: PostgresRow + Sync>(
        &self,
        rows: &[R],
    ) -> Result<(), Report<UpdateError>> {
        if rows.is_empty() {
            return Ok(());
        }
        let (statement, parameters) = bulk_insert().rows(rows).compile();
        let parameters = parameters
            .iter()
            .map(|parameter| &**parameter as &(dyn ToSql + Sync))
            .collect::<Vec<_>>();
        let inserted = self
            .execute_entity_patch_statement(&statement, &parameters)
            .await?;
        ensure!(
            inserted == rows.len() as u64,
            Report::new(UpdateError)
                .attach("The entity patch inserted an unexpected number of rows")
        );
        Ok(())
    }

    /// Inserts all editions, their direct and inherited types, and their cache entries.
    async fn insert_entity_patch_editions(
        &self,
        entities: &mut [Entity],
        writes: &[EntityPatchWrite],
    ) -> Result<(), Report<UpdateError>> {
        let mut editions = Vec::with_capacity(writes.len());
        let mut types = Vec::new();
        for write in writes {
            let entity = entities
                .get_mut(write.index)
                .expect("patch index should identify a prepared entity");
            let edition_id = EntityEditionId::new(Uuid::new_v4());
            entity.metadata.record_id.edition_id = edition_id;
            let provenance =
                SqlEntityEditionProvenance::from(entity.metadata.provenance.edition.clone());
            editions.push(EntityEditionRow {
                entity_edition_id: edition_id,
                properties: entity.properties.clone(),
                archived: entity.metadata.archived,
                confidence: entity.metadata.confidence,
                provenance: provenance.json,
                property_metadata: entity.metadata.properties.clone(),
                created_by_id: provenance.created_by_id,
            });
            types.extend(
                entity
                    .metadata
                    .entity_type_ids
                    .iter()
                    .map(|id| EntityIsOfTypeRow {
                        entity_edition_id: edition_id,
                        entity_type_ontology_id: EntityTypeUuid::from_url(id),
                        inheritance_depth: InheritanceDepth::new(0),
                    }),
            );
        }
        self.insert_entity_patch_rows(&editions).await?;
        self.insert_entity_patch_rows(&types).await?;
        let edition_ids = editions
            .iter()
            .map(|row| row.entity_edition_id)
            .collect::<Vec<_>>();
        self.execute_entity_patch_statement(
            "
                INSERT INTO entity_is_of_type (
                    entity_edition_id, entity_type_ontology_id, inheritance_depth
                )
                SELECT
                    direct.entity_edition_id,
                    inheritance.target_entity_type_ontology_id,
                    min(inheritance.depth + 1) AS inheritance_depth
                FROM entity_is_of_type AS direct
                INNER JOIN entity_type_inherits_from AS inheritance
                    ON direct.entity_type_ontology_id
                    = inheritance.source_entity_type_ontology_id
                WHERE direct.entity_edition_id = any($1)
                GROUP BY direct.entity_edition_id, inheritance.target_entity_type_ontology_id;
                ",
            &[&edition_ids],
        )
        .await?;
        self.execute_entity_patch_statement(
            &insert_entity_edition_cache_statement(true),
            &[&edition_ids],
        )
        .await?;
        Ok(())
    }

    /// Locks all live histories that the published drafts will replace.
    async fn lock_entity_patch_publications(
        &self,
        writes: &[&EntityPatchWrite],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<Vec<(LockedEntityEdition, Timestamp<DecisionTime>)>, Report<UpdateError>> {
        let web_ids = writes
            .iter()
            .map(|write| write.locked_row.entity_id.web_id)
            .collect::<Vec<_>>();
        let entity_uuids = writes
            .iter()
            .map(|write| write.locked_row.entity_id.entity_uuid)
            .collect::<Vec<_>>();
        let decision_times = writes
            .iter()
            .map(|write| write.decision_time)
            .collect::<Vec<_>>();
        let rows = self
            .as_client()
            .query(
                "
                SELECT
                    metadata.web_id,
                    metadata.entity_uuid,
                    metadata.entity_edition_id,
                    metadata.transaction_time,
                    metadata.decision_time,
                    targets.decision_time AS patch_decision_time
                FROM
                    unnest($1::UUID [], $2::UUID [], $3::TIMESTAMPTZ [])
                        AS targets (web_id, entity_uuid, decision_time)
                INNER JOIN entity_temporal_metadata AS metadata
                    ON targets.web_id = metadata.web_id
                    AND targets.entity_uuid = metadata.entity_uuid
                    AND metadata.draft_id IS NULL
                    AND metadata.transaction_time @> $4::TIMESTAMPTZ
                    AND metadata.decision_time @> targets.decision_time
                FOR NO KEY UPDATE OF metadata NOWAIT;
                ",
                &[&web_ids, &entity_uuids, &decision_times, &transaction_time],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres"
            ))
            .await
            .map_err(|error| match error.code() {
                Some(&SqlState::LOCK_NOT_AVAILABLE) => {
                    Report::new(RaceConditionOnUpdate).change_context(UpdateError)
                }
                _ => Report::new(error).change_context(UpdateError),
            })?;
        Ok(rows
            .into_iter()
            .map(|row| {
                (
                    LockedEntityEdition {
                        entity_id: EntityId {
                            web_id: row.get(0),
                            entity_uuid: row.get(1),
                            draft_id: None,
                        },
                        entity_edition_id: row.get(2),
                        transaction_time: row.get(3),
                        decision_time: row.get(4),
                    },
                    row.get(5),
                )
            })
            .collect())
    }

    /// Records first publication and archives the live histories replaced by drafts.
    async fn publish_entity_patches(
        &self,
        actor_id: ActorId,
        entities: &mut [Entity],
        writes: &[EntityPatchWrite],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(), Report<UpdateError>> {
        let publications = writes
            .iter()
            .filter(|write| matches!(write.draft_transition, DraftTransition::Publish))
            .collect::<Vec<_>>();
        if publications.is_empty() {
            return Ok(());
        }
        let live = self
            .lock_entity_patch_publications(&publications, transaction_time)
            .await?;
        let mut web_ids = Vec::new();
        let mut entity_uuids = Vec::new();
        let mut decision_times = Vec::new();
        for write in publications {
            let entity = entities
                .get_mut(write.index)
                .expect("patch index should identify a prepared entity");
            if entity
                .metadata
                .provenance
                .first_non_draft_created_at_decision_time
                .is_none()
            {
                web_ids.push(write.locked_row.entity_id.web_id);
                entity_uuids.push(write.locked_row.entity_id.entity_uuid);
                decision_times.push(write.decision_time);
                entity
                    .metadata
                    .provenance
                    .first_non_draft_created_at_transaction_time = Some(transaction_time);
                entity
                    .metadata
                    .provenance
                    .first_non_draft_created_at_decision_time = Some(write.decision_time);
            }
        }
        if !web_ids.is_empty() {
            self.execute_entity_patch_statement(
                "
                UPDATE entity_ids AS entities
                SET
                    provenance = entities.provenance || jsonb_build_object(
                        'firstNonDraftCreatedAtTransactionTime', $4::TIMESTAMPTZ,
                        'firstNonDraftCreatedAtDecisionTime', targets.decision_time
                    )
                FROM
                    unnest($1::UUID [], $2::UUID [], $3::TIMESTAMPTZ [])
                        AS targets (web_id, entity_uuid, decision_time)
                WHERE
                    entities.web_id = targets.web_id
                    AND entities.entity_uuid = targets.entity_uuid;
                ",
                &[&web_ids, &entity_uuids, &decision_times, &transaction_time],
            )
            .await?;
        }
        self.archive_entity_patch_publications(actor_id, &live, transaction_time)
            .await
    }

    /// Closes replaced live histories without retaining empty decision intervals.
    async fn archive_entity_patch_publications(
        &self,
        actor_id: ActorId,
        live: &[(LockedEntityEdition, Timestamp<DecisionTime>)],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(), Report<UpdateError>> {
        if live.is_empty() {
            return Ok(());
        }
        let web_ids = live
            .iter()
            .map(|(row, _)| row.entity_id.web_id)
            .collect::<Vec<_>>();
        let entity_uuids = live
            .iter()
            .map(|(row, _)| row.entity_id.entity_uuid)
            .collect::<Vec<_>>();
        let decision_times = live
            .iter()
            .map(|(_, decision)| *decision)
            .collect::<Vec<_>>();
        for statement in [
            "
                DELETE FROM entity_temporal_metadata AS metadata
                USING
                    unnest($1::UUID [], $2::UUID [], $3::TIMESTAMPTZ [])
                        AS targets (web_id, entity_uuid, decision_time)
                WHERE metadata.web_id = targets.web_id
                    AND metadata.entity_uuid = targets.entity_uuid
                    AND metadata.draft_id IS NULL
                    AND metadata.transaction_time @> $4::TIMESTAMPTZ
                    AND metadata.decision_time @> targets.decision_time
                    AND lower(metadata.decision_time) = targets.decision_time;
                ",
            "
                UPDATE entity_temporal_metadata AS metadata
                SET
                    transaction_time = tstzrange($4::TIMESTAMPTZ, NULL, '[)'),
                    decision_time
                    = tstzrange(lower(metadata.decision_time), targets.decision_time, '[)')
                FROM
                    unnest($1::UUID [], $2::UUID [], $3::TIMESTAMPTZ [])
                        AS targets (web_id, entity_uuid, decision_time)
                WHERE metadata.web_id = targets.web_id
                    AND metadata.entity_uuid = targets.entity_uuid
                    AND metadata.draft_id IS NULL
                    AND metadata.transaction_time @> $4::TIMESTAMPTZ
                    AND metadata.decision_time @> targets.decision_time
                    AND lower(metadata.decision_time) < targets.decision_time;
                ",
        ] {
            self.execute_entity_patch_statement(
                statement,
                &[&web_ids, &entity_uuids, &decision_times, &transaction_time],
            )
            .await?;
        }
        let history = live
            .iter()
            .filter_map(|(row, _)| transaction_history_row(row, transaction_time))
            .collect::<Vec<_>>();
        self.insert_entity_patch_rows(&history).await?;
        let editions = live
            .iter()
            .map(|(row, _)| row.entity_edition_id)
            .collect::<Vec<_>>();
        self.execute_entity_patch_statement(
            "
                UPDATE entity_editions
                SET provenance = provenance || jsonb_build_object('archivedById', $2::UUID)
                WHERE entity_edition_id = any($1);
                ",
            &[&editions, &actor_id],
        )
        .await?;
        Ok(())
    }

    /// Applies temporal transitions and inserts all retained history and newly created drafts.
    async fn write_entity_patch_histories(
        &self,
        entities: &mut [Entity],
        writes: &[EntityPatchWrite],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(), Report<UpdateError>> {
        let mut drafts = Vec::new();
        let mut inserts = Vec::new();
        let mut updates = Vec::new();
        for write in writes {
            let entity = entities
                .get_mut(write.index)
                .expect("patch index should identify a prepared entity");
            let end = match write.draft_transition {
                DraftTransition::Create => {
                    let draft_id = DraftId::new(Uuid::new_v4());
                    entity.metadata.record_id.entity_id.draft_id = Some(draft_id);
                    drafts.push(EntityDraftRow {
                        web_id: write.locked_row.entity_id.web_id,
                        entity_uuid: write.locked_row.entity_id.entity_uuid,
                        draft_id,
                    });
                    OpenTemporalBound::Unbounded
                }
                DraftTransition::Update | DraftTransition::Publish => {
                    if matches!(write.draft_transition, DraftTransition::Publish) {
                        entity.metadata.record_id.entity_id.draft_id = None;
                    }
                    inserts.extend(transaction_history_row(&write.locked_row, transaction_time));
                    inserts.extend(decision_history_row(
                        &write.locked_row,
                        transaction_time,
                        write.decision_time,
                    ));
                    updates.push(write);
                    *write.locked_row.decision_time.end()
                }
            };
            entity.metadata.temporal_versioning.transaction_time = LeftClosedTemporalInterval::new(
                ClosedTemporalBound::Inclusive(transaction_time),
                OpenTemporalBound::Unbounded,
            );
            entity.metadata.temporal_versioning.decision_time = LeftClosedTemporalInterval::new(
                ClosedTemporalBound::Inclusive(write.decision_time),
                end,
            );
            if matches!(write.draft_transition, DraftTransition::Create) {
                inserts.push(EntityTemporalMetadataRow {
                    web_id: write.locked_row.entity_id.web_id,
                    entity_uuid: write.locked_row.entity_id.entity_uuid,
                    draft_id: entity.metadata.record_id.entity_id.draft_id,
                    entity_edition_id: entity.metadata.record_id.edition_id,
                    decision_time: entity.metadata.temporal_versioning.decision_time,
                    transaction_time: entity.metadata.temporal_versioning.transaction_time,
                });
            }
        }
        self.insert_entity_patch_rows(&drafts).await?;
        self.update_entity_patch_histories(entities, &updates, transaction_time)
            .await?;
        self.insert_entity_patch_rows(&inserts).await
    }

    /// Replaces each locked temporal row with its prepared edition in one update.
    async fn update_entity_patch_histories(
        &self,
        entities: &[Entity],
        writes: &[&EntityPatchWrite],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(), Report<UpdateError>> {
        if writes.is_empty() {
            return Ok(());
        }
        let web_ids = writes
            .iter()
            .map(|write| write.locked_row.entity_id.web_id)
            .collect::<Vec<_>>();
        let entity_uuids = writes
            .iter()
            .map(|write| write.locked_row.entity_id.entity_uuid)
            .collect::<Vec<_>>();
        let previous_drafts = writes
            .iter()
            .map(|write| write.locked_row.entity_id.draft_id)
            .collect::<Vec<_>>();
        let draft_ids = writes
            .iter()
            .map(|write| {
                entities
                    .get(write.index)
                    .expect("patch index should identify a prepared entity")
                    .metadata
                    .record_id
                    .entity_id
                    .draft_id
            })
            .collect::<Vec<_>>();
        let edition_ids = writes
            .iter()
            .map(|write| {
                entities
                    .get(write.index)
                    .expect("patch index should identify a prepared entity")
                    .metadata
                    .record_id
                    .edition_id
            })
            .collect::<Vec<_>>();
        let decision_times = writes
            .iter()
            .map(|write| write.decision_time)
            .collect::<Vec<_>>();
        let updated = self
            .execute_entity_patch_statement(
                "
                UPDATE entity_temporal_metadata AS metadata
                SET
                    transaction_time = tstzrange($7::TIMESTAMPTZ, NULL, '[)'),
                    decision_time
                    = tstzrange(targets.decision_time, upper(metadata.decision_time), '[)'),
                    entity_edition_id = targets.entity_edition_id,
                    draft_id = targets.draft_id
                FROM
                    unnest(
                        $1::UUID [],
                        $2::UUID [],
                        $3::UUID [],
                        $4::UUID [],
                        $5::UUID [],
                        $6::TIMESTAMPTZ []
                    )
                        AS targets (
                            web_id,
                            entity_uuid,
                            previous_draft_id,
                            draft_id,
                            entity_edition_id,
                            decision_time
                        )
                WHERE metadata.web_id = targets.web_id
                    AND metadata.entity_uuid = targets.entity_uuid
                    AND metadata.draft_id IS NOT DISTINCT FROM targets.previous_draft_id
                    AND metadata.transaction_time @> $7::TIMESTAMPTZ
                    AND metadata.decision_time @> targets.decision_time;
                ",
                &[
                    &web_ids,
                    &entity_uuids,
                    &previous_drafts,
                    &draft_ids,
                    &edition_ids,
                    &decision_times,
                    &transaction_time,
                ],
            )
            .await?;
        ensure!(
            updated == writes.len() as u64,
            Report::new(UpdateError)
                .attach("The entity patch updated an unexpected number of temporal rows")
        );
        Ok(())
    }
}
