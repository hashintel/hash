//! Library for running an experiment on a `hash_engine` process.
//!
//! This crate is used for parsing a project manifest file [`Manifest`] into an experiment
//! configuration, which then can be run on a `hash_engine` subprocess.
//!
//! [`Manifest`]: experiment_structure::Manifest

#[macro_use]
extern crate tracing;

pub mod error;
mod experiment;
mod experiment_server;
pub mod process;

pub use self::{
    error::{OrchestratorError, Result},
    experiment::{Experiment, ExperimentConfig},
    experiment_server::{Handler, Server},
};
