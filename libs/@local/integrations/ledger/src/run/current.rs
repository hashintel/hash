use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize};

use super::{RunError, RunId};
use crate::storage::{CasVersion, Storage};

const CURRENT_FILE: &str = "current.json";

/// Which run of the integration is active, and which was the last to complete, stored as
/// `current.json`.
///
/// A new run starts only when no run is active. A field the file does not know makes it
/// unreadable, so that a mistake in an edit by hand does not free the integration.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Current {
    pub active: Option<RunId>,
    pub last_completed: Option<RunId>,
}

/// Reads `current.json` and its version.
///
/// A missing file is an integration without runs: both fields are empty, and there is no
/// version.
///
/// # Errors
///
/// - [`RunError::Unreadable`] if the file is not a `current.json`
/// - [`RunError::Storage`] if the bucket cannot be read
pub(crate) async fn read(
    storage: &Storage,
) -> Result<(Current, Option<CasVersion>), Report<RunError>> {
    let Some((bytes, version)) = storage
        .read_versioned(CURRENT_FILE)
        .await
        .change_context(RunError::Storage)?
    else {
        return Ok((Current::default(), None));
    };
    let current = serde_json::from_slice(&bytes).change_context(RunError::Unreadable)?;
    Ok((current, Some(version)))
}

/// Names `run` as the active run, if `current.json` still has the `version` that `current` was
/// read with.
///
/// Returns `false` if the file changed since it was read. Nothing is written then.
///
/// # Errors
///
/// Returns [`RunError::Storage`] if the bucket cannot be written.
pub(crate) async fn activate(
    storage: &Storage,
    current: Current,
    version: Option<&CasVersion>,
    run: RunId,
) -> Result<bool, Report<RunError>> {
    let current = Current {
        active: Some(run),
        ..current
    };
    write(storage, &current, version).await
}

/// Names `run` as the last completed run, so that the integration has no active run.
///
/// Does nothing if an earlier call already completed `run`.
///
/// # Errors
///
/// - [`RunError::NotActive`] if `current.json` names `run` neither as active nor as the last
///   completed run
/// - [`RunError::Changed`] if the file changed since it was read
/// - [`RunError::Unreadable`] if the file is not a `current.json`
/// - [`RunError::Storage`] if the bucket cannot be read or written
pub(crate) async fn complete(storage: &Storage, run: RunId) -> Result<(), Report<RunError>> {
    let (current, version) = read(storage).await?;
    if current.active != Some(run) {
        return if current.last_completed == Some(run) {
            Ok(())
        } else {
            Err(Report::new(RunError::NotActive))
        };
    }
    let completed = Current {
        active: None,
        last_completed: Some(run),
    };
    if write(storage, &completed, version.as_ref()).await? {
        Ok(())
    } else {
        Err(Report::new(RunError::Changed))
    }
}

async fn write(
    storage: &Storage,
    current: &Current,
    version: Option<&CasVersion>,
) -> Result<bool, Report<RunError>> {
    let bytes =
        serde_json::to_vec_pretty(current).expect("`current.json` should serialize to JSON");
    storage
        .replace_if(CURRENT_FILE, version, bytes)
        .await
        .change_context(RunError::Storage)
}
