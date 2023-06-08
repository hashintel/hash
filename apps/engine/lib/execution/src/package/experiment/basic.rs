mod simple;
mod single;

use serde::{Deserialize, Serialize};

pub use self::{
    simple::{SimpleExperiment, SimpleExperimentConfig},
    single::{SingleRunExperiment, SingleRunExperimentConfig},
};

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum BasicExperimentConfig {
    Simple(SimpleExperimentConfig),
    SingleRun(SingleRunExperimentConfig),
}
