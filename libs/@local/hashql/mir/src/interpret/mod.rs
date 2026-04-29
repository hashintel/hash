//! MIR interpreter.
//!
//! # Architecture
//!
//! The interpreter uses a stack-based execution model:
//!
//! - **[`Runtime`]**: The main interpreter engine that holds configuration, function bodies, and
//!   input values.
//! - **[`CallStack`]**: Manages the call frames during execution, tracking local variables, current
//!   block position, and statement index for each function call.
//! - **[`value`]**: Runtime value representation including primitives (integers, numbers, strings),
//!   aggregates (structs, tuples), and collections (lists, dicts).
//! - **[`suspension`]**: Types for the suspend/resume protocol when the interpreter needs external
//!   data.
//!
//! # Execution
//!
//! For simple synchronous execution, [`Runtime::run`] drives interpretation to completion,
//! handling suspensions via a closure. For async or multi-backend orchestration, use
//! [`Runtime::start`] and [`Runtime::resume`] to manually drive the suspend/resume loop.
//!
//! [`Severity::Bug`]: hashql_diagnostics::severity::Severity::Bug
//! [`Severity::Error`]: hashql_diagnostics::severity::Severity::Error

pub mod error;
mod inputs;
mod locals;
mod runtime;
mod scratch;
pub mod suspension;
#[cfg(test)]
mod tests;
pub mod value;

pub use self::{
    error::{RuntimeError, TypeName},
    inputs::Inputs,
    locals::Locals,
    runtime::{CallStack, Runtime, RuntimeConfig, Yield},
};
