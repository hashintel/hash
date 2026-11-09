use core::num::NonZero;

use time::UtcDateTime;

use crate::{AdmissionKey, FailureCode, Payload, RetryPolicy, StepName};

/// The position of a step in a run, starting at zero.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub struct StepIndex(u32);

impl StepIndex {
    #[must_use]
    pub const fn new(index: u32) -> Self {
        Self(index)
    }

    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }
}

/// The version of the run function that started a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub struct FunctionVersion(u32);

impl FunctionVersion {
    #[must_use]
    pub const fn new(version: u32) -> Self {
        Self(version)
    }

    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }
}

/// The request that starts a run. It is recorded before any of the run's events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunStart {
    pub admission: AdmissionKey,
    pub version: FunctionVersion,
    pub policy: RetryPolicy,
    pub input: Payload,
}

/// Whether a failed step can succeed when it is attempted again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    Retryable,
    Permanent,
}

/// Why a step failed. A step returns it as the context of its error report, whose messages go to
/// logs.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the step failed with `{code}`")]
pub struct StepFailure {
    pub kind: FailureKind,
    pub code: FailureCode,
}

/// Why a run failed.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum RunFailure {
    #[display("step {index} `{name}` failed on attempt {attempts} with `{code}`")]
    Step {
        index: StepIndex,
        name: StepName,
        attempts: NonZero<u32>,
        code: FailureCode,
    },
    #[display(
        "step {index} was recorded as `{recorded}`, but the run function requested `{requested}`"
    )]
    NonDeterministic {
        index: StepIndex,
        recorded: StepName,
        requested: StepName,
    },
    #[display("the run function failed with `{code}`")]
    Function { code: FailureCode },
}

/// A change to a run, in the order it is recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunEvent {
    StepCompleted {
        index: StepIndex,
        name: StepName,
        output: Payload,
    },
    StepFailed {
        index: StepIndex,
        name: StepName,
        failure: StepFailure,
        at: UtcDateTime,
    },
    CancelRequested,
    Completed,
    /// Fails the run when the run function diverges or returns an error. A step that runs out of
    /// attempts fails the run through [`RunEvent::StepFailed`].
    Failed(RunFailure),
    Cancelled,
}
