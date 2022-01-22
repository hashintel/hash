pub mod config;
pub mod result;
mod sim;

use self::{config::LocalPersistenceConfig, sim::LocalSimulationOutputPersistence};
use super::{buffer::Buffers, OutputPersistenceCreatorRepr};
use crate::{
    config::PersistenceConfig,
    output::error::Result,
    proto::{ExperimentId, ExperimentName, SimulationShortId},
};

#[derive(derive_new::new)]
pub struct LocalOutputPersistence {
    exp_name: ExperimentName,
    exp_id: ExperimentId,
    config: LocalPersistenceConfig,
}

impl OutputPersistenceCreatorRepr for LocalOutputPersistence {
    type SimulationOutputPersistence = LocalSimulationOutputPersistence;

    fn new_simulation(
        &self,
        sim_id: SimulationShortId,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence> {
        let buffers = Buffers::new(&self.exp_id, sim_id, &persistence_config.output_config)?;
        Ok(LocalSimulationOutputPersistence::new(
            self.exp_name.clone(),
            self.exp_id,
            sim_id,
            buffers,
            self.config.clone(),
        ))
    }
}
