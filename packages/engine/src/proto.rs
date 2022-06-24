use execution::{
    package::{experiment::ExperimentId, simulation::SimulationId},
    runner::{
        comms::{PackageError, UserError, UserWarning},
        RunnerError,
    },
};
use experiment_structure::ExperimentRun;
use serde::{Deserialize, Serialize};
use stateful::global::Globals;

use crate::simulation::status::SimStatus;

/// The message type sent from the engine to the orchestrator.
#[derive(Serialize, Deserialize, Debug)]
pub struct OrchestratorMsg {
    pub experiment_id: ExperimentId,
    pub body: EngineStatus,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub enum EngineStatus {
    Started,
    SimStatus(SimStatus),
    Exit,
    ProcessError(String),
    Stopping,
    SimStart {
        sim_id: SimulationId,
        globals: Globals,
    },
    SimStop(SimulationId),
    // TODO: OS - Confirm are these only Runner/Simulation errors, if so rename
    RunnerErrors(SimulationId, Vec<RunnerError>),
    RunnerWarnings(SimulationId, Vec<RunnerError>),
    UserErrors(SimulationId, Vec<UserError>),
    UserWarnings(SimulationId, Vec<UserWarning>),
    PackageError(SimulationId, PackageError),
    Logs(SimulationId, Vec<String>),
}

/// The message type sent from the orchestrator to the engine.
#[derive(Serialize, Deserialize, Debug)]
pub enum EngineMsg {
    Init(InitMessage),
}

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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ExecutionEnvironment {
    Local { port: u16 },
    Staging,
    Production,
    None,
}

impl Default for ExecutionEnvironment {
    fn default() -> Self {
        ExecutionEnvironment::None
    }
}

impl EngineStatus {
    pub fn kind(&self) -> &'static str {
        match self {
            EngineStatus::Started => "Started",
            EngineStatus::SimStatus(_) => "SimStatus",
            EngineStatus::Exit => "Exit",
            EngineStatus::ProcessError(_) => "ProcessError",
            EngineStatus::Stopping => "Stopping",
            EngineStatus::SimStart {
                sim_id: _,
                globals: _,
            } => "SimStart",
            EngineStatus::SimStop(_) => "SimStop",
            EngineStatus::RunnerErrors(..) => "RunnerErrors",
            EngineStatus::RunnerWarnings(..) => "RunnerWarnings",
            EngineStatus::Logs(..) => "Logs",
            EngineStatus::UserErrors(..) => "UserErrors",
            EngineStatus::UserWarnings(..) => "UserWarnings",
            EngineStatus::PackageError(..) => "PackageError",
        }
    }
}
