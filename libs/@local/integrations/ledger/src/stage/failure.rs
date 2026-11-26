use error_stack::Report;

use crate::{
    lake::LakeError,
    run::{RunError, Stage},
};

/// Reports why a stage stopped, and whether running it again can help.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum StageError {
    /// Running the stage again can help: storage or the Graph was not available.
    #[display("{stage} stopped, and running it again can help")]
    Retryable { stage: Stage },
    /// Running the stage again cannot help.
    ///
    /// A stage that ends with this error records `code` in the `failure` part of `run.json`. A
    /// stage that cannot read the run, or may not work on it, returns it without writing.
    #[display("{stage} failed for good: {code}")]
    Permanent { stage: Stage, code: &'static str },
    /// The stage before this one has not finished.
    #[display("{stage} waits for the stage before it to finish")]
    NotReady { stage: Stage },
}

/// A failure of `stage` that running it again cannot help, named by `code`.
pub(crate) const fn permanent(stage: Stage, code: &'static str) -> StageError {
    StageError::Permanent { stage, code }
}

/// A failure of `stage` that running it again can help.
pub(crate) const fn retryable(stage: Stage) -> StageError {
    StageError::Retryable { stage }
}

/// What an error reading or writing the state of the run means for `stage`.
///
/// `run.json` that changed while the stage worked is retryable: running the stage again reads
/// the new state.
pub(crate) fn from_run(stage: Stage, report: Report<RunError>) -> Report<StageError> {
    let context = match report.current_context() {
        RunError::Storage | RunError::Changed => retryable(stage),
        RunError::NotFound => permanent(stage, "run_not_found"),
        RunError::Unreadable => permanent(stage, "run_unreadable"),
        RunError::NotActive => permanent(stage, "run_not_active"),
    };
    report.change_context(context)
}

/// The code of a stage that failed because the storage has no bucket for its Delta tables.
pub(crate) const STORAGE_UNCONFIGURED: &str = "storage_unconfigured";

/// What an error of the Delta tables means for `stage`. `invalid` names what was refused.
pub(crate) fn from_lake(
    stage: Stage,
    invalid: &'static str,
    report: Report<LakeError>,
) -> Report<StageError> {
    let context = match report.current_context() {
        LakeError::Storage => retryable(stage),
        LakeError::Invalid => permanent(stage, invalid),
        LakeError::Unconfigured => permanent(stage, STORAGE_UNCONFIGURED),
    };
    report.change_context(context)
}
