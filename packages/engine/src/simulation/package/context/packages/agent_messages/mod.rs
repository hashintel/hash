mod collected;
mod fields;
mod indices;
mod writer;

use arrow::array::{Array, FixedSizeListBuilder, ListBuilder};
use async_trait::async_trait;
use serde_json::Value;
use stateful::{
    field::{RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    globals::Globals,
};
use tracing::Span;

use self::collected::Messages;
use crate::{
    config::ExperimentConfig,
    datastore::batch::iterators,
    simulation::{
        comms::package::PackageComms,
        package::context::{
            packages::agent_messages::fields::MESSAGES_FIELD_NAME, Arc, ContextColumn,
            ContextSchema, FieldSpecMapAccessor, GetWorkerExpStartMsg, GetWorkerSimStartMsg,
            MaybeCpuBound, Package as ContextPackage, Package, PackageCreator, SimRunConfig,
            StateReadProxy, StateSnapshot,
        },
        Result,
    },
};

const CPU_BOUND: bool = true;
pub const MESSAGE_INDEX_COUNT: usize = 3;

pub type IndexType = u32;
pub type ArrowIndexBuilder = arrow::array::UInt32Builder;

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        _config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        Ok(Box::new(AgentMessages {
            context_field_spec_accessor,
        }))
    }

    fn get_context_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_messages_field_spec(field_spec_creator)?])
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

impl MaybeCpuBound for AgentMessages {
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
        state_proxy: StateReadProxy,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>> {
        // We want to pass the span for the package to the writer, so that the write() call isn't
        // nested under the run span
        let pkg_span = Span::current();
        let _run_entered = tracing::trace_span!("run").entered();
        let agent_pool = state_proxy.agent_pool();
        let batches = agent_pool.batches();
        let id_name_iter = iterators::agent::agent_id_iter(&batches)?
            .zip(iterators::agent::agent_name_iter(&batches)?);

        let messages = Messages::gather(&snapshot.message_map, id_name_iter)?;
        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(MESSAGES_FIELD_NAME)?
            .create_key()?;

        Ok(vec![ContextColumn {
            field_key,
            inner: Box::new(messages),
            span: pkg_span,
        }])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        _schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Arc<dyn Array>)>> {
        let index_builder = ArrowIndexBuilder::new(1024);
        let loc_builder = FixedSizeListBuilder::new(index_builder, 3);
        let mut messages_builder = ListBuilder::new(loc_builder);

        (0..num_agents).try_for_each(|_| messages_builder.append(true))?;

        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(MESSAGES_FIELD_NAME)?
            .create_key()?;

        Ok(vec![(field_key, Arc::new(messages_builder.finish()))])
    }

    fn span(&self) -> Span {
        tracing::debug_span!("agent_messages")
    }
}
