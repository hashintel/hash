mod config;

use async_trait::async_trait;
use serde_json::Value;
use stateful::{
    agent::Agent,
    field::{EngineComponent, FieldScope},
};

pub use self::config::JsonStateOutputConfig;
use crate::{
    datastore::arrow::batch_conversion::IntoAgents,
    simulation::package::{
        name::PackageName,
        output,
        output::{
            Arc, Context, Error, ExperimentConfig, FieldSpecMapAccessor, GetWorkerExpStartMsg,
            GetWorkerSimStartMsg, Globals, MaybeCpuBound, Output, Package, PackageComms,
            PackageCreator, Result, SimRunConfig, Span, State,
        },
    },
};

// TODO: UNUSED: Needs triage
pub enum Task {}

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor<EngineComponent>,
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

    fn persistence_config(&self, config: &ExperimentConfig, _globals: &Globals) -> Result<Value> {
        let config = JsonStateOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct JsonState {
    sim_run_config: Arc<SimRunConfig>,
    output_config: JsonStateOutputConfig,
}

impl MaybeCpuBound for JsonState {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerSimStartMsg for JsonState {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for JsonState {
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        let state = state.read()?;
        let agent_states: crate::datastore::Result<Vec<_>> = state
            .agent_pool()
            .batches_iter()
            .zip(state.message_pool().batches_iter())
            .map(|(agent_batch, message_batch)| {
                (
                    agent_batch.batch.record_batch()?,
                    message_batch.batch.record_batch()?,
                )
                    .into_agent_states(Some(&self.sim_run_config.sim.store.agent_schema))
            })
            .collect();

        let agent_states: Vec<_> = agent_states?
            .into_iter()
            .flatten()
            .map(|mut agent| {
                agent.custom.retain(|key, _| {
                    if key.starts_with(FieldScope::Hidden.prefix()) {
                        self.output_config.retain_hidden
                    } else if key.starts_with(FieldScope::Private.prefix()) {
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

    fn span(&self) -> Span {
        tracing::debug_span!("json_state")
    }
}

#[derive(Debug)]
pub struct JsonStateOutput {
    pub inner: Vec<Agent>,
}
