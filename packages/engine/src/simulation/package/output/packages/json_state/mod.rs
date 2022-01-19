use serde_json::Value;

pub use self::config::JsonStateOutputConfig;
use super::super::*;
use crate::{
    datastore::{
        batch::ArrowBatch,
        schema::{HIDDEN_PREFIX, PRIVATE_PREFIX},
        table::state::ReadState,
    },
    hash_types::Agent,
    simulation::package::{name::PackageName, output},
};

mod config;

pub enum Task {}

pub struct Creator {}

impl PackageCreator for Creator {
    #[tracing::instrument(skip_all)]
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    #[tracing::instrument(skip_all)]
    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        let value = config
            .sim
            .persistence
            .output_config
            .map
            .get(&PackageName::Output(output::Name::JsonState))
            .ok_or_else(|| Error::from("Missing JSON state config"))?;
        let output_config: JsonStateOutputConfig = serde_json::from_value(value.clone())?;
        Ok(Box::new(JsonState {
            sim_run_config: config.clone(),
            output_config,
        }))
    }

    #[tracing::instrument(skip_all)]
    fn persistence_config(&self, config: &ExperimentConfig, _globals: &Globals) -> Result<Value> {
        let config = JsonStateOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

impl GetWorkerExpStartMsg for Creator {
    #[tracing::instrument(skip_all)]
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct JsonState {
    sim_run_config: Arc<SimRunConfig>,
    output_config: JsonStateOutputConfig,
}

impl MaybeCpuBound for JsonState {
    #[tracing::instrument(skip_all)]
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerSimStartMsg for JsonState {
    #[tracing::instrument(skip_all)]
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for JsonState {
    #[tracing::instrument(skip_all)]
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        let agent_states: std::result::Result<Vec<_>, crate::datastore::error::Error> = state
            .agent_pool()
            .read_batches()?
            .into_iter()
            .zip(state.message_pool().read_batches()?.into_iter())
            .map(|(agent_batch, message_batch)| {
                (agent_batch.record_batch(), message_batch.record_batch())
                    .into_agent_states(Some(&self.sim_run_config.sim.store.agent_schema))
            })
            .collect();

        let agent_states: Vec<_> = agent_states?
            .into_iter()
            .flatten()
            .map(|mut agent| {
                agent.custom.retain(|key, _| {
                    if key.starts_with(HIDDEN_PREFIX) {
                        self.output_config.retain_hidden
                    } else if key.starts_with(PRIVATE_PREFIX) {
                        self.output_config.retain_private
                    } else {
                        true
                    }
                });
                agent
            })
            .collect();

        Ok(Output::JsonStateOutput(JsonStateOutput {
            inner: agent_states,
        }))
    }
}

#[derive(Debug)]
pub struct JsonStateOutput {
    pub inner: Vec<Agent>,
}
