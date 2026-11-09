use core::future::Future;

use error_stack::Report;
use serde::{Serialize, de::DeserializeOwned};

use crate::{FailureCode, FunctionVersion, StepFailure, StepName};

/// Why a run function stopped.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum RunError {
    /// The backend stopped the run at a step: a cancel, a failed step, a wait for a retry, or a
    /// step request that differs from the recorded one. The backend records the reason. The run
    /// function returns this error unchanged, with `?`.
    #[display("the backend stopped the run at a step")]
    Stopped,
    /// The run function failed on its own.
    #[display("the run function failed with `{code}`")]
    Failed { code: FailureCode },
}

/// The function a run executes. An integration implements it.
///
/// A run function must be deterministic: the same input requests the same steps, in the same
/// order, with the same names. Its side effects happen inside steps, and it builds its resources
/// inside the run, so any process can execute any run.
pub trait RunFunction: Send + Sync {
    /// The input of a run. It is plain data, recorded when the run starts.
    type Input: Serialize + DeserializeOwned + Send;

    /// The version a run is pinned to. A worker executes only runs started with its function's
    /// version.
    const VERSION: FunctionVersion;

    /// Runs the integration, requesting each step through `context`.
    ///
    /// # Errors
    ///
    /// - [`RunError::Stopped`] if a step request stopped the run.
    /// - [`RunError::Failed`] if the run function failed on its own.
    fn run(
        &self,
        context: &mut impl StepContext,
        input: Self::Input,
    ) -> impl Future<Output = Result<(), Report<RunError>>> + Send;
}

/// Executes and records the steps of one run.
pub trait StepContext: Send {
    /// Returns the output of the step named `name`.
    ///
    /// A recorded step returns its recorded output without calling `step`. A new step calls
    /// `step` and records its output. A step that fails with [`FailureKind::Retryable`] is called
    /// again by the run's [`RetryPolicy`], so `step` can be called more than once.
    ///
    /// The backend logs the messages of a failed step's report and records only its
    /// [`StepFailure`].
    ///
    /// # Errors
    ///
    /// Returns [`RunError::Stopped`] if the run was cancelled, the step failed permanently or ran
    /// out of attempts, the step waits for its next attempt, or `name` differs from the step
    /// recorded at this position.
    ///
    /// [`FailureKind::Retryable`]: crate::FailureKind::Retryable
    /// [`RetryPolicy`]: crate::RetryPolicy
    fn run<T, F, Fut>(
        &mut self,
        name: StepName,
        step: F,
    ) -> impl Future<Output = Result<T, Report<RunError>>> + Send
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnMut() -> Fut + Send,
        Fut: Future<Output = Result<T, Report<StepFailure>>> + Send;
}
