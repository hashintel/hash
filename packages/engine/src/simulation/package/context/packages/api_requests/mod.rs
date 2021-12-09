mod fields;
mod handlers;
mod response;
mod writer;

use crate::{
    datastore::{batch::iterators, table::state::ReadState},
    simulation::comms::package::PackageComms,
};
use arrow::datatypes::DataType;

use super::super::*;
use crate::config::Globals;
use futures::{stream::FuturesOrdered, StreamExt};
use response::{APIResponseMap, APIResponses};
use serde_json::Value;

use crate::datastore::schema::accessor::GetFieldSpec;
use crate::datastore::schema::FieldKey;

use crate::simulation::package::context::packages::api_requests::fields::API_RESPONSES_FIELD_NAME;
pub use handlers::CustomAPIMessageError;

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
        let custom_message_handlers = custom_message_handlers_from_properties(&config.sim.globals)?;
        Ok(Box::new(APIRequests {
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

struct APIRequests {
    custom_message_handlers: Option<Vec<String>>,
    context_field_spec_accessor: FieldSpecMapAccessor,
}

impl MaybeCPUBound for APIRequests {
    fn cpu_bound(&self) -> bool {
        CPU_BOUND
    }
}

impl GetWorkerSimStartMsg for APIRequests {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for APIRequests {
    async fn run<'s>(
        &mut self,
        state: Arc<State>,
        snapshot: Arc<StateSnapshot>,
    ) -> Result<Vec<ContextColumn>> {
        let mut api_response_maps = if let Some(ref handlers) = self.custom_message_handlers {
            let mut futs = FuturesOrdered::new();
            {
                let message_pool = snapshot.message_pool();
                let message_pool_read = message_pool
                    .read()
                    .map_err(|e| Error::from(e.to_string()))?;
                let reader = message_pool_read.get_reader();

                handlers.iter().try_for_each::<_, Result<()>>(|handler| {
                    let messages = snapshot.message_map().get_msg_refs(handler);
                    if messages.len() > 0 {
                        let messages = handlers::gather_requests(&reader, messages)?;
                        futs.push(handlers::run_custom_message_handler(handler, messages))
                    }
                    Ok(())
                })?;
            }

            futs.collect::<Vec<Result<APIResponseMap>>>()
                .await
                .into_iter()
                .collect::<Result<_>>()
        } else {
            Ok(vec![])
        }?;

        let agent_pool = state.agent_pool();
        let batches = agent_pool.read_batches()?;
        let responses_per_agent = iterators::agent::agent_id_iter(&batches)?
            .map(move |agent_id| {
                let mut ext_responses = vec![];
                api_response_maps
                    .iter_mut()
                    .for_each(|v| ext_responses.append(&mut v.take_for_agent(agent_id)));
                ext_responses
            })
            .collect::<Vec<_>>();

        let api_responses = APIResponses::from(responses_per_agent);
        let field_key = self
            .context_field_spec_accessor
            .get_local_hidden_scoped_field_spec(API_RESPONSES_FIELD_NAME)?
            .to_key()?;

        Ok(vec![ContextColumn {
            field_key,
            inner: Box::new(api_responses),
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
            .map(|field| match field.data_type() {
                DataType::List(box DataType::Struct(sub_fields)) => sub_fields,
                _ => {
                    unreachable!()
                }
            })?
            .clone();

        let api_response_builder = arrow::array::StructBuilder::new(
            arrow_fields,
            vec![from_builder, type_builder, data_builder],
        );
        let mut api_response_list_builder = arrow::array::ListBuilder::new(api_response_builder);

        (0..num_agents).try_for_each(|_| api_response_list_builder.append(true))?;

        Ok(vec![(
            field_key,
            Arc::new(api_response_list_builder.finish()) as Arc<dyn ArrowArray>,
        )])
    }
}

pub fn custom_message_handlers_from_properties(
    properties: &Globals,
) -> Result<Option<Vec<String>>> {
    properties
        .get_cloned("messageHandlers")
        .map(|handlers| match handlers {
            serde_json::Value::Array(handlers) => handlers
                .into_iter()
                .map(|handler| match handler {
                    serde_json::Value::String(handler) => Ok(handler),
                    _ => return Err(Error::PropertiesParseError("messageHandlers".into())),
                })
                .collect::<Result<Vec<String>>>(),
            _ => return Err(Error::PropertiesParseError("messageHandlers".into())),
        })
        .transpose()
}
