use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::UpdateError;
use tokio_postgres::GenericClient as _;

use crate::store::{
    AsClient, InTransaction, PostgresStore,
    postgres::{
        knowledge::entity::history::EntityHistory,
        query::{
            bulk_insert,
            rows::{EntityTemporalMetadataRow, PostgresRow},
        },
    },
};

impl<C: AsClient> PostgresStore<C, InTransaction> {
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

    /// Applies the final temporal diff while preserving the non-overlap constraints.
    /// Existing live intervals must be closed before draft rows can become live.
    pub(crate) async fn update_entity_history(
        &self,
        history: &EntityHistory,
    ) -> Result<(), Report<UpdateError>> {
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
}
