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
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

mod event;
mod name;
mod payload;
mod policy;
mod state;
mod timestamp;

pub use self::{
    event::{FailureKind, FunctionVersion, RunEvent, RunFailure, RunStart, StepFailure, StepIndex},
    name::{AdmissionKey, FailureCode, InvalidName, StepName},
    payload::{Payload, PayloadError},
    policy::RetryPolicy,
    state::{InvalidTransition, RunPhase, RunState, StepDecision},
    timestamp::Timestamp,
};
