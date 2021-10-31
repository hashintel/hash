pub mod buffer;

pub mod local;
pub mod none;

use crate::proto::SimulationShortID;
use serde::Serialize;

use crate::{
    config::PersistenceConfig, error::Result, simulation::step_output::SimulationStepOutput,
};

pub trait OutputPersistenceCreatorRepr {
    type SimulationOutputPersistence: SimulationOutputPersistenceRepr;
    fn new_simulation(
        &self,
        sim_id: SimulationShortID,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence>;
}

#[async_trait::async_trait]
pub trait SimulationOutputPersistenceRepr {
    type OutputPersistenceResult: OutputPersistenceResultRepr;
    async fn add_step_output(&mut self, output: SimulationStepOutput) -> Result<()>;
    async fn finalize(self) -> Result<Self::OutputPersistenceResult>;
}

pub trait OutputPersistenceResultRepr: Serialize {
    fn as_value(self) -> Result<(&'static str, serde_json::Value)>;
}
