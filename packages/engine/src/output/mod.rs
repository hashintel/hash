use serde::Serialize;

use crate::proto::SimulationShortID;
use crate::{config::PersistenceConfig, simulation::step_output::SimulationStepOutput};

pub mod buffer;

mod error;
pub mod local;
pub mod none;

pub use error::{Error, Result};

pub trait OutputPersistenceCreatorRepr {
    type SimulationOutputPersistence: SimulationOutputPersistenceRepr;
    fn new_simulation(
        &self,
        sim_id: SimulationShortID,
        persistence_config: &PersistenceConfig,
    ) -> error::Result<Self::SimulationOutputPersistence>;
}

#[async_trait::async_trait]
pub trait SimulationOutputPersistenceRepr {
    type OutputPersistenceResult: OutputPersistenceResultRepr;
    async fn add_step_output(&mut self, output: SimulationStepOutput) -> error::Result<()>;
    async fn finalize(self) -> error::Result<Self::OutputPersistenceResult>;
}

pub trait OutputPersistenceResultRepr: Serialize {
    fn as_value(self) -> error::Result<(&'static str, serde_json::Value)>;
}
