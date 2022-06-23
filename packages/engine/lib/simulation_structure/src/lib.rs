//! Contains the structure for running the engine.
//!
//! The configuration of an experiment is defined in [`Manifest`]. A [`Manifest`] contains the
//! definition to run an [`Experiment`], which is described as [`ExperimentRun`]. An [`Experiment`]
//! has a [`Simulation`] associated with it. Depending on the [`ExperimentType`] the [`Experiment`]
//! will run the [`Simulation`] with different configurations.
// TODO: Add the Experiment config and Simulation Config and describe the difference here.

mod dependencies;
mod experiment;
mod experiment_plan;
mod manifest;
mod simulation;

pub use self::{
    dependencies::{parse_raw_csv_into_json, FetchDependencies},
    experiment::{Experiment, ExperimentRun, ExperimentType},
    manifest::Manifest,
    simulation::Simulation,
};
