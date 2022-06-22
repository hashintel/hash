use serde::{Deserialize, Serialize};

use crate::package::experiment::{
    basic::BasicExperimentPackageConfig, extended::ExtendedExperimentPackageConfig,
};

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExperimentPackageConfig {
    Basic(BasicExperimentPackageConfig),
    Extended(ExtendedExperimentPackageConfig),
}
