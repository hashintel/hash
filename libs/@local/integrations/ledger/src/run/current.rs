//! Reads and conditionally writes `current.json`, the status of the integration.

use error_stack::Report;
use serde::{Deserialize, Serialize};

use super::{RunContext, RunId, StageError, store::MutableVersion};

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

/// Reads `current.json` and its version. An integration without the file has no runs.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be read
/// - [`Code::StoredJsonInvalid`] if the stored file is not a [`Current`]
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
/// [`Code::StoredJsonInvalid`]: super::Code::StoredJsonInvalid
pub(crate) async fn read(
    context: &RunContext,
) -> Result<(Current, Option<MutableVersion>), Report<StageError>> {
    unimplemented!()
}

/// Writes `current` to `current.json` if the stored file still has the version `expected`.
///
/// Returns `false` if another writer changed the file first.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be written
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
pub(crate) async fn write(
    context: &RunContext,
    current: &Current,
    expected: Option<&MutableVersion>,
) -> Result<bool, Report<StageError>> {
    unimplemented!()
}
