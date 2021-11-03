mod collected;
mod fields;
mod indices;
mod writer;

use self::collected::Messages;
use crate::{
    datastore::{batch::iterators, table::state::ReadState},
    simulation::comms::package::PackageComms,
};
use serde_json::Value;

use super::super::*;

const CPU_BOUND: bool = true;
pub const MESSAGE_INDEX_COUNT: usize = 3;
pub type IndexType = u32;
pub type ArrowIndexBuilder = arrow::array::UInt32Builder;

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
    ) -> Result<Box<dyn ContextPackage>> {
        Ok(Box::new(AgentMessages {}))
    }

    fn add_context_field_specs(
        &self,
        _config: &ExperimentConfig<ExperimentRunBase>,
        _globals: &Globals,
        field_spec_map_builder: &mut FieldSpecMapBuilder,
    ) -> Result<()> {
        fields::add_context(field_spec_map_builder)?;
        Ok(())
    }
}

struct AgentMessages {}

impl MaybeCPUBound for AgentMessages {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl GetWorkerStartMsg for AgentMessages {
    fn get_worker_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for AgentMessages {
    async fn run<'s>(
        &mut self,
        state: Arc<State>,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<ContextColumn> {
        let agent_pool = state.agent_pool();
        let batches = agent_pool.read_batches()?;
        let id_name_iter = iterators::agent::agent_id_iter_ref(&batches)?
            .zip(iterators::agent::agent_name_iter_ref(&batches)?);

        let messages = Messages::gather(snapshot.message_map(), id_name_iter, state.num_agents())?;

        Ok(ContextColumn {
            inner: Box::new(messages),
        })
    }

    fn get_empty_arrow_column(&self, num_agents: usize) -> Result<Arc<dyn ArrowArray>> {
        let index_builder = ArrowIndexBuilder::new(1024);

        let neighbor_index_builder = arrow::array::FixedSizeListBuilder::new(index_builder, 3);
        let mut messages_builder = arrow::array::ListBuilder::new(neighbor_index_builder);

        (0..num_agents).try_for_each(|_| messages_builder.append(true))?;

        Ok(Arc::new(messages_builder.finish()) as Arc<dyn ArrowArray>)
    }
}
