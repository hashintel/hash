pub mod config;
pub mod result;
mod sim;

use execution::package::{experiment::ExperimentName, simulation::PersistenceConfig};
use simulation_structure::{ExperimentId, SimulationShortId};

use self::{config::LocalPersistenceConfig, sim::LocalSimulationOutputPersistence};
use crate::output::{buffer::Buffers, error::Result, OutputPersistenceCreatorRepr};

pub struct LocalOutputPersistence {
    pub project_name: String,
    pub experiment_name: ExperimentName,
    pub experiment_id: ExperimentId,
    pub config: LocalPersistenceConfig,
}

impl OutputPersistenceCreatorRepr for LocalOutputPersistence {
    type SimulationOutputPersistence = LocalSimulationOutputPersistence;

    fn new_simulation(
        &self,
        sim_id: SimulationShortId,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence> {
        let buffers = Buffers::new(
            &self.experiment_id,
            sim_id,
            &persistence_config.output_config,
        )?;
        Ok(LocalSimulationOutputPersistence {
            project_name: self.project_name.clone(),
            experiment_name: self.experiment_name.clone(),
            experiment_id: self.experiment_id,
            sim_id,
            buffers,
            config: self.config.clone(),
        })
    }
}
