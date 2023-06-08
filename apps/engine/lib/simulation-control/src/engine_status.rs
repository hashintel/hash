use execution::{
    package::simulation::SimulationId,
    runner::{
        comms::{PackageError, UserError, UserWarning},
        RunnerError,
    },
};
use serde::{Deserialize, Serialize};
use stateful::global::Globals;

use crate::SimStatus;

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
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
