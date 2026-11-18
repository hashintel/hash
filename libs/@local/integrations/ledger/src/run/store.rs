//! Reads and writes `run.json`.
//!
//! A stage [reads](read) the file first, for its input and its progress. Every write is
//! conditional: it replaces the file only if nobody changed it since it was read. [`update`] is
//! the one place that handles a conflicting write, so a stage never sees one.

use error_stack::Report;

use super::{Run, RunContext, RunId, Stage, StageError};

/// Reads the `run.json` of `run`, or `None` if the run has no `run.json`.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be read
/// - [`Code::StoredJsonInvalid`] if the stored file is not a [`Run`]
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
/// [`Code::StoredJsonInvalid`]: super::Code::StoredJsonInvalid
pub(crate) async fn read(
    context: &RunContext,
    run: RunId,
) -> Result<Option<Run>, Report<StageError>> {
    unimplemented!()
}

/// Writes the first `run.json` of a run. Returns `false` if the run already has one.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be written
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
pub(super) async fn create(context: &RunContext, run: &Run) -> Result<bool, Report<StageError>> {
    unimplemented!()
}

/// Applies `change` to the `run.json` of `run`, writes it and returns the stored state.
///
/// A stage calls this to write its part, and removes the failure part in the same `change`. If
/// another writer changed the file since it was read, the file is read again and `change` is
/// applied to the new state, up to eight times.
///
/// # Errors
///
/// - [`Code::RunNotReady`] if the run has no `run.json`
/// - [`Code::StorageUnavailable`] if storage cannot be read or written, or the write still
///   conflicts after eight attempts
/// - [`Code::StoredJsonInvalid`] if the stored file is not a [`Run`]
///
/// [`Code::RunNotReady`]: super::Code::RunNotReady
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
/// [`Code::StoredJsonInvalid`]: super::Code::StoredJsonInvalid
pub(crate) async fn update(
    context: &RunContext,
    run: RunId,
    change: impl FnMut(&mut Run) + Send,
) -> Result<Run, Report<StageError>> {
    unimplemented!()
}

/// Writes the failure part of `run.json` for the error `stage` returned.
///
/// The part holds the stage, the retry class and the code of `error`, and `batch` for a failure
/// of Send. An error while writing the part is logged and not returned, so the caller still
/// returns `error`.
pub(crate) async fn fail(
    context: &RunContext,
    run: RunId,
    stage: Stage,
    error: &Report<StageError>,
    batch: Option<u32>,
) {
    unimplemented!()
}
