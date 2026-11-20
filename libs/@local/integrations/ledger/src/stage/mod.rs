//! What every stage of a run does the same way: how it starts, how it ends and how it fails.
//!
//! A stage starts with [`begin`], does its work, and ends with [`end`], which writes `run.json`
//! as the stage's last write to the bucket.

mod capture;
mod failure;
#[cfg(test)]
mod tests;

use error_stack::Report;

use self::failure::{from_run, permanent};
pub use self::{capture::capture, failure::StageError};
use crate::{
    run::{self, Failure, RunError, RunId, RunRecord, Stage, current},
    storage::{CasVersion, Storage},
};

/// The longest message the `failure` part of `run.json` keeps, in characters.
const MAX_MESSAGE: usize = 1024;

/// The record of the run a stage works on, as [`begin`] read it.
#[derive(Debug)]
pub(crate) struct Open {
    stage: Stage,
    record: RunRecord,
    /// The version of `run.json` that [`end`] writes against.
    version: CasVersion,
}

/// Reads the record of `run` for `stage`. Every stage starts with this.
///
/// # Errors
///
/// Nothing is written for any of these:
///
/// - [`StageError::Permanent`] if `run.json` is missing or unreadable, if `current.json` names
///   `run` neither as the active nor as the last completed run, or if the run has a `failure` part
/// - [`StageError::NotReady`] if the stage before `stage` has not finished
/// - [`StageError::Retryable`] if the bucket cannot be read
pub(crate) async fn begin(
    storage: &Storage,
    run: RunId,
    stage: Stage,
) -> Result<Open, Report<StageError>> {
    let (record, version) = run::load(storage, run)
        .await
        .map_err(|report| from_run(stage, report))?;
    let (current, _) = current::read(storage)
        .await
        .map_err(|report| from_run(stage, report))?;
    if current.active != Some(run) && current.last_completed != Some(run) {
        return Err(Report::new(permanent(stage, "run_not_active")));
    }
    if record.failure.is_some() {
        return Err(Report::new(permanent(stage, "run_failed")));
    }
    let ready = match stage {
        Stage::Capture => true,
        Stage::Prepare => record.capture.is_some(),
        Stage::Send => record.prepare.is_some(),
    };
    if !ready {
        return Err(Report::new(StageError::NotReady { stage }));
    }
    Ok(Open {
        stage,
        record,
        version,
    })
}

/// Ends the stage with `result`. Every stage ends with this, as its last write.
///
/// `Ok` saves `run.json` with the part the stage set. A permanent error saves it with the
/// `failure` part, and a retryable error writes nothing. In both cases the stage's error is
/// returned.
///
/// # Errors
///
/// - the error of `result`
/// - [`StageError::Retryable`] if `run.json` cannot be written, or changed since [`begin`] read it
pub(crate) async fn end(
    storage: &Storage,
    open: Open,
    result: Result<(), Report<StageError>>,
) -> Result<(), Report<StageError>> {
    let Open {
        stage,
        mut record,
        version,
    } = open;
    let Err(report) = result else {
        return run::save(storage, &record, Some(&version))
            .await
            .map_err(|report| from_run(stage, report));
    };
    if let StageError::Permanent { stage, code } = *report.current_context() {
        record.failure = Some(Failure {
            stage,
            code: code.into(),
            message: message(&report),
        });
        // If this write fails, the stage still returns its own error. Running it again fails at
        // the same step and records the failure then.
        let _: Result<(), Report<RunError>> = run::save(storage, &record, Some(&version)).await;
    }
    Err(report)
}

/// The text of each error in `report`, cut to [`MAX_MESSAGE`] characters.
fn message(report: &Report<StageError>) -> Box<str> {
    format!("{report:#}").chars().take(MAX_MESSAGE).collect()
}
