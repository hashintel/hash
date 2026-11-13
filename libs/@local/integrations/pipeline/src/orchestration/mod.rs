//! Typed contracts for a workflow backend driving the ingestion pipeline.
//!
//! These interfaces adapt the agreed orchestration reference. A backend supplies [`Runs`] and
//! [`StepContext`]; this crate does not implement scheduling, a journal, or a worker.
mod event;
mod name;
mod payload;
mod policy;
mod run;
mod runs;

pub use self::{
    event::{FailureKind, FunctionVersion, RunFailure, RunStart, StepFailure, StepIndex},
    name::{AdmissionKey, FailureCode, InvalidName, RunId, StepName},
    payload::{Payload, PayloadError},
    policy::RetryPolicy,
    run::{RunError, RunFunction, StepContext},
    runs::{BackendError, RunPhase, RunStatus, Runs, StartError},
};
