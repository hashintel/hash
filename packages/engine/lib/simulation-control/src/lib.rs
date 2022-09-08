//! Contains the engine logic for running a simulation.
//!
//! The [`controller`] module is responsible for controlling the [`SimulationRuns`]. This is
//! typically done by calling [`SimulationRuns::new_run`] with the handle stored in the
//! [`SimulationController`]. The [`Packages`] struct contains different [simulation packages]
//! created from the [`PackageCreators`]. It's used to run the different packages.
//!
//! The [`command`] module contains the commands that are sent to the [simulation packages] using
//! the [`comms`] module.
//!
//! [`SimulationRuns`]: controller::SimulationRuns
//! [`SimulationRuns::new_run`]: controller::SimulationRuns::new_run
//! [`SimulationController`]: controller::SimulationController
//! [`Packages`]: controller::Packages
//! [simulation packages]: execution::package::simulation
//! [`PackageCreators`]: experiment_structure::PackageCreators

#![cfg_attr(test, feature(test))]

pub mod command;
pub mod comms;
pub mod controller;

mod agent_control;
mod engine;
mod engine_status;
mod error;
mod status;
mod step_result;

#[cfg(test)]
mod tests;

pub use self::{
    engine_status::EngineStatus,
    error::{Error, Result},
    status::SimStatus,
};
