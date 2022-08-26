//! Package to create an API request and store the result in the context.

mod fields;
mod handlers;
mod response;
mod writer;

use std::sync::Arc;

use arrow2::{
    array::ListArray,
    datatypes::{DataType, Field},
};
use async_trait::async_trait;
use futures::{stream::FuturesOrdered, StreamExt};
use stateful::{
    agent,
    context::{ContextColumn, ContextSchema},
    field::{FieldSpecMapAccessor, RootFieldKey, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
    message::MessageReader,
    proxy::BatchPool,
    state::{StateReadProxy, StateSnapshot},
};
use tracing::{Instrument, Span};

pub use self::handlers::CustomApiMessageError;
use self::response::{ApiResponseMap, ApiResponses};
use crate::{
    package::simulation::{
        context::{
            api_requests::fields::API_RESPONSES_FIELD_NAME, ContextPackage, ContextPackageCreator,
        },
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Error, Result,
};

const CPU_BOUND: bool = false;

pub struct ApiRequestsCreator;

impl ContextPackageCreator for ApiRequestsCreator {
    fn create(
        &self,
        config: &PackageCreatorConfig,
        _init_config: &PackageInitConfig,
        _comms: PackageComms,
        _state_field_spec_accessor: FieldSpecMapAccessor,
        context_field_spec_accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        let custom_message_handlers = custom_message_handlers_from_globals(&config.globals)?;
        Ok(Box::new(ApiRequests {
            custom_message_handlers,
            context_field_spec_accessor,
        }))
    }

    fn get_context_field_specs(
        &self,
        _config: &PackageInitConfig,
        _globals: &Globals,
        field_spec_creator: &RootFieldSpecCreator,
    ) -> Result<Vec<RootFieldSpec>> {
        Ok(vec![fields::get_api_responses_field_spec(
            field_spec_creator,
        )?])
    }
}

impl PackageCreator for ApiRequestsCreator {}

pub struct ApiRequests {
    custom_message_handlers: Option<Vec<String>>,
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl MaybeCpuBound for ApiRequests {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl Package for ApiRequests {}

#[async_trait]
impl ContextPackage for ApiRequests {
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
        let batches = agent_pool.batches_iter().collect::<Vec<_>>();
        let responses_per_agent = agent::arrow::agent_id_iter(&batches)?
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
            .create_key()?;

        Ok(vec![ContextColumn::new(
            field_key,
            Box::new(api_responses),
            pkg_span,
        )])
    }

    fn get_empty_arrow_columns(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Vec<(RootFieldKey, Box<dyn arrow2::array::Array>)>> {
        let field_key = self
            .context_field_spec_accessor
            .get_local_hidden_scoped_field_spec(API_RESPONSES_FIELD_NAME)?
            .create_key()?;
        let arrow_fields = context_schema
            .arrow
            .fields
            .iter()
            .find(|field| field.name == field_key.value())
            .map(|field| {
                if let DataType::List(inner_field) = field.data_type() {
                    if let DataType::Struct(sub_fields) = inner_field.data_type() {
                        return sub_fields;
                    }
                }
                unreachable!()
            })
            .ok_or_else(|| Error::ColumnNotFound(field_key.value().to_string()))?
            .clone();

        let api_response_list: ListArray<i32> = ListArray::new_null(
            DataType::List(Box::new(Field::new(
                "item",
                DataType::Struct(arrow_fields),
                true,
            ))),
            num_agents,
        );

        Ok(vec![(field_key, api_response_list.boxed())])
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
        let reader = MessageReader::from_message_pool(message_proxies)?;

        handlers.iter().try_for_each::<_, Result<()>>(|handler| {
            let messages = snapshot.message_map.get_msg_refs(handler);
            if !messages.is_empty() {
                let messages = handlers::gather_requests(&reader, messages)?;
                futs.push_back(handlers::run_custom_message_handler(handler, messages))
            }
            Ok(())
        })?;
    }

    futs.collect::<Vec<Result<ApiResponseMap>>>()
        .await
        .into_iter()
        .collect::<Result<_>>()
}
