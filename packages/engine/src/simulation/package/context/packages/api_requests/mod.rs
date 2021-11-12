mod fields;
mod handlers;
mod response;
mod writer;

use crate::{
    datastore::{batch::iterators, table::state::ReadState},
    simulation::comms::package::PackageComms,
};

use super::super::*;
use crate::config::Globals;
use futures::{stream::FuturesUnordered, StreamExt};
use response::{APIResponseMap, APIResponses};
use serde_json::Value;

use crate::simulation::package::context::packages::api_requests::fields::api_response_fields;
pub use handlers::CustomAPIMessageError;

const CPU_BOUND: bool = false;

pub struct Creator {}

impl Creator {
    pub fn new() -> Box<dyn PackageCreator> {
        Box::new(Creator {})
    }
}

impl PackageCreator for Creator {
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        _comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn ContextPackage>> {
        let custom_message_handlers = custom_message_handlers_from_properties(&config.sim.globals)?;
        Ok(Box::new(APIRequests {
            custom_message_handlers,
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

struct APIRequests {
    custom_message_handlers: Option<Vec<String>>,
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
    ) -> Result<ContextColumn> {
        let mut api_response_maps = if let Some(ref handlers) = self.custom_message_handlers {
            let futs = FuturesUnordered::new();
            {
                let message_pool = snapshot.message_pool();
                let message_pool_read = message_pool
                    .read()
                    .map_err(|e| Error::from(e.to_string()))?;
                let reader = message_pool_read.get_reader();

                handlers.iter().try_for_each::<_, Result<()>>(|handler| {
                    let messages = snapshot.message_map().get_msg_refs(handler);
                    if messages.len() > 0 {
                        let messages = handlers::gather_requests(handler, &reader, messages)?;
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

        Ok(ContextColumn {
            inner: Box::new(api_responses),
        })
    }

    fn get_empty_arrow_column(
        &self,
        num_agents: usize,
        context_schema: &ContextSchema,
    ) -> Result<Arc<dyn arrow::array::Array>> {
        let from_builder = Box::new(arrow::array::StringBuilder::new(1024));
        let type_builder = Box::new(arrow::array::StringBuilder::new(1024));
        let data_builder = Box::new(arrow::array::StringBuilder::new(1024));
        let arrow_fields = api_response_fields()
            .into_iter()
            .map(|field| {
                context_schema
                    .arrow
                    .field_with_name(&field.name)
                    .map(Clone::clone)
                    .map_err(|err| err.into())
            })
            .collect::<Result<Vec<_>>>()?;
        let api_response_builder = arrow::array::StructBuilder::new(
            arrow_fields,
            vec![from_builder, type_builder, data_builder],
        );
        let mut api_response_list_builder = arrow::array::ListBuilder::new(api_response_builder);

        (0..num_agents).try_for_each(|_| api_response_list_builder.append(true))?;

        Ok(Arc::new(api_response_list_builder.finish()) as Arc<dyn ArrowArray>)
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
