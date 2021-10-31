use super::super::*;

use crate::datastore::batch::ArrowBatch;
use crate::datastore::table::state::ReadState;
use crate::hash_types::Agent;
use serde_json::Value;

pub enum Task {}

pub struct Creator {}

impl Creator {
    pub fn new() -> Box<dyn PackageCreator> {
        Box::new(Creator {})
    }
}

impl PackageCreator for Creator {
    fn create(
        &self,
        _config: &Arc<SimRunConfig<ExperimentRunBase>>,
        _comms: PackageComms,
    ) -> Result<Box<dyn Package>> {
        Box::new(JsonState {})
    }
}

struct JsonState {}

impl MaybeCPUBound for JsonState {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerStartMsg for JsonState {
    fn get_worker_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for JsonState {
    async fn run<'s>(
        &mut self,
        state: Arc<State>,
        _context: Arc<Context>,
    ) -> Result<JSONStateOutput> {
        let agent_states: Vec<_> = state
            .agent_pool()
            .read_batches()?
            .into_iter()
            .flat_map(|batch| batch.record_batch().into_agent_states()?)
            .collect();

        JSONStateOutput {
            inner: agent_states,
        }
    }
}

pub struct JSONStateOutput {
    pub inner: Vec<Agent>,
}
