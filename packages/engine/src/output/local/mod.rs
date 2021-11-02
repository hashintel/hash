pub mod config;
pub mod result;
mod sim;

use std::path::PathBuf;

use crate::config::PersistenceConfig;
use crate::output::error::Result;
use crate::proto::{ExperimentID, SimulationShortID};
use crate::simulation::packages::output::packages::OutputPackagesSimConfig;

use self::{config::LocalPersistenceConfig, sim::LocalSimulationOutputPersistence};

use super::{buffer::Buffers, OutputPersistenceCreatorRepr};

#[derive(new)]
pub struct LocalOutputPersistence {
    exp_id: ExperimentID,
    config: LocalPersistenceConfig,
}

impl OutputPersistenceCreatorRepr for LocalOutputPersistence {
    type SimulationOutputPersistence = LocalSimulationOutputPersistence;

    fn new_simulation(
        &self,
        sim_id: SimulationShortID,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence> {
        let buffers = Buffers::new(
            self.exp_id.clone(),
            sim_id.clone(),
            &persistence_config.output_config,
        );
        Ok(LocalSimulationOutputPersistence::new(
            self.exp_id.clone(),
            sim_id,
            buffers,
            self.config.clone(),
        ))
    }
}
