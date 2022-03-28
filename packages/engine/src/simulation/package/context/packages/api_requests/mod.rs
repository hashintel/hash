mod fields;
mod handlers;
mod response;
mod writer;

use arrow::datatypes::DataType;
pub use async_trait::async_trait;
use futures::{stream::FuturesOrdered, StreamExt};
pub use handlers::CustomApiMessageError;
use response::{ApiResponseMap, ApiResponses};
use serde_json::Value;
use tracing::{Instrument, Span};

use super::super::{
    Arc, ContextColumn, ContextSchema, Error, FieldSpec, FieldSpecMapAccessor,
    GetWorkerExpStartMsg, GetWorkerSimStartMsg, MaybeCpuBound, PackageCreator, RootFieldSpec,
    RootFieldSpecCreator, SimRunConfig, StateReadProxy, StateSnapshot,
};
use crate::{
    config::Globals,
    datastore::{
        batch::iterators,
        schema::{accessor::GetFieldSpec, FieldKey},
        table::pool::BatchPool,
    },
    simulation::{
        comms::package::PackageComms,
        package::context::{packages::api_requests::fields::API_RESPONSES_FIELD_NAME, Package},
    },
};
pub use crate::{
    config::{ExperimentConfig, SimulationConfig},
    datastore::table::{context::Context, state::State},
    simulation::{
        comms::Comms,
        package::{
            context::Package as ContextPackage, init::Package as InitPackage,
            output::Package as OutputPackage, state::Package as StatePackage,
        },
        Result,
    },
};

const CPU_BOUND: bool = false;

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        let custom_message_handlers = custom_message_handlers_from_globals(&config.sim.globals)?;
        Ok(Box::new(ApiRequests {
            custom_message_handlers,
            context_field_spec_accessor,
        }))
    }

    fn get_context_field_specs(
        &self,
        _config: &ExperimentConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_api_responses_field_spec(
            field_spec_creator,
        )?])
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct ApiRequests {
    custom_message_handlers: Option<Vec<String>>,
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl MaybeCpuBound for ApiRequests {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl GetWorkerSimStartMsg for ApiRequests {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for ApiRequests {
    async fn run<'s>(
        &mut self,
        state_proxy: StateReadProxy,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>> {
        // We want to pass the span for the package to the writer, so that the write() call isn't
        // nested under the run span
        let pkg_span = Span::current();
        let run_span = tracing::trace_span!("run"); // store an un-entered span for the async

        let mut api_response_maps = if let Some(ref handlers) = self.custom_message_handlers {
            build_api_response_maps(&snapshot, handlers)
                .instrument(run_span.clone())
                .await
        } else {
            Ok(vec![])
        }?;

        let _entered = run_span.entered(); // The rest of this is sync so this is fine

        let agent_pool = state_proxy.agent_pool();
        let batches = agent_pool.batches();
        let responses_per_agent = iterators::agent::agent_id_iter(&batches)?
            .map(move |agent_id| {
                let mut ext_responses = vec![];
                api_response_maps
                    .iter_mut()
                    .for_each(|v| ext_responses.append(&mut v.take_for_agent(agent_id)));
                ext_responses
            })
            .collect::<Vec<_>>();

        let api_responses = ApiResponses::from(responses_per_agent);
        let field_key = self
            .context_field_spec_accessor
            .get_local_hidden_scoped_field_spec(API_RESPONSES_FIELD_NAME)?
            .to_key()?;

        Ok(vec![ContextColumn {
            field_key,
            inner: Box::new(api_responses),
            span: pkg_span,
        }])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Vec<(FieldKey, Arc<dyn arrow::array::Array>)>> {
        let from_builder = Box::new(arrow::array::StringBuilder::new(1024));
        let type_builder = Box::new(arrow::array::StringBuilder::new(1024));
        let data_builder = Box::new(arrow::array::StringBuilder::new(1024));

        let field_key = self
            .context_field_spec_accessor
            .get_local_hidden_scoped_field_spec(API_RESPONSES_FIELD_NAME)?
            .to_key()?;
        let arrow_fields = context_schema
            .arrow
            .field_with_name(field_key.value())
            .map(|field| {
                if let DataType::List(inner_field) = field.data_type() {
                    if let DataType::Struct(sub_fields) = inner_field.data_type() {
                        return sub_fields;
                    }
                }
                unreachable!()
            })?
            .clone();

        let api_response_builder = arrow::array::StructBuilder::new(arrow_fields, vec![
            from_builder,
            type_builder,
            data_builder,
        ]);
        let mut api_response_list_builder = arrow::array::ListBuilder::new(api_response_builder);

        (0..num_agents).try_for_each(|_| api_response_list_builder.append(true))?;

        Ok(vec![(
            field_key,
            Arc::new(api_response_list_builder.finish()),
        )])
    }

    fn span(&self) -> Span {
        tracing::debug_span!("api_requests")
    }
}

pub fn custom_message_handlers_from_globals(globals: &Globals) -> Result<Option<Vec<String>>> {
    globals
        .get_cloned("messageHandlers")
        .map(|handlers| match handlers {
            serde_json::Value::Array(handlers) => handlers
                .into_iter()
                .map(|handler| match handler {
                    serde_json::Value::String(handler) => Ok(handler),
                    _ => Err(Error::GlobalsParseError("messageHandlers".into())),
                })
                .collect::<Result<Vec<String>>>(),
            _ => Err(Error::GlobalsParseError("messageHandlers".into())),
        })
        .transpose()
}

async fn build_api_response_maps(
    snapshot: &StateSnapshot,
    handlers: &[String],
) -> Result<Vec<ApiResponseMap>> {
    let mut futs = FuturesOrdered::new();
    {
        let message_proxies = &snapshot.state.message_pool.read_proxies()?;
        let reader = message_proxies.get_reader()?;

        handlers.iter().try_for_each::<_, Result<()>>(|handler| {
            let messages = snapshot.message_map.get_msg_refs(handler);
            if !messages.is_empty() {
                let messages = handlers::gather_requests(&reader, messages)?;
                futs.push(handlers::run_custom_message_handler(handler, messages))
            }
            Ok(())
        })?;
    }

    futs.collect::<Vec<Result<ApiResponseMap>>>()
        .await
        .into_iter()
        .collect::<Result<_>>()
}
