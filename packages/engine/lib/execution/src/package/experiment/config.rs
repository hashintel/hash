use serde::{Deserialize, Serialize};

use crate::package::experiment::{
    basic::BasicExperimentConfig, extended::ExtendedExperimentConfig,
};

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExperimentPackageConfig {
    Basic(BasicExperimentConfig),
    Extended(ExtendedExperimentConfig),
}
