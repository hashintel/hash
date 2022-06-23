use execution::package::experiment::ExperimentPackageConfig;
use serde::{Deserialize, Serialize};

use crate::Experiment;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExperimentRun {
    experiment: Experiment,
    config: ExperimentPackageConfig,
}

impl ExperimentRun {
    pub fn new(experiment: Experiment, config: ExperimentPackageConfig) -> Self {
        Self { experiment, config }
    }

    pub fn experiment(&self) -> &Experiment {
        &self.experiment
    }

    pub fn experiment_mut(&mut self) -> &mut Experiment {
        &mut self.experiment
    }

    pub fn config(&self) -> &ExperimentPackageConfig {
        &self.config
    }
}
