use execution::package::PersistenceConfig;
use serde::Serialize;
use simulation_structure::SimulationShortId;

use crate::{config::SimRunConfig, simulation::step_output::SimulationStepOutput};

pub mod buffer;

mod error;
pub mod local;
pub mod none;

pub use self::error::{Error, Result};

pub trait OutputPersistenceCreatorRepr: Send + Sync + 'static {
    type SimulationOutputPersistence: SimulationOutputPersistenceRepr;
    fn new_simulation(
        &self,
        sim_id: SimulationShortId,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence>;
}

#[async_trait::async_trait]
pub trait SimulationOutputPersistenceRepr: Send + Sync + 'static {
    type OutputPersistenceResult: OutputPersistenceResultRepr;
    async fn add_step_output(&mut self, output: SimulationStepOutput) -> Result<()>;
    async fn finalize(self, config: &SimRunConfig) -> Result<Self::OutputPersistenceResult>;
}

pub trait OutputPersistenceResultRepr: Serialize + Send + Sync {
    fn into_value(self) -> Result<(&'static str, serde_json::Value)>;
}
