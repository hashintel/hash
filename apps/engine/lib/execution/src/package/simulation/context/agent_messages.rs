//! Messages sending between agents and to the engine.

mod collected;
mod fields;
mod indices;
mod writer;

use std::sync::Arc;

use arrow2::{
    array::{Array, MutableFixedSizeListArray, MutableListArray, MutablePrimitiveArray, TryExtend},
    datatypes::{DataType, Field},
};
use async_trait::async_trait;
use serde_json::Value;
use stateful::{
    agent,
    context::{ContextColumn, ContextSchema},
    field::{FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    state::{StateReadProxy, StateSnapshot},
};
use tracing::Span;

use self::{collected::Messages, fields::MESSAGES_FIELD_NAME};
use crate::{
    package::simulation::{
        context::{ContextPackage, ContextPackageCreator},
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Result,
};

const CPU_BOUND: bool = true;
pub const MESSAGE_INDEX_COUNT: usize = 3;

pub type IndexType = u32;

pub struct AgentMessagesCreator;

impl ContextPackageCreator for AgentMessagesCreator {
    fn create(
        &self,
        _config: &PackageCreatorConfig,
        _init_config: &PackageInitConfig,
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
        _config: &PackageInitConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_messages_field_spec(field_spec_creator)?])
    }
}

impl PackageCreator for AgentMessagesCreator {
    fn worker_init_message(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

pub struct AgentMessages {
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl MaybeCpuBound for AgentMessages {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl Package for AgentMessages {
    fn simulation_setup_message(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl ContextPackage for AgentMessages {
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
        let batches = agent_pool.batches_iter().collect::<Vec<_>>();
        let id_name_iter =
            agent::arrow::agent_id_iter(&batches)?.zip(agent::arrow::agent_name_iter(&batches)?);

        let messages = Messages::gather(&snapshot.message_map, id_name_iter)?;
        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(MESSAGES_FIELD_NAME)?
            .create_key()?;

        Ok(vec![ContextColumn::new(
            field_key,
            Box::new(messages),
            pkg_span,
        )])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        _schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Box<dyn Array>)>> {
        let index_builder = MutablePrimitiveArray::<u32>::with_capacity(1024);
        let loc_builder = MutableFixedSizeListArray::new(index_builder, 3);
        let mut messages_builder: MutableListArray<
            i32,
            MutableFixedSizeListArray<MutablePrimitiveArray<u32>>,
        > = MutableListArray::new_from(
            loc_builder,
            DataType::List(Box::new(Field::new(
                // todo: use a better field name for this
                // Asana task: https://app.asana.com/0/1199548034582004/1202829751949507/f
                "item",
                DataType::FixedSizeList(Box::new(Field::new("item", DataType::UInt32, true)), 3),
                true,
            ))),
            num_agents,
        );

        messages_builder
            .try_extend((0..num_agents).map(|_| Option::<Vec<Option<Vec<Option<u32>>>>>::None))?;

        let messages = messages_builder.into_box();

        assert_eq!(messages.len(), num_agents);

        let field_key = self
            .context_field_spec_accessor
            .get_agent_scoped_field_spec(MESSAGES_FIELD_NAME)?
            .create_key()?;

        Ok(vec![(field_key, messages)])
    }

    fn span(&self) -> Span {
        tracing::debug_span!("agent_messages")
    }
}
