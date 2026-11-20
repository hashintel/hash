pub(crate) mod current;
mod record;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) use self::record::RunRecord;
use crate::storage::{CasVersion, Storage};

/// Identifies one run of an integration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, derive_more::Display)]
#[serde(transparent)]
pub struct RunId(Uuid);

impl RunId {
    /// A new run id, a random UUID.
    #[expect(
        clippy::new_without_default,
        reason = "a run id is made for a new run, it has no default"
    )]
    #[must_use]
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

/// Reports why the state of a run could not be read or written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum RunError {
    #[display("the run has no `run.json`")]
    NotFound,
    #[display("the file is not a `run.json` or `current.json`")]
    Unreadable,
    #[display("the file changed since it was read")]
    Changed,
    #[display("`current.json` names another run")]
    NotActive,
    #[display("the bucket could not be read or written")]
    Storage,
}

/// The key of the run's record.
pub(crate) fn run_file(run: RunId) -> String {
    format!("runs/{run}/run.json")
}

/// The key of the capture file of the table `source`.
pub(crate) fn capture_file(run: RunId, source: &SourceName) -> String {
    format!("runs/{run}/capture/{source}.parquet")
}

/// The key of the file of the issues Prepare noted.
pub(crate) fn issues_file(run: RunId) -> String {
    format!("runs/{run}/issues.jsonl")
}

/// Reads the record of `run` and its version, which [`save`] compares before it writes.
///
/// # Errors
///
/// - [`RunError::NotFound`] if the run has no `run.json`
/// - [`RunError::Unreadable`] if the file is not a run record
/// - [`RunError::Storage`] if the bucket cannot be read
pub(crate) async fn load(
    storage: &Storage,
    run: RunId,
) -> Result<(RunRecord, CasVersion), Report<RunError>> {
    let (bytes, version) = storage
        .read_versioned(&run_file(run))
        .await
        .change_context(RunError::Storage)?
        .ok_or_else(|| Report::new(RunError::NotFound))?;
    let record = serde_json::from_slice(&bytes).change_context(RunError::Unreadable)?;
    Ok((record, version))
}

/// Writes `record` to its `run.json` if the file still has the version `expected`, or creates
/// the file if `expected` is `None`.
///
/// # Errors
///
/// - [`RunError::Changed`] if the file has another version, or exists when `expected` is `None`.
///   Nothing is written.
/// - [`RunError::Storage`] if the bucket cannot be written
pub(crate) async fn save(
    storage: &Storage,
    record: &RunRecord,
    expected: Option<&CasVersion>,
) -> Result<(), Report<RunError>> {
    let bytes = serde_json::to_vec_pretty(record).expect("a run record should serialize to JSON");
    let written = storage
        .replace_if(&run_file(record.input.run), expected, bytes)
        .await
        .change_context(RunError::Storage)?;
    if written {
        Ok(())
    } else {
        Err(Report::new(RunError::Changed))
    }
}
