mod collected;
mod fields;
mod indices;
mod writer;

use self::collected::Messages;
use crate::datastore::schema::accessor::GetFieldSpec;
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
        _state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        Ok(Box::new(AgentMessages {
            context_field_spec_accessor,
        }))
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

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct AgentMessages {
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl MaybeCPUBound for AgentMessages {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl GetWorkerSimStartMsg for AgentMessages {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
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
        let id_name_iter = iterators::agent::agent_id_iter(&batches)?
            .zip(iterators::agent::agent_name_iter(&batches)?);

        let messages = Messages::gather(snapshot.message_map(), id_name_iter)?;

        Ok(ContextColumn {
            inner: Box::new(messages),
        })
    }

    fn get_empty_arrow_column(
        &self,
        num_agents: usize,
        _schema: &ContextSchema,
    ) -> Result<(FieldKey, Arc<dyn ArrowArray>)> {
        let index_builder = ArrowIndexBuilder::new(1024);

        let neighbor_index_builder = arrow::array::FixedSizeListBuilder::new(index_builder, 3);
        let mut messages_builder = arrow::array::ListBuilder::new(neighbor_index_builder);

        (0..num_agents).try_for_each(|_| messages_builder.append(true))?;

        // TODO, this is unclean, we won't have to do this if we move empty arrow
        //   initialisation to be done per schema instead of per package
        let field_key = self
            .context_field_spec_accessor
            .get_local_hidden_scoped_field_spec("agent_messages")?
            .to_key()?;

        Ok((
            field_key,
            Arc::new(messages_builder.finish()) as Arc<dyn ArrowArray>,
        ))
    }
}
