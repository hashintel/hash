//! Capture, the first stage: appends the rows of each table of a run, as a DuckDB query gives
//! them, to the integration's capture tables.

#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::SourceName;

use super::{StageError, begin, end, failure::from_lake};
use crate::{
    lake::{LakeError, LakeSettings},
    run::{CapturePart, CapturedTable, RunId, Stage},
    storage::Storage,
};

/// A query fails, or gives other columns than its table has.
const QUERY_INVALID: &str = "capture_query_invalid";

/// The column of a capture table that holds each row's position in the rows its query gave.
/// Prepare reads a run's rows in this order.
pub(crate) const SEQUENCE: &str = "_seq";

/// Captures `run`: appends the rows each of `queries` gives to the Delta table `capture/{table}`
/// of its table, as the rows of `run`, and records the table's key and the run's row count in
/// `run.json`.
///
/// `queries` holds one DuckDB query per table, by the table's name, such as
/// `SELECT * FROM read_parquet('…')` or `SELECT * FROM delta_scan('s3://…')`. A query runs with
/// credentials for the integration's place in the bucket, so it comes from the configuration of
/// the integration, not from a definition. A table is created with the columns of its first query,
/// and a later query must give columns of the same names, in any order. Capture does not check the
/// names against the definition; Prepare does. A run that was captured before is left as it is.
///
/// # Errors
///
/// - [`StageError::Permanent`] with the code `capture_query_invalid` if a query fails or gives
///   other columns than its table has, or the code `storage_unconfigured` if the storage has no
///   bucket. Either is recorded in `run.json`.
/// - [`StageError::Permanent`] without writing if the run cannot be captured: it is not the run
///   `current.json` names, it failed before, or its `run.json` is missing or unreadable
/// - [`StageError::Retryable`] if the bucket or DuckDB's extensions cannot be reached. Nothing is
///   recorded, and capturing the run again can succeed.
pub async fn capture(
    storage: &Storage,
    run: RunId,
    queries: &BTreeMap<SourceName, Box<str>>,
) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() {
        return Ok(());
    }
    let result = store(storage, run, queries.clone())
        .await
        .map(|part| open.record.capture = Some(part));
    end(storage, open, result).await
}

/// Appends the rows of each query to its table and returns the `capture` part. Tables appended
/// before a failing one keep the run's rows; a second attempt leaves them as they are.
async fn store(
    storage: &Storage,
    run: RunId,
    queries: BTreeMap<SourceName, Box<str>>,
) -> Result<CapturePart, Report<StageError>> {
    let settings = LakeSettings::of(storage).map_err(capture_failed)?;
    settings
        .run(capture_failed, move |lake| {
            let mut sources = BTreeMap::new();
            for (source, query) in &queries {
                let key = format!("capture/{source}");
                let table = lake.table(&key).map_err(capture_failed)?;
                let rows = if table.has_run(run).map_err(capture_failed)? {
                    table.rows(run)
                } else {
                    // The query runs before anything is written, so a query that fails leaves
                    // no table behind.
                    lake.stage_query(query)
                        .map(|staged| staged.numbered(SEQUENCE))
                        .and_then(|staged| table.append_run(run, &staged))
                }
                .map_err(capture_failed)?;
                sources.insert(
                    source.as_ref().into(),
                    CapturedTable {
                        key: key.into(),
                        rows,
                    },
                );
            }
            Ok(CapturePart { sources })
        })
        .await
}

/// What an error of the lake means for Capture.
fn capture_failed(report: Report<LakeError>) -> Report<StageError> {
    from_lake(Stage::Capture, QUERY_INVALID, report)
}
