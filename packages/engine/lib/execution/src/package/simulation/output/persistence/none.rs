use stateful::global::Globals;

use crate::package::simulation::{
    output::{
        persistence::{OutputPersistenceCreator, SimulationOutputPersistence},
        Output,
    },
    PersistenceConfig, Result, SimulationId,
};

#[derive(Default)]
pub struct NoOutputPersistence {}

impl NoOutputPersistence {
    pub fn new() -> NoOutputPersistence {
        Self::default()
    }
}

impl OutputPersistenceCreator for NoOutputPersistence {
    type SimulationOutputPersistence = NoSimulationOutputPersistence;

    fn new_simulation(
        &self,
        _sim_id: SimulationId,
        _persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence> {
        Ok(NoSimulationOutputPersistence {})
    }
}

pub struct NoSimulationOutputPersistence {}

#[async_trait::async_trait]
impl SimulationOutputPersistence for NoSimulationOutputPersistence {
    type OutputPersistenceResult = ();

    async fn add_step_output(&mut self, _output: Vec<Output>) -> Result<()> {
        Ok(())
    }

    async fn finalize(self, _globals: &Globals) -> Result<Self::OutputPersistenceResult> {
        Ok(())
    }
}
