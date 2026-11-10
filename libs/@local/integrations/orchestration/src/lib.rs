//! # HASH Integrations Orchestration
//!
//! Runs integrations as sequences of durable steps. A run calls a run function, which requests its
//! steps by name. Each completed step is recorded with its output. When a run is executed again,
//! its recorded steps return their outputs without executing, and the run continues from the first
//! step that has not completed.
//!
//! [`RunState`] starts from a run's [`RunStart`] and applies its [`RunEvent`]s in order.
//! [`RunState::decide`] decides what a step request does: replay the recorded output, execute the
//! step, cancel the run, or fail it when the run function requests a different step than the one
//! recorded. A step that failed before executes again no earlier than its retry delay allows.
//!
//! A backend implements [`Runs`], [`Worker`] and [`CoordinationStore`]. It executes a
//! [`RunFunction`], which requests its steps through a [`StepContext`]. The `dbos` feature adds
//! the backend on DBOS, in [`dbos`], and the `restate` feature the backend on Restate, in
//! [`restate`].
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

mod coordination;
#[cfg(feature = "dbos")]
pub mod dbos;
mod event;
mod name;
mod payload;
mod policy;
#[cfg(feature = "restate")]
pub mod restate;
mod run;
mod runs;
mod state;

pub use self::{
    coordination::{CoordinationError, CoordinationStore, TokenBucket},
    event::{FailureKind, FunctionVersion, RunEvent, RunFailure, RunStart, StepFailure, StepIndex},
    name::{AdmissionKey, BucketScope, FailureCode, InvalidName, RunId, StepName},
    payload::{Payload, PayloadError},
    policy::RetryPolicy,
    run::{RunError, RunFunction, StepContext},
    runs::{BackendError, RunStatus, Runs, StartError, Worker},
    state::{InvalidTransition, RunPhase, RunState, StepDecision},
};
