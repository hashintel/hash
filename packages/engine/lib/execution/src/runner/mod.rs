//! Language runner implementations to run [`package`]s.
//!
//! Currently, three [`Language`] runners are available: [`JavaScriptRunner`], [`PythonRunner`], and
//! [`RustRunner`]. The latter is currently disabled. To drive the language runners, the [`comms`]
//! module provides messages to be sent to the runners or received from the runners.
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
    config::RunnerConfig,
    error::RunnerError,
    javascript::{JavaScriptError, JavaScriptRunner},
    language::Language,
    python::{PythonError, PythonRunner},
    rust::RustRunner,
    target::MessageTarget,
};
