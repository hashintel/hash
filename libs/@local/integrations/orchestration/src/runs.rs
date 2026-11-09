use core::future::Future;

use error_stack::Report;
use tokio_util::sync::CancellationToken;

use crate::{RunFunction, RunId, RunPhase, RunStart, StepName};

/// Reports that a backend could not complete a request, for example because its storage is
/// unavailable.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the backend could not complete the request")]
pub struct BackendError;

/// Whether starting a run created it or attached to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Started {
    Created,
    /// A run with the same ID and the same start was already recorded.
    Attached,
}

/// Reports why a run did not start.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum StartError {
    #[display("run `{active}` is already active under the same admission key")]
    AlreadyActive { active: RunId },
    #[display("a run with this ID was started with a different start")]
    StartMismatch,
    #[display("the backend could not start the run")]
    Backend,
}

/// What a cancel request found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancelOutcome {
    /// The run stops at its next step that has not been recorded.
    Requested,
    /// The run had already finished.
    Finished,
    /// No run has this ID.
    Unknown,
}

/// The state of a run, read without a worker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunStatus {
    pub phase: RunPhase,
    pub steps_recorded: u32,
    /// The step that failed and waits for another attempt.
    pub retrying_step: Option<StepName>,
    pub cancel_requested: bool,
}

/// Starts, inspects and cancels runs. None of these needs a worker.
pub trait Runs: Send + Sync {
    /// Starts a run under the ID `run`.
    ///
    /// Starting a run again with the same ID and the same `start` attaches to it, so a caller
    /// can retry after a lost response.
    ///
    /// # Errors
    ///
    /// - [`StartError::AlreadyActive`] if another run is active under the same admission key.
    /// - [`StartError::StartMismatch`] if `run` was started with a different `start`.
    /// - [`StartError::Backend`] if the backend could not record the start.
    fn start(
        &self,
        run: RunId,
        start: RunStart,
    ) -> impl Future<Output = Result<Started, Report<StartError>>> + Send;

    /// Returns the status of `run`, or `None` if no run has this ID.
    ///
    /// # Errors
    ///
    /// Returns [`BackendError`] if the backend could not read the run.
    fn status(
        &self,
        run: &RunId,
    ) -> impl Future<Output = Result<Option<RunStatus>, Report<BackendError>>> + Send;

    /// Requests that `run` stops before its next step that has not been recorded.
    ///
    /// # Errors
    ///
    /// Returns [`BackendError`] if the backend could not record the request.
    fn cancel(
        &self,
        run: &RunId,
    ) -> impl Future<Output = Result<CancelOutcome, Report<BackendError>>> + Send;
}

/// Executes runs. Any process can execute any run, and a run that a stopped process was
/// executing resumes in another one.
pub trait Worker: Send + Sync {
    /// Executes runs started with `F::VERSION` until `shutdown` is cancelled.
    ///
    /// # Errors
    ///
    /// Returns [`BackendError`] if the backend stops working.
    fn work<F: RunFunction>(
        &self,
        function: &F,
        shutdown: CancellationToken,
    ) -> impl Future<Output = Result<(), Report<BackendError>>> + Send;
}
