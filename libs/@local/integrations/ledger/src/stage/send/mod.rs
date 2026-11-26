//! Send, the third stage: writes a run's rows of the sync table to the Graph, records what the
//! Graph did in the `send` part of `run.json`, and then names the run as the last completed run
//! of its integration.

mod batch;
mod client;
mod delivery;
mod request;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _};
use type_system::provenance::{Location, SourceProvenance, SourceType};

pub use self::client::{GraphClient, GraphError};
use self::{
    batch::{Batch, Write},
    delivery::Delivery,
    request::integration_provenance,
};
use crate::{
    run::{RunId, RunRecord, SendPart, Stage, current},
    stage::{
        StageError, begin, end,
        failure::{STORAGE_UNCONFIGURED, from_run, permanent, retryable},
    },
    storage::Storage,
    sync_table::{self, SyncTableError},
};

/// A row of the sync table cannot be read, or its body cannot be built.
const ROW_INVALID: &str = "send_row_invalid";

/// Sends `run`: writes its rows of the sync table to `graph`, acting for the run's actor.
///
/// The counts and the entities the Graph refused are written to the `send` part of `run.json`,
/// and then `current.json` names the run as the last completed run. A run that has its `send`
/// part only writes `current.json`, so a second Send of a completed run sends nothing.
///
/// # Errors
///
/// - [`StageError::Permanent`] with the code `send_row_invalid` in the `failure` part of `run.json`
///   if a row of the sync table cannot be read or its body cannot be built, or without writing if
///   the run cannot be sent: `run.json` is missing or unreadable, the run failed before, or
///   `current.json` names another run
/// - [`StageError::NotReady`] if the run has not been prepared
/// - [`StageError::Retryable`] if the bucket or the Graph is not available, or `run.json` or
///   `current.json` changed while Send worked. Nothing is recorded, and sending the run again ends
///   with the same entities in the Graph.
pub async fn send(
    storage: &Storage,
    run: RunId,
    graph: &GraphClient,
) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Send).await?;
    if open.record.send.is_none() {
        let result = apply(storage, &open.record, graph)
            .await
            .map(|part| open.record.send = Some(part));
        end(storage, open, result).await?;
    }
    current::complete(storage, run)
        .await
        .map_err(|report| from_run(Stage::Send, report))
}

/// Sends the run's rows in batches and returns the `send` part.
async fn apply(
    storage: &Storage,
    record: &RunRecord,
    graph: &GraphClient,
) -> Result<SendPart, Report<StageError>> {
    let rows = sync_table::read(storage, record.input.run)
        .await
        .map_err(|report| {
            let context = match report.current_context() {
                SyncTableError::Storage => retryable(Stage::Send),
                SyncTableError::Invalid => permanent(Stage::Send, ROW_INVALID),
                SyncTableError::Unconfigured => permanent(Stage::Send, STORAGE_UNCONFIGURED),
            };
            report.change_context(context)
        })?;
    // The same provenance for every body of the run: the connector is where the material came
    // from, and the run's submission is when it was loaded.
    let provenance = integration_provenance(SourceProvenance {
        ty: SourceType::Integration,
        entity_id: None,
        authors: Vec::new(),
        location: Some(Location {
            name: Some(record.input.connector.to_string()),
            uri: None,
            description: None,
        }),
        first_published: None,
        last_updated: None,
        loaded_at: Some(record.input.submitted_at),
    });
    let writes = rows
        .into_iter()
        .map(|row| Write::new(row, &provenance))
        .collect::<Result<Vec<_>, _>>()
        .change_context(permanent(Stage::Send, ROW_INVALID))?;

    let delivery = Delivery {
        graph,
        actor: record.input.actor,
        provenance: &provenance,
    };
    let mut part = SendPart {
        created: 0,
        updated: 0,
        archived: 0,
        create_existed: 0,
        update_missing: 0,
        archive_missing: 0,
        failed: Vec::new(),
    };
    for (number, batch) in (0_u32..).zip(Batch::cut(writes, record.batch)) {
        delivery.deliver(number, &batch, &mut part).await?;
    }
    Ok(part)
}
