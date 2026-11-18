//! Reads and writes `current.json`, the status of the integration.

use error_stack::Report;
use serde::{Deserialize, Serialize};

use super::{RunContext, RunId, StageError};

/// The contents of `current.json`.
///
/// Runs of one integration are strictly sequential: a run becomes active only when no other run
/// is active.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Current {
    /// The run that has started and has not completed.
    pub active: Option<RunId>,
    /// The last run that completed all three stages.
    pub last_completed: Option<RunId>,
}

/// Reads `current.json`. An integration without the file has no runs.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be read
/// - [`Code::StoredJsonInvalid`] if the stored file is not a [`Current`]
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
/// [`Code::StoredJsonInvalid`]: super::Code::StoredJsonInvalid
pub(crate) async fn read(context: &RunContext) -> Result<Current, Report<StageError>> {
    unimplemented!()
}

/// Sets `run` as the active run. A run that is already active stays active.
///
/// # Errors
///
/// - [`Code::RunActive`] if another run is active
/// - [`Code::StorageUnavailable`] if storage cannot be read or written, or the write still
///   conflicts after eight attempts
///
/// [`Code::RunActive`]: super::Code::RunActive
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
pub(super) async fn activate(context: &RunContext, run: RunId) -> Result<(), Report<StageError>> {
    unimplemented!()
}

/// Sets `run` as the last completed run and clears the active run.
///
/// Send calls this after it wrote the send part. A run that is already the last completed run
/// stays so.
///
/// # Errors
///
/// - [`Code::RunActive`] if another run is active
/// - [`Code::StorageUnavailable`] if storage cannot be read or written, or the write still
///   conflicts after eight attempts
///
/// [`Code::RunActive`]: super::Code::RunActive
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
pub(crate) async fn complete(context: &RunContext, run: RunId) -> Result<(), Report<StageError>> {
    unimplemented!()
}
