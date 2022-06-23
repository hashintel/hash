//! Contains the components used to define the structure of Experiment and Simulation runs.
//!
//! The [`Manifest`] defines the initial configuration used to define an experiment, this is then
//! turned into an [`ExperimentRun`] depending on the specified [`ExperimentType`]. Within the
//! [`ExperimentRun`] there are specific information for the [`Experiment`] and its
//! [`ExperimentConfig`], and the [`Simulation`]s within the experiment.
// TODO: Add the Experiment config and Simulation Config and describe the difference here.
// TODO: Make sure, the documentation differentiates between [`Simulation`] and the actual
//   simulation, which is running.

mod config;
mod dependencies;
mod error;
mod experiment;
mod manifest;
mod simulation;

pub use self::{
    config::{ExperimentConfig, PackageConfig, PackageConfigBuilder},
    dependencies::FetchDependencies,
    error::{Error, Result},
    experiment::{Experiment, ExperimentRun, ExperimentType},
    manifest::Manifest,
    simulation::{PackageCreators, Simulation},
};
