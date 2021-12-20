pub mod config;
pub mod result;
mod sim;

use self::{config::LocalPersistenceConfig, sim::LocalSimulationOutputPersistence};
use super::{buffer::Buffers, OutputPersistenceCreatorRepr};
use crate::{
    config::PersistenceConfig,
    output::error::Result,
    proto::{ExperimentRunId, ExperimentId, SimulationShortId},
};

#[derive(derive_new::new)]
pub struct LocalOutputPersistence {
    exp_id: ExperimentId,
    exp_run_id: ExperimentRunId,
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
            self.exp_id.clone(),
            sim_id,
            &persistence_config.output_config,
        )?;
        Ok(LocalSimulationOutputPersistence::new(
            self.exp_id.clone(),
            self.exp_run_id.clone(),
            sim_id,
            buffers,
            self.config.clone(),
        ))
    }
}
