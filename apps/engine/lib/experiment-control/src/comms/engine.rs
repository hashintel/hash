use experiment_structure::ExperimentRun;
use serde::{Deserialize, Serialize};

use crate::environment::ExecutionEnvironment;

/// The initialization message sent by an Orchestrator implementation to the Engine
#[derive(Serialize, Deserialize, Debug)]
pub struct InitMessage {
    /// Defines the type of Experiment that's being ran (e.g. a wrapper around a single-run of a
    /// simulation, or the configuration for a normal experiment)
    pub experiment: ExperimentRun,
    /// Unused
    pub env: ExecutionEnvironment,
    /// A JSON object of dynamic configurations for things like packages, see
    /// [`OUTPUT_PERSISTENCE_KEY`] for an example
    ///
    /// [`OUTPUT_PERSISTENCE_KEY`]: crate::experiment::controller::[`OUTPUT_PERSISTENCE_KEY`]
    pub dyn_payloads: serde_json::Map<String, serde_json::Value>,
}

/// The message type sent from the orchestrator to the engine.
#[derive(Serialize, Deserialize, Debug)]
pub enum EngineMsg {
    Init(InitMessage),
}
