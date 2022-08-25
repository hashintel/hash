use serde::Serialize;
use stateful::global::Globals;

use crate::package::simulation::SimulationId;

pub mod local;
pub mod none;

use crate::{
    package::simulation::{output::Output, PersistenceConfig},
    Result,
};

pub trait OutputPersistenceCreator: Send + Sync + 'static {
    type SimulationOutputPersistence: SimulationOutputPersistence;
    fn new_simulation(
        &self,
        sim_id: SimulationId,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence>;
}

#[async_trait::async_trait]
pub trait SimulationOutputPersistence: Send + Sync + 'static {
    type OutputPersistenceResult: OutputPersistenceResult;
    async fn add_step_output(&mut self, output: Vec<Output>) -> Result<()>;
    async fn finalize(self, globals: &Globals) -> Result<Self::OutputPersistenceResult>;
}

pub trait OutputPersistenceResult: Serialize + Send + Sync {
    fn into_value(self) -> Result<(&'static str, serde_json::Value)>;
}

impl OutputPersistenceResult for () {
    fn into_value(self) -> Result<(&'static str, serde_json::Value)> {
        Ok(("none", serde_json::Value::Null))
    }
}
