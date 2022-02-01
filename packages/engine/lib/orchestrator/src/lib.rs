//! Library for running an experiment on a [`hash_engine`] process.
//!
//! This crate is used for parsing a project manifest file [`Manifest`] into an experiment
//! configuration, which then can be run on a [`hash_engine`] subprocess.

#[macro_use]
extern crate tracing;

mod experiment;
mod exsrv;
mod manifest;
pub mod process;

pub use self::{
    experiment::{Experiment, ExperimentConfig, ExperimentType},
    exsrv::{Handler, Server},
    manifest::Manifest,
};
