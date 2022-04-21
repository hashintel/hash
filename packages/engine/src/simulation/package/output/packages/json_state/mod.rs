mod config;

use async_trait::async_trait;
use execution::package::PackageInitConfig;
use serde_json::Value;
use stateful::{
    agent::{Agent, AgentSchema, IntoAgents},
    context::Context,
    field::FieldScope,
    global::Globals,
    state::State,
};

pub use self::config::JsonStateOutputConfig;
use crate::simulation::package::{
    name::PackageName,
    output,
    output::{
        Arc, Error, FieldSpecMapAccessor, MaybeCpuBound, Output, OutputPackage,
        OutputPackageCreator, Package, PackageComms, PackageCreator, Result, Span,
    },
    PackageCreatorConfig,
};

// TODO: UNUSED: Needs triage
pub enum Task {}

pub struct JsonStateCreator;

impl OutputPackageCreator for JsonStateCreator {
    fn create(
        &self,
        config: &PackageCreatorConfig,
        _init_config: &PackageInitConfig,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn OutputPackage>> {
        let value = config
            .persistence
            .output_config
            .map
            .get(&PackageName::Output(output::Name::JsonState))
            .ok_or_else(|| Error::from("Missing JSON state config"))?;
        let output_config: JsonStateOutputConfig = serde_json::from_value(value.clone())?;
        Ok(Box::new(JsonState {
            agent_schema: Arc::clone(&config.agent_schema),
            output_config,
        }))
    }

    fn persistence_config(&self, config: &PackageInitConfig, _globals: &Globals) -> Result<Value> {
        let config = JsonStateOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

impl PackageCreator for JsonStateCreator {
    fn init_message(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct JsonState {
    agent_schema: Arc<AgentSchema>,
    output_config: JsonStateOutputConfig,
}

impl MaybeCpuBound for JsonState {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl Package for JsonState {
    fn start_message(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl OutputPackage for JsonState {
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        let state = state.read()?;
        let agent_states: stateful::Result<Vec<_>> = state
            .agent_pool()
            .batches_iter()
            .zip(state.message_pool().batches_iter())
            .map(|(agent_batch, message_batch)| {
                (
                    agent_batch.batch.record_batch()?,
                    message_batch.batch.record_batch()?,
                )
                    .to_agent_states(Some(&self.agent_schema))
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
