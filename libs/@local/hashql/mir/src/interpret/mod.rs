//! MIR interpreter.
//!
//! # Architecture
//!
//! The interpreter uses a stack-based execution model:
//!
//! - **[`Runtime`]**: The main interpreter engine that holds configuration, function bodies, and
//!   input values. It provides the [`Runtime::run`] method for execution.
//! - **[`CallStack`]**: Manages the call frames during execution, tracking local variables, current
//!   block position, and statement index for each function call.
//! - **[`value`]**: Runtime value representation including primitives (integers, numbers, strings),
//!   aggregates (structs, tuples), and collections (lists, dicts).
//!
//! [`Severity::Bug`]: hashql_diagnostics::severity::Severity::Bug
//! [`Severity::Error`]: hashql_diagnostics::severity::Severity::Error

mod error;
mod locals;
mod runtime;
pub mod value;

pub use runtime::{CallStack, Runtime, RuntimeConfig};
