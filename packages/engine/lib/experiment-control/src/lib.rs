//! Functionality for controlling experiments.
//!
//! This crate is responsible for the communication defined in the [`comms`] module to interact with
//! the [`simulation-control`] to run the engine. [`environment`] contains general functionality
//! to drive the [`controller`] module, such as [`Args`] or [`Environment`]. The [`controller`]
//! module itself can then configure a simulation and run it.
//!
//! [`Args`]: environment::Args
//! [`Environment`]: environment::Environment

pub mod comms;
pub mod controller;
pub mod environment;
mod error;

pub use self::error::{Error, Result};
