pub mod comms;
mod config;
mod name;

pub use self::{
    config::{ExperimentPackageConfig, SimpleExperimentConfig, SingleRunExperimentConfig},
    name::ExperimentName,
};
