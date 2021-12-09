use serde_json::Value;

use super::super::*;
use crate::{
    datastore::{batch::ArrowBatch, table::state::ReadState},
    hash_types::Agent,
};

pub enum Task {}

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        Ok(Box::new(JsonState {
            config: config.clone(),
        }))
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct JsonState {
    config: Arc<SimRunConfig>,
}

impl MaybeCPUBound for JsonState {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerSimStartMsg for JsonState {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for JsonState {
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        let agent_states: std::result::Result<Vec<_>, crate::datastore::error::Error> = state
            .agent_pool()
            .read_batches()?
            .into_iter()
            .map(|batch| {
                batch
                    .record_batch()
                    .into_agent_states(Some(&self.config.sim.store.agent_schema))
            })
            .collect();

        let agent_states: Vec<_> = agent_states?.into_iter().flatten().collect();

        Ok(Output::JSONStateOutput(JSONStateOutput {
            inner: agent_states,
        }))
    }
}

#[derive(Debug)]
pub struct JSONStateOutput {
    pub inner: Vec<Agent>,
}
