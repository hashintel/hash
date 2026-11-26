use alloc::collections::BTreeMap;

use error_stack::Report;
use serde::{Serialize, ser::Error as _};
use serde_json::json;
use time::format_description::well_known::Rfc3339;

use super::{RunError, RunId, RunRecord, current, load};
use crate::Storage;

/// Reports why the state of a run could not be read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum StatusError {
    #[display("the integration has no runs")]
    NoRuns,
    #[display("the integration has no run of this ID")]
    UnknownRun,
    #[display("`current.json` or `run.json` is not valid")]
    Unreadable,
    #[display("the state of the integration could not be read")]
    Storage,
}

/// Where a run stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    /// `current.json` names the run as active.
    Active,
    /// Send finished, and the run is no longer active.
    Completed,
    /// A stage stopped for good.
    Failed,
    /// The run never became active: its Start did not finish.
    Inactive,
}

/// The state of a run: what its stages finished, read from its `run.json` and `current.json`.
///
/// It serializes to the core of the record: the counts of each stage and the failure, without the
/// definition and the entities the Graph refused.
#[derive(Debug)]
pub struct RunStatus {
    record: RunRecord,
    state: RunState,
}

impl RunStatus {
    /// Where the run stands.
    #[must_use]
    pub const fn state(&self) -> RunState {
        self.state
    }

    /// The run's whole `run.json`.
    ///
    /// # Panics
    ///
    /// Does not panic: a run record always serializes to JSON, as it did when it was written.
    #[must_use]
    pub fn run_json(&self) -> Vec<u8> {
        serde_json::to_vec_pretty(&self.record).expect("a run record should serialize to JSON")
    }
}

impl Serialize for RunStatus {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let RunRecord {
            input,
            capture,
            prepare,
            send,
            failure,
            ..
        } = &self.record;
        json!({
            "run": input.run,
            "connector": input.connector,
            "submitted_at": input.submitted_at.format(&Rfc3339).map_err(S::Error::custom)?,
            "state": self.state,
            "capture": capture.as_ref().map(|capture| json!({
                "rows": capture
                    .sources
                    .iter()
                    .map(|(table, file)| (table, file.rows))
                    .collect::<BTreeMap<_, _>>(),
            })),
            "prepare": prepare.as_ref().map(|prepare| json!({
                "rows": prepare.rows,
                "issues": prepare.issue_count,
            })),
            // `mismatches` counts the writes the Graph applied as another kind: a create of an
            // entity that existed, an update or an archive of one that was missing.
            "send": send.as_ref().map(|send| json!({
                "created": send.created,
                "updated": send.updated,
                "archived": send.archived,
                "mismatches": send.create_existed + send.update_missing + send.archive_missing,
                "failed": send.failed.len(),
            })),
            "failure": failure,
        })
        .serialize(serializer)
    }
}

/// Reads the state of `run`, or without a run, of the active run of the integration, else of its
/// last completed run.
///
/// # Errors
///
/// - [`StatusError::NoRuns`] if no run is given and the integration has neither an active nor a
///   completed run
/// - [`StatusError::UnknownRun`] if the run has no `run.json`
/// - [`StatusError::Unreadable`] if `current.json` or `run.json` is not valid
/// - [`StatusError::Storage`] if the bucket cannot be read
pub async fn status(
    storage: &Storage,
    run: Option<RunId>,
) -> Result<RunStatus, Report<StatusError>> {
    let (current, _) = current::read(storage).await.map_err(from_run)?;
    let run = run
        .or(current.active)
        .or(current.last_completed)
        .ok_or_else(|| Report::new(StatusError::NoRuns))?;
    let (record, _) = load(storage, run).await.map_err(from_run)?;
    let state = if record.failure.is_some() {
        RunState::Failed
    } else if current.active == Some(run) {
        RunState::Active
    } else if record.send.is_some() {
        RunState::Completed
    } else {
        RunState::Inactive
    };
    Ok(RunStatus { record, state })
}

fn from_run(report: Report<RunError>) -> Report<StatusError> {
    let context = match report.current_context() {
        RunError::NotFound => StatusError::UnknownRun,
        RunError::Unreadable => StatusError::Unreadable,
        RunError::Changed | RunError::NotActive | RunError::Storage => StatusError::Storage,
    };
    report.change_context(context)
}
