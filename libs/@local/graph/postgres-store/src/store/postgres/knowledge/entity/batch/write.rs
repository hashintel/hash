use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::UpdateError;
use tokio_postgres::GenericClient as _;
use type_system::{
    ontology::entity_type::EntityTypeUuid,
    principal::actor::{ActorEntityUuid, ActorId},
};

use super::EntityPatchSet;
use crate::store::{
    AsClient, InTransaction, PostgresStore,
    postgres::{
        knowledge::entity::{
            history::EntityHistory,
            insert_entity_edition_cache_statement,
            provenance::{SqlEntityEditionProvenance, SqlEntityProvenance},
        },
        query::{
            bulk_insert,
            rows::{EntityEditionRow, EntityTemporalMetadataRow, PostgresRow},
        },
    },
};

impl<C: AsClient> PostgresStore<C, InTransaction> {
    /// Flushes a fully resolved batch to the current transaction, including intermediate editions
    /// returned to the caller. Temporal history is persisted in its final state after all patches.
    #[tracing::instrument(level = "info", skip(self, patches))]
    pub(crate) async fn write_entity_patch_set(
        &self,
        actor_id: ActorId,
        patches: &EntityPatchSet,
    ) -> Result<(), Report<UpdateError>> {
        if patches.changed.is_empty() {
            return Ok(());
        }

        let editions: Vec<_> = patches
            .changed_entities()
            .map(|entity| {
                let provenance =
                    SqlEntityEditionProvenance::from(entity.metadata.provenance.edition.clone());
                EntityEditionRow {
                    entity_edition_id: entity.metadata.record_id.edition_id,
                    properties: entity.properties.clone(),
                    archived: entity.metadata.archived,
                    confidence: entity.metadata.confidence,
                    provenance: provenance.json,
                    property_metadata: entity.metadata.properties.clone(),
                    created_by_id: provenance.created_by_id,
                }
            })
            .collect();
        self.insert_rows(&editions).await?;
        self.insert_rows(&patches.drafts).await?;
        self.insert_entity_patch_types(patches).await?;
        self.update_entity_history(&patches.history).await?;
        self.update_entity_patch_provenance(actor_id, patches)
            .await?;
        self.as_client()
            .execute(
                &insert_entity_edition_cache_statement(true),
                &[&patches.changed],
            )
            .await
            .change_context(UpdateError)?;
        Ok(())
    }

    async fn insert_rows<R: PostgresRow + Sync>(
        &self,
        rows: &[R],
    ) -> Result<(), Report<UpdateError>> {
        if rows.is_empty() {
            return Ok(());
        }
        let (statement, parameters) = bulk_insert().rows(rows).compile();
        self.as_client()
            .execute_raw(&statement, parameters)
            .await
            .change_context(UpdateError)?;
        Ok(())
    }

    /// Records inherited types at their shortest inheritance depth alongside direct memberships,
    /// so queries and permission checks use the complete type set for each new edition.
    async fn insert_entity_patch_types(
        &self,
        patches: &EntityPatchSet,
    ) -> Result<(), Report<UpdateError>> {
        let mut edition_ids = Vec::new();
        let mut type_ids = Vec::new();
        for entity in patches.changed_entities() {
            for type_id in &entity.metadata.entity_type_ids {
                edition_ids.push(entity.metadata.record_id.edition_id);
                type_ids.push(EntityTypeUuid::from_url(type_id));
            }
        }
        self.as_client()
            .execute(
                "
                WITH
                    direct_types AS (
                        SELECT *
                        FROM
                            unnest($1::UUID [], $2::UUID []) AS membership (edition_id, type_id)
                    )

                INSERT INTO entity_is_of_type (
                    entity_edition_id, entity_type_ontology_id, inheritance_depth
                )
                SELECT
                    direct_types.edition_id,
                    direct_types.type_id,
                    0 AS inheritance_depth
                FROM direct_types
                UNION ALL
                SELECT
                    direct_types.edition_id,
                    inheritance.target_entity_type_ontology_id,
                    min(inheritance.depth + 1) AS inheritance_depth
                FROM direct_types
                INNER JOIN entity_type_inherits_from AS inheritance
                    ON direct_types.type_id = inheritance.source_entity_type_ontology_id
                GROUP BY direct_types.edition_id, inheritance.target_entity_type_ontology_id
                ",
                &[&edition_ids, &type_ids],
            )
            .await
            .change_context(UpdateError)?;
        Ok(())
    }

    /// Applies the final temporal diff while preserving the non-overlap constraints.
    /// Existing live intervals must be closed before draft rows can become live.
    async fn update_entity_history(
        &self,
        history: &EntityHistory,
    ) -> Result<(), Report<UpdateError>> {
        let removed: Vec<_> = history.removed().cloned().collect();
        if !removed.is_empty() {
            let parameters = EntityTemporalMetadataRow::columnar_parameters(&removed);
            self.as_client()
                .execute_raw(
                    "
                    DELETE FROM entity_temporal_metadata AS temporal
                    USING
                        unnest(
                            $1::UUID [],
                            $2::UUID [],
                            $3::UUID [],
                            $4::UUID [],
                            $5::TSTZRANGE [],
                            $6::TSTZRANGE []
                        )
                            AS previous (
                                web_id, entity_uuid, draft_id, edition_id,
                                decision_time, transaction_time
                            )
                    WHERE temporal.web_id = previous.web_id
                        AND temporal.entity_uuid = previous.entity_uuid
                        AND temporal.draft_id IS NOT DISTINCT FROM previous.draft_id
                        AND temporal.entity_edition_id = previous.edition_id
                        AND temporal.decision_time = previous.decision_time
                        AND temporal.transaction_time = previous.transaction_time
                    ",
                    parameters
                        .into_iter()
                        .map(|(_, column)| column.into_values()),
                )
                .await
                .change_context(UpdateError)?;
        }
        self.update_entity_temporal_rows(
            history
                .updated()
                .filter(|(original, row)| original.draft_id == row.draft_id),
        )
        .await?;
        self.update_entity_temporal_rows(
            history
                .updated()
                .filter(|(original, row)| original.draft_id != row.draft_id),
        )
        .await?;
        let inserted: Vec<_> = history.inserted().cloned().collect();
        self.insert_rows(&inserted).await
    }

    /// Matches updates against the full original interval because an edition can occupy multiple
    /// temporal rows. Each original row must occur only once in the input.
    async fn update_entity_temporal_rows<'a>(
        &self,
        rows: impl Iterator<Item = (&'a EntityTemporalMetadataRow, &'a EntityTemporalMetadataRow)>
        + Send,
    ) -> Result<(), Report<UpdateError>> {
        let mut previous = Vec::new();
        let mut updated = Vec::new();
        for (original, row) in rows {
            previous.push(original.clone());
            updated.push(row.clone());
        }
        if !updated.is_empty() {
            let mut parameters = EntityTemporalMetadataRow::columnar_parameters(&previous);
            parameters.extend(EntityTemporalMetadataRow::columnar_parameters(&updated));
            self.as_client()
                .execute_raw(
                    "
                    UPDATE entity_temporal_metadata AS temporal
                    SET
                        draft_id = updates.draft_id,
                        entity_edition_id = updates.edition_id,
                        decision_time = updates.decision_time,
                        transaction_time = updates.transaction_time
                    FROM
                        unnest(
                            $1::UUID [], $2::UUID [], $3::UUID [], $4::UUID [],
                            $5::TSTZRANGE [], $6::TSTZRANGE [],
                            $7::UUID [], $8::UUID [], $9::UUID [], $10::UUID [],
                            $11::TSTZRANGE [], $12::TSTZRANGE []
                        ) AS updates (
                            previous_web_id, previous_entity_uuid, previous_draft_id,
                            previous_edition_id, previous_decision_time, previous_transaction_time,
                            web_id, entity_uuid, draft_id, edition_id,
                            decision_time, transaction_time
                        )
                    WHERE temporal.web_id = updates.previous_web_id
                        AND temporal.entity_uuid = updates.previous_entity_uuid
                        AND temporal.draft_id IS NOT DISTINCT FROM updates.previous_draft_id
                        AND temporal.entity_edition_id = updates.previous_edition_id
                        AND temporal.decision_time = updates.previous_decision_time
                        AND temporal.transaction_time = updates.previous_transaction_time
                    ",
                    parameters
                        .into_iter()
                        .map(|(_, column)| column.into_values()),
                )
                .await
                .change_context(UpdateError)?;
        }
        Ok(())
    }

    /// Keeps first-publication timestamps on the entity and records who archived each live edition
    /// superseded by draft publication.
    async fn update_entity_patch_provenance(
        &self,
        actor_id: ActorId,
        patches: &EntityPatchSet,
    ) -> Result<(), Report<UpdateError>> {
        if !patches.publications.is_empty() {
            let mut web_ids = Vec::new();
            let mut entity_uuids = Vec::new();
            let mut provenance = Vec::new();
            for (id, publication) in &patches.publications {
                web_ids.push(id.web_id);
                entity_uuids.push(id.entity_uuid);
                provenance.push(SqlEntityProvenance::from(publication.clone()).json);
            }
            self.as_client()
                .execute(
                    "
                    UPDATE entity_ids
                    SET provenance = entity_ids.provenance || published.provenance
                    FROM
                        unnest($1::UUID [], $2::UUID [], $3::JSONB [])
                            AS published (web_id, entity_uuid, provenance)
                    WHERE entity_ids.web_id = published.web_id
                        AND entity_ids.entity_uuid = published.entity_uuid
                    ",
                    &[&web_ids, &entity_uuids, &provenance],
                )
                .await
                .change_context(UpdateError)?;
        }
        if !patches.archived.is_empty() {
            let archived: Vec<_> = patches.archived.iter().copied().collect();
            self.as_client()
                .execute(
                    "
                    UPDATE entity_editions
                    SET provenance = provenance || jsonb_build_object('archivedById', $2::UUID)
                    WHERE entity_edition_id = any($1::UUID [])
                    ",
                    &[&archived, &ActorEntityUuid::from(actor_id)],
                )
                .await
                .change_context(UpdateError)?;
        }
        Ok(())
    }
}
