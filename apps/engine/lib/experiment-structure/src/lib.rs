//! Contains the components used to define the structure of Experiment and Simulation runs.
//!
//! The [`Manifest`] defines the initial configuration used to define an experiment, this is then
//! turned into an [`ExperimentRun`] depending on the specified [`ExperimentType`]. Within the
//! [`ExperimentRun`] there are specific information running a simulation specified by
//! [`SimulationSource`].

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
    experiment::{ExperimentRun, ExperimentType},
    manifest::Manifest,
    simulation::{PackageCreators, SimulationConfig, SimulationRunConfig, SimulationSource},
};
