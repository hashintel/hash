//! Send, the third stage: writes a run's rows of the sync table to the Graph, records what the
//! Graph did in the `send` part of `run.json`, and then names the run as the last completed run
//! of its integration.
//!
//! The rows are cut into batches by a [`Plan`], and [`Delivery`] sends them through the
//! [`GraphClient`], falling back to single writes for a batch the Graph refuses.

mod client;
mod delivery;
mod plan;
mod request;
mod tally;
#[cfg(test)]
mod testing;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::provenance::ProvidedEntityEditionProvenance,
    provenance::{Location, SourceProvenance, SourceType},
};

pub use self::client::{GraphClient, GraphError};
use self::{delivery::Delivery, plan::Plan, request::integration_provenance};
use crate::{
    run::{RunId, RunRecord, SendPart, Stage, current},
    stage::{
        StageError, begin, end,
        failure::{from_run, permanent, retryable},
    },
    storage::Storage,
    sync_table::{self, SyncRow, SyncTableError},
};

/// The failure code for a row of the sync table that cannot be read, or whose bodies cannot be
/// built. The sync table also reports a storage without a bucket, or a table that is not a sync
/// table, as a row it cannot read.
const ROW_INVALID: &str = "send_row_invalid";
/// The failure code for a sync table that holds another number of the run's rows than Prepare
/// wrote.
const ROWS_MISSING: &str = "send_rows_missing";

/// Sends `run`: writes its rows of the sync table to `graph` as the run's actor.
///
/// The counts and the entities the Graph refused are written to the `send` part of `run.json`,
/// and then `current.json` names the run as the last completed run. A run that has its `send`
/// part is not sent again: Send only completes it in `current.json`, so a second Send of a
/// completed run sends nothing.
///
/// # Errors
///
/// - [`StageError::Permanent`] if a row of the sync table cannot be read or its bodies cannot be
///   built (`send_row_invalid`), the table holds another number of the run's rows than Prepare
///   wrote (`send_rows_missing`), or the storage has no bucket or its table is not a sync table
///   (`send_row_invalid`). The code is recorded in the `failure` part of `run.json`.
/// - [`StageError::Permanent`], with nothing written, if `run.json` is missing or unreadable, the
///   run has a `failure` part, or `current.json` is unreadable or names `run` neither as the active
///   nor as the last completed run
/// - [`StageError::NotReady`] if the run has not been prepared
/// - [`StageError::Retryable`] if the bucket or the Graph is not available, or `run.json` or
///   `current.json` changed while Send worked. Sending the run again ends with the same entities in
///   the Graph.
pub async fn send(
    storage: &Storage,
    run: RunId,
    graph: &GraphClient,
) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Send).await?;
    if open.record.send.is_none() {
        let result = RunSend {
            storage,
            record: &open.record,
            graph,
        }
        .deliver()
        .await
        .map(|part| open.record.send = Some(part));
        end(storage, open, result).await?;
    }
    current::complete(storage, run)
        .await
        .map_err(|report| from_run(Stage::Send, report))
}

/// One attempt to send a run: the storage it is read from, its record, and the Graph it is sent
/// to.
struct RunSend<'run> {
    storage: &'run Storage,
    record: &'run RunRecord,
    graph: &'run GraphClient,
}

impl RunSend<'_> {
    /// Sends the run's rows and returns the `send` part. Every error of reading, planning and
    /// delivering the rows becomes a stage error here.
    async fn deliver(&self) -> Result<SendPart, Report<StageError>> {
        let rows = self.rows().await?;
        let plan = Plan::new(&rows, &self.provenance(), self.record.batch)
            .change_context(permanent(Stage::Send, ROW_INVALID))?;
        let part = Delivery::new(self.graph, self.record.input.actor)
            .deliver(&plan)
            .await
            .change_context(retryable(Stage::Send))?;
        if part.failed.is_empty() {
            tracing::info!(
                run = %self.record.input.run,
                created = part.created,
                updated = part.updated,
                archived = part.archived,
                "sent the run"
            );
        } else {
            tracing::warn!(
                run = %self.record.input.run,
                created = part.created,
                updated = part.updated,
                archived = part.archived,
                failed = part.failed.len(),
                "sent the run, and the Graph refused some of its writes"
            );
        }
        Ok(part)
    }

    /// The run's rows of the sync table, as many as Prepare wrote.
    async fn rows(&self) -> Result<Vec<SyncRow>, Report<StageError>> {
        let prepared = self
            .record
            .prepare
            .as_ref()
            .ok_or_else(|| Report::new(StageError::NotReady { stage: Stage::Send }))?
            .rows;
        let rows = sync_table::read(self.storage, self.record.input.run)
            .await
            .map_err(|report| {
                let context = match report.current_context() {
                    SyncTableError::Storage => retryable(Stage::Send),
                    SyncTableError::Invalid => permanent(Stage::Send, ROW_INVALID),
                };
                report.change_context(context)
            })?;
        if rows.len() as u64 != prepared {
            return Err(
                Report::new(permanent(Stage::Send, ROWS_MISSING)).attach(format!(
                    "the sync table holds {} rows of the run, and Prepare wrote {prepared}",
                    rows.len()
                )),
            );
        }
        Ok(rows)
    }

    /// The provenance of every body of the run: the connector is its source's location, and the
    /// time the run was submitted is its load time.
    fn provenance(&self) -> ProvidedEntityEditionProvenance {
        integration_provenance(SourceProvenance {
            ty: SourceType::Integration,
            entity_id: None,
            authors: Vec::new(),
            location: Some(Location {
                name: Some(self.record.input.connector.to_string()),
                uri: None,
                description: None,
            }),
            first_published: None,
            last_updated: None,
            loaded_at: Some(self.record.input.submitted_at),
        })
    }
}
