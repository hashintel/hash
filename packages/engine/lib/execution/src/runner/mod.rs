//! Language runner implementations to run [`package`]s.
//!
//! Currently, three [`Language`] runners are available: JavaScript, Python, and Rust. The latter
//! is WIP and currently disabled. To drive the language runners, the [`comms`] module provides
//! messages to be sent to the runners or received from the runners.
//!
//! [`package`]: crate::package

pub mod comms;

mod javascript;
mod python;
mod rust;

mod config;
mod error;
mod language;
mod target;

pub use self::{
    config::RunnerConfig, error::RunnerError, language::Language, target::MessageTarget,
};
pub(crate) use self::{
    javascript::{JavaScriptError, JavaScriptRunner},
    python::{PythonError, PythonRunner},
    rust::RustRunner,
};
