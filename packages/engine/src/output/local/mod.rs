pub mod config;
pub mod result;
mod sim;

use execution::package::simulation::PersistenceConfig;
use simulation_structure::{ExperimentId, SimulationShortId};

use self::{config::LocalPersistenceConfig, sim::LocalSimulationOutputPersistence};
use crate::{
    output::{buffer::Buffers, error::Result, OutputPersistenceCreatorRepr},
    proto::ExperimentName,
};

#[derive(derive_new::new)]
pub struct LocalOutputPersistence {
    project_name: String,
    experiment_name: ExperimentName,
    experiment_id: ExperimentId,
    config: LocalPersistenceConfig,
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
        Ok(LocalSimulationOutputPersistence::new(
            self.project_name.clone(),
            self.experiment_name.clone(),
            self.experiment_id,
            sim_id,
            buffers,
            self.config.clone(),
        ))
    }
}
