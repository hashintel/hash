use core::ops::AddAssign;
use std::collections::{HashMap, HashSet, hash_map::Entry};

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_store::{
    entity::{
        DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityQueryPath, LinkDeletionBehavior,
    },
    error::DeletionError,
    filter::Filter,
    subgraph::temporal_axes::{PinnedTemporalAxis, QueryTemporalAxes, VariableTemporalAxis},
};
use hash_graph_temporal_versioning::{
    DecisionTime, LimitedTemporalBound, TemporalBound, TemporalTagged as _, Timestamp,
    TransactionTime,
};
use postgres_types::ToSql;
use tokio_postgres::Transaction;
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Entity,
        entity::{
            id::{DraftId, EntityEditionId, EntityUuid},
            provenance::EntityDeletionProvenance,
        },
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use crate::store::{
    AsClient as _, PostgresStore,
    postgres::query::{Distinctness, SelectCompiler},
};

/// Per-table row counts from [`delete_target_data`](PostgresStore::delete_target_data).
#[derive(Default)]
struct SatelliteDeletionCounts {
    is_of_type: u64,
    embeddings: u64,
    temporal_metadata: u64,
    editions: u64,
    drafts: u64,
}

impl AddAssign for SatelliteDeletionCounts {
    fn add_assign(&mut self, rhs: Self) {
        self.is_of_type += rhs.is_of_type;
        self.embeddings += rhs.embeddings;
        self.temporal_metadata += rhs.temporal_metadata;
        self.editions += rhs.editions;
        self.drafts += rhs.drafts;
    }
}

/// Parallel vecs for `UNNEST`-based batch operations on full entities.
struct FullEntityDeletionTarget {
    web_ids: Vec<WebId>,
    entity_uuids: Vec<EntityUuid>,
}

struct DraftOnlyDeletionTarget {
    draft_ids: Vec<DraftId>,
}

#[derive(Clone, Copy)]
enum DeletionTarget<'a> {
    Full(&'a FullEntityDeletionTarget),
    Drafts(&'a DraftOnlyDeletionTarget),
}

/// Entity deletion operations.
///
/// All methods require a transaction to guarantee correctness of the locking protocol:
///
/// 1. [`collect_entity_edition_ids`] acquires `FOR UPDATE` on `entity_temporal_metadata` rows,
///    serializing with concurrent [`patch_entity`] calls (which use `FOR NO KEY UPDATE NOWAIT`).
/// 2. [`lock_entity_ids_for_erase`] acquires `FOR UPDATE` on `entity_ids` rows (erase scope only),
///    serializing with concurrent link creation (which needs `KEY SHARE` for FK checks).
///
/// Without a transaction these locks would be released immediately, defeating the purpose.
///
/// [`collect_entity_edition_ids`]: Self::collect_entity_edition_ids
/// [`lock_entity_ids_for_erase`]: Self::lock_entity_ids_for_erase
/// [`patch_entity`]: hash_graph_store::entity::EntityStore::patch_entity
impl PostgresStore<Transaction<'_>> {
    /// Finds entities matching `filter` and partitions them into full vs draft-only deletions.
    ///
    /// A published match (or a match that subsumes all drafts of a draft-only entity) produces
    /// a [`FullEntityDeletionTarget`]. Draft matches on entities with a published version or
    /// unmatched drafts remain [`DraftOnlyDeletionTarget`].
    async fn select_entities_for_deletion(
        &self,
        filter: &Filter<'_, Entity>,
        include_drafts: bool,
        decision_time: Timestamp<DecisionTime>,
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<(FullEntityDeletionTarget, DraftOnlyDeletionTarget), Report<DeletionError>> {
        let temporal_axes = QueryTemporalAxes::TransactionTime {
            pinned: PinnedTemporalAxis::new(decision_time),
            variable: VariableTemporalAxis::new(
                TemporalBound::Inclusive(transaction_time),
                LimitedTemporalBound::Inclusive(transaction_time),
            ),
        };

        let mut compiler = SelectCompiler::new(Some(&temporal_axes), include_drafts);
        compiler
            .add_filter(filter)
            .change_context(DeletionError::Store)?;

        let web_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::WebId,
            Distinctness::Distinct,
            None,
        );
        let entity_uuid_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::Uuid,
            Distinctness::Distinct,
            None,
        );
        let draft_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::DraftId,
            Distinctness::Distinct,
            None,
        );

        let (statement, parameters) = compiler.compile();

        // Empty draft ID vec → full entity deletion; non-empty → draft-only deletion.
        let mut entity_ids = HashMap::<(WebId, EntityUuid), Vec<DraftId>>::new();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT entities for deletion",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)?
            .try_for_each(|row| {
                let web_id: WebId = row.get(web_id_index);
                let entity_uuid: EntityUuid = row.get(entity_uuid_index);
                let draft_id: Option<DraftId> = row.get(draft_id_index);

                match (entity_ids.entry((web_id, entity_uuid)), draft_id) {
                    (Entry::Vacant(entry), Some(draft_id)) => {
                        entry.insert(vec![draft_id]);
                    }
                    (Entry::Vacant(entry), None) => {
                        entry.insert(Vec::new());
                    }
                    (Entry::Occupied(mut entry), Some(draft_id)) => {
                        let tracked = entry.get_mut();
                        if !tracked.is_empty() {
                            tracked.push(draft_id);
                        }
                    }
                    (Entry::Occupied(mut entry), None) => {
                        entry.get_mut().clear();
                    }
                }

                async { Ok(()) }
            })
            .await
            .change_context(DeletionError::Store)?;

        if include_drafts {
            self.promote_draft_only_entities(&mut entity_ids).await?;
        }

        let mut full_web_ids = Vec::new();
        let mut full_entity_uuids = Vec::new();
        let mut draft_ids = Vec::new();

        for ((web_id, entity_uuid), drafts) in entity_ids {
            if drafts.is_empty() {
                full_web_ids.push(web_id);
                full_entity_uuids.push(entity_uuid);
            } else {
                draft_ids.extend(drafts);
            }
        }

        Ok((
            FullEntityDeletionTarget {
                web_ids: full_web_ids,
                entity_uuids: full_entity_uuids,
            },
            DraftOnlyDeletionTarget { draft_ids },
        ))
    }

    /// Promotes draft-only entities to full deletes when eligible.
    ///
    /// An entity is promoted when all its drafts are in the matched set and no published version
    /// exists, so that deletion provenance can be stamped on `entity_ids`.
    async fn promote_draft_only_entities(
        &self,
        entity_ids: &mut HashMap<(WebId, EntityUuid), Vec<DraftId>>,
    ) -> Result<(), Report<DeletionError>> {
        let (draft_only_web_ids, draft_only_entity_uuids) = entity_ids
            .iter()
            .filter(|(_, drafts)| !drafts.is_empty())
            .map(|((web_id, entity_uuid), _)| (*web_id, *entity_uuid))
            .collect::<(Vec<WebId>, Vec<EntityUuid>)>();

        if draft_only_web_ids.is_empty() {
            return Ok(());
        }

        let all_matched_draft_ids = entity_ids
            .iter()
            .filter(|(_, drafts)| !drafts.is_empty())
            .flat_map(|(_, drafts)| drafts.iter().copied())
            .collect::<Vec<DraftId>>();

        // Entities that have a published version or drafts outside our matched set.
        let entities_with_remaining_data = self
            .as_client()
            .query_raw(
                "SELECT DISTINCT web_id, entity_uuid
                 FROM entity_temporal_metadata
                 WHERE (web_id, entity_uuid) IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )
                 AND (draft_id IS NULL
                      OR NOT (draft_id = ANY($3::UUID[])))",
                [
                    &draft_only_web_ids as &(dyn ToSql + Sync),
                    &draft_only_entity_uuids,
                    &all_matched_draft_ids,
                ],
            )
            .instrument(tracing::info_span!(
                "SELECT entities with remaining data",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)?
            .map_ok(|row| {
                let web_id: WebId = row.get(0);
                let entity_uuid: EntityUuid = row.get(1);
                (web_id, entity_uuid)
            })
            .try_collect::<HashSet<(WebId, EntityUuid)>>()
            .await
            .change_context(DeletionError::Store)?;

        for (web_id, entity_uuid) in draft_only_web_ids.iter().zip(&draft_only_entity_uuids) {
            let key = (*web_id, *entity_uuid);
            if !entities_with_remaining_data.contains(&key)
                && let Some(drafts) = entity_ids.get_mut(&key)
            {
                drafts.clear();
            }
        }

        Ok(())
    }

    /// Collects edition IDs and acquires `FOR UPDATE` locks on `entity_temporal_metadata` rows.
    ///
    /// The `FOR UPDATE` lock serializes with concurrent [`patch_entity`] calls, which acquire
    /// `FOR NO KEY UPDATE NOWAIT` via [`lock_entity_edition`]. This means:
    ///
    /// - If we lock first, the concurrent patch immediately fails with `RaceConditionOnUpdate`.
    /// - If the patch locks first, we block until it commits. Since this is a separate statement
    ///   from [`select_entities_for_deletion`], it gets a fresh `READ COMMITTED` snapshot that
    ///   includes any edition IDs the patch inserted.
    ///
    /// The result may contain duplicate edition IDs (no `DISTINCT`, incompatible with
    /// `FOR UPDATE`). Downstream `DELETE ... WHERE entity_edition_id = ANY(...)` handles
    /// duplicates correctly.
    ///
    /// [`patch_entity`]: hash_graph_store::entity::EntityStore::patch_entity
    /// [`lock_entity_edition`]: PostgresStore::lock_entity_edition
    /// [`select_entities_for_deletion`]: Self::select_entities_for_deletion
    async fn collect_entity_edition_ids(
        &mut self,
        target: DeletionTarget<'_>,
    ) -> Result<Vec<EntityEditionId>, Report<DeletionError>> {
        let rows = match target {
            DeletionTarget::Full(entities) => self
                .as_mut_client()
                .query(
                    "SELECT entity_edition_id FROM entity_temporal_metadata
                     WHERE (web_id, entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )
                     FOR UPDATE",
                    &[&entities.web_ids, &entities.entity_uuids],
                )
                .instrument(tracing::info_span!(
                    "SELECT entity_edition_ids FOR UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store)?,
            DeletionTarget::Drafts(drafts) => self
                .as_mut_client()
                .query(
                    "SELECT entity_edition_id FROM entity_temporal_metadata
                     WHERE draft_id = ANY($1::UUID[])
                     FOR UPDATE",
                    &[&drafts.draft_ids],
                )
                .instrument(tracing::info_span!(
                    "SELECT entity_edition_ids FOR UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store)?,
        };
        Ok(rows
            .into_iter()
            .map(|row| row.get::<_, EntityEditionId>(0))
            .collect())
    }

    async fn delete_entity_embeddings(
        &mut self,
        target: DeletionTarget<'_>,
    ) -> Result<u64, Report<DeletionError>> {
        match target {
            DeletionTarget::Full(entities) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_embeddings
                     WHERE (web_id, entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )",
                    &[&entities.web_ids, &entities.entity_uuids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_embeddings",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
            DeletionTarget::Drafts(drafts) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_embeddings
                     WHERE draft_id = ANY($1::UUID[])",
                    &[&drafts.draft_ids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_embeddings",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
        }
    }

    async fn delete_entity_is_of_type(
        &mut self,
        edition_ids: &[EntityEditionId],
    ) -> Result<u64, Report<DeletionError>> {
        self.as_mut_client()
            .execute(
                "DELETE FROM entity_is_of_type
                 WHERE entity_edition_id = ANY($1::UUID[])",
                &[&edition_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE entity_is_of_type",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)
    }

    async fn delete_entity_temporal_metadata(
        &mut self,
        target: DeletionTarget<'_>,
    ) -> Result<u64, Report<DeletionError>> {
        match target {
            DeletionTarget::Full(entities) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_temporal_metadata
                     WHERE (web_id, entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )",
                    &[&entities.web_ids, &entities.entity_uuids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_temporal_metadata",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
            DeletionTarget::Drafts(drafts) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_temporal_metadata
                     WHERE draft_id = ANY($1::UUID[])",
                    &[&drafts.draft_ids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_temporal_metadata",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
        }
    }

    async fn delete_entity_editions(
        &mut self,
        edition_ids: &[EntityEditionId],
    ) -> Result<u64, Report<DeletionError>> {
        self.as_mut_client()
            .execute(
                "DELETE FROM entity_editions
                 WHERE entity_edition_id = ANY($1::UUID[])",
                &[&edition_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE entity_editions",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)
    }

    async fn delete_entity_drafts(
        &mut self,
        target: DeletionTarget<'_>,
    ) -> Result<u64, Report<DeletionError>> {
        match target {
            DeletionTarget::Full(entities) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_drafts
                     WHERE (web_id, entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )",
                    &[&entities.web_ids, &entities.entity_uuids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_drafts",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
            DeletionTarget::Drafts(drafts) => self
                .as_mut_client()
                .execute(
                    "DELETE FROM entity_drafts
                     WHERE draft_id = ANY($1::UUID[])",
                    &[&drafts.draft_ids],
                )
                .instrument(tracing::info_span!(
                    "DELETE entity_drafts",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(DeletionError::Store),
        }
    }

    /// Removes all `entity_edge` rows belonging to entities in the deletion batch.
    ///
    /// Each link relationship is denormalized into four rows (two per endpoint): an `outgoing` row
    /// (`source=link, target=endpoint`) and a paired `incoming` row (`source=endpoint,
    /// target=link`). This deletes exactly the rows owned by batch entities:
    /// - `source IN (batch) AND direction = 'outgoing'` — the canonical outgoing edges
    /// - `target IN (batch) AND direction = 'incoming'` — the denormalized incoming copies
    ///
    /// Rows belonging to link entities *outside* the batch (where the batch entity appears as an
    /// endpoint) are intentionally preserved — the tombstone in `entity_ids` satisfies their FKs.
    ///
    /// # Invariant
    ///
    /// Correctness depends on outgoing/incoming edges always being created in pairs. For every
    /// `(source=endpoint, target=link, direction='incoming')` row there must exist a corresponding
    /// `(source=link, target=endpoint, direction='outgoing')` row. If this pairing is broken
    /// (e.g. by direct DB manipulation), [`count_incoming_links`](Self::count_incoming_links) may
    /// miss the orphaned incoming row and [`delete_entity_ids`](Self::delete_entity_ids) will fail
    /// with an FK violation. This invariant is enforced by application code in `create_entities`,
    /// not by a database constraint.
    ///
    /// Only applies to full entity deletions (`entity_edge` has no `draft_id`).
    async fn delete_entity_edge(
        &mut self,
        target: &FullEntityDeletionTarget,
    ) -> Result<u64, Report<DeletionError>> {
        self.as_mut_client()
            .execute(
                "DELETE FROM entity_edge
                 WHERE (
                     (source_web_id, source_entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )
                     AND direction = 'outgoing'
                 )
                 OR (
                     (target_web_id, target_entity_uuid) IN (
                         SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                     )
                     AND direction = 'incoming'
                 )",
                &[&target.web_ids, &target.entity_uuids],
            )
            .instrument(tracing::info_span!(
                "DELETE entity_edge",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)
    }

    /// Counts incoming links from entities outside the deletion batch.
    ///
    /// Only counts `direction = 'outgoing'` edges — these represent real link
    /// relationships (a link entity's edge to its endpoint). Denormalized
    /// `direction = 'incoming'` edges (stored for query optimization) are excluded
    /// because they don't represent independent link relationships and are cleaned
    /// up by [`delete_entity_edge`](Self::delete_entity_edge).
    ///
    /// # Invariant
    ///
    /// This check is sufficient to guard [`delete_entity_ids`](Self::delete_entity_ids) only if
    /// every `direction = 'incoming'` row has a paired `direction = 'outgoing'` row (see
    /// [`delete_entity_edge`](Self::delete_entity_edge) for details). If the pairing invariant is
    /// violated, an orphaned incoming row (`source = batch_entity`) would not be counted here but
    /// would still cause an FK violation when `entity_ids` is deleted.
    async fn count_incoming_links(
        &self,
        target: &FullEntityDeletionTarget,
    ) -> Result<u64, Report<DeletionError>> {
        let row = self
            .as_client()
            .query_one(
                "SELECT COUNT(*) FROM entity_edge
                 WHERE (target_web_id, target_entity_uuid) IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )
                 AND (source_web_id, source_entity_uuid) NOT IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )
                 AND direction = 'outgoing'",
                &[&target.web_ids, &target.entity_uuids],
            )
            .instrument(tracing::info_span!(
                "SELECT COUNT incoming_links",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)?;
        Ok(row.get::<_, i64>(0).cast_unsigned())
    }

    /// Merges [`EntityDeletionProvenance`] into the existing `entity_ids` provenance JSONB.
    async fn update_entity_ids_provenance(
        &mut self,
        target: &FullEntityDeletionTarget,
        actor_id: ActorEntityUuid,
        decision_time: Timestamp<DecisionTime>,
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<u64, Report<DeletionError>> {
        let provenance = EntityDeletionProvenance {
            deleted_by_id: actor_id,
            deleted_at_transaction_time: transaction_time,
            deleted_at_decision_time: decision_time,
        };
        self.as_mut_client()
            .execute(
                "UPDATE entity_ids
                 SET provenance = provenance || $3::jsonb
                 WHERE (web_id, entity_uuid) IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )",
                &[
                    &target.web_ids,
                    &target.entity_uuids,
                    &postgres_types::Json(&provenance),
                ],
            )
            .instrument(tracing::info_span!(
                "UPDATE entity_ids provenance",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)
    }

    /// Acquires `FOR UPDATE` locks on `entity_ids` rows to serialize with concurrent link
    /// creation (erase scope only).
    ///
    /// Concurrent `INSERT INTO entity_edge` performs an FK check that acquires a `KEY SHARE` lock
    /// on the referenced `entity_ids` row. Our `FOR UPDATE` lock conflicts with `KEY SHARE`,
    /// blocking the concurrent insert until we commit — at which point the row is gone and their
    /// insert fails with an FK violation.
    ///
    /// This closes the TOCTOU gap between [`count_incoming_links`](Self::count_incoming_links)
    /// (which reads `entity_edge`) and [`delete_entity_ids`](Self::delete_entity_ids) (which
    /// removes the row). Without this lock, a concurrent transaction can insert an edge targeting
    /// our entity between the check and the delete, causing a raw FK violation instead of a clean
    /// [`DeletionError::IncomingLinksExist`].
    ///
    /// Not needed for purge scope: the tombstoned `entity_ids` row satisfies FK checks from
    /// concurrent link creation, so no lock conflict is required.
    async fn lock_entity_ids_for_erase(
        &mut self,
        target: &FullEntityDeletionTarget,
    ) -> Result<(), Report<DeletionError>> {
        self.as_mut_client()
            .query(
                "SELECT 1 FROM entity_ids
                 WHERE (web_id, entity_uuid) IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )
                 FOR UPDATE",
                &[&target.web_ids, &target.entity_uuids],
            )
            .instrument(tracing::info_span!(
                "LOCK entity_ids FOR UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)?;
        Ok(())
    }

    /// Removes `entity_ids` rows entirely (erase scope, no tombstone).
    async fn delete_entity_ids(
        &mut self,
        target: &FullEntityDeletionTarget,
    ) -> Result<u64, Report<DeletionError>> {
        self.as_mut_client()
            .execute(
                "DELETE FROM entity_ids
                 WHERE (web_id, entity_uuid) IN (
                     SELECT * FROM UNNEST($1::UUID[], $2::UUID[])
                 )",
                &[&target.web_ids, &target.entity_uuids],
            )
            .instrument(tracing::info_span!(
                "DELETE entity_ids",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError::Store)
    }

    /// Deletes per-table data in FK-safe order for a single [`DeletionTarget`].
    ///
    /// Returns per-table row counts for the caller to log.
    async fn delete_target_data(
        &mut self,
        target: DeletionTarget<'_>,
    ) -> Result<SatelliteDeletionCounts, Report<DeletionError>> {
        let edition_ids = self.collect_entity_edition_ids(target).await?;
        let is_of_type = self.delete_entity_is_of_type(&edition_ids).await?;
        let embeddings = self.delete_entity_embeddings(target).await?;
        let temporal_metadata = self.delete_entity_temporal_metadata(target).await?;
        let editions = self.delete_entity_editions(&edition_ids).await?;
        let drafts = self.delete_entity_drafts(target).await?;

        Ok(SatelliteDeletionCounts {
            is_of_type,
            embeddings,
            temporal_metadata,
            editions,
            drafts,
        })
    }

    /// Selects matching entities, validates link constraints, deletes all associated data,
    /// and either tombstones (purge) or fully removes (erase) `entity_ids`.
    ///
    /// # Errors
    ///
    /// - [`InvalidDecisionTime`] if `decision_time` exceeds `transaction_time`
    /// - [`IncomingLinksExist`] if incoming links exist and [`LinkDeletionBehavior::Error`] or
    ///   [`DeletionScope::Erase`] is requested
    /// - [`Store`] if a database operation fails
    ///
    /// [`InvalidDecisionTime`]: DeletionError::InvalidDecisionTime
    /// [`IncomingLinksExist`]: DeletionError::IncomingLinksExist
    /// [`Store`]: DeletionError::Store
    pub(super) async fn execute_entity_deletion(
        &mut self,
        actor_id: ActorEntityUuid,
        params: DeleteEntitiesParams<'_>,
    ) -> Result<DeletionSummary, Report<DeletionError>> {
        let transaction_time = Timestamp::<TransactionTime>::now();
        let decision_time = params
            .decision_time
            .unwrap_or_else(|| transaction_time.cast());

        if decision_time > transaction_time.cast() {
            return Err(Report::new(DeletionError::InvalidDecisionTime));
        }

        let (full_target, draft_target) = self
            .select_entities_for_deletion(
                &params.filter,
                params.include_drafts,
                decision_time,
                transaction_time,
            )
            .await?;

        let summary = DeletionSummary {
            full_entities: full_target.web_ids.len(),
            draft_deletions: draft_target.draft_ids.len(),
        };

        if summary.full_entities == 0 && summary.draft_deletions == 0 {
            return Ok(summary);
        }

        if summary.full_entities > 0 {
            if matches!(params.scope, DeletionScope::Erase) {
                self.lock_entity_ids_for_erase(&full_target).await?;
            }

            let should_check = match &params.scope {
                DeletionScope::Purge { link_behavior } => {
                    matches!(link_behavior, LinkDeletionBehavior::Error)
                }
                DeletionScope::Erase => true,
            };
            if should_check {
                let count = self.count_incoming_links(&full_target).await?;
                if count > 0 {
                    return Err(Report::new(DeletionError::IncomingLinksExist { count }));
                }
            }
        }

        let mut satellite_counts = SatelliteDeletionCounts::default();
        if summary.full_entities > 0 {
            satellite_counts += self
                .delete_target_data(DeletionTarget::Full(&full_target))
                .await?;
        }
        if summary.draft_deletions > 0 {
            satellite_counts += self
                .delete_target_data(DeletionTarget::Drafts(&draft_target))
                .await?;
        }

        let mut entity_edge = 0_u64;
        let mut entity_ids_affected = 0_u64;
        if summary.full_entities > 0 {
            entity_edge = self.delete_entity_edge(&full_target).await?;

            let expected = full_target.web_ids.len() as u64;
            match params.scope {
                DeletionScope::Purge { .. } => {
                    entity_ids_affected = self
                        .update_entity_ids_provenance(
                            &full_target,
                            actor_id,
                            decision_time,
                            transaction_time,
                        )
                        .await?;
                    if entity_ids_affected != expected {
                        return Err(Report::new(DeletionError::InconsistentEntityIds {
                            expected,
                            actual: entity_ids_affected,
                        }));
                    }
                }
                DeletionScope::Erase => {
                    entity_ids_affected = self.delete_entity_ids(&full_target).await?;
                    if entity_ids_affected != expected {
                        return Err(Report::new(DeletionError::InconsistentEntityIds {
                            expected,
                            actual: entity_ids_affected,
                        }));
                    }
                }
            }
        }

        tracing::trace!(
            full_entities = summary.full_entities,
            draft_deletions = summary.draft_deletions,
            is_of_type = satellite_counts.is_of_type,
            embeddings = satellite_counts.embeddings,
            temporal_metadata = satellite_counts.temporal_metadata,
            editions = satellite_counts.editions,
            drafts = satellite_counts.drafts,
            entity_edge,
            entity_ids_affected,
            "entity deletion complete"
        );

        Ok(summary)
    }
}
