use serde::{Deserialize, Serialize};

use crate::package::experiment::name::ExperimentName;

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExperimentPackageConfig {
    Simple(SimpleExperimentConfig),
    SingleRun(SingleRunExperimentConfig),
}

// TODO: investigate if the renames are still needed
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SimpleExperimentConfig {
    /// The experiment name
    pub experiment_name: ExperimentName,
    /// The global properties changed for each simulation run
    #[serde(rename = "changedProperties")]
    pub changed_globals: Vec<serde_json::Value>,
    /// Number of steps each run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
    /// Maximum amount of simulations that can be ran in parallel - None is unlimited
    pub max_sims_in_parallel: Option<usize>,
}

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SingleRunExperimentConfig {
    /// Number of steps the run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
}
