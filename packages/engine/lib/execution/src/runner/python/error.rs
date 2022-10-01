use pyo3::PyErr;
use tokio::sync::mpsc::error::SendError;
use tracing::Span;

use crate::{
    package::simulation::SimulationId,
    runner::comms::{InboundToRunnerMsgPayload, OutboundFromRunnerMsg},
};

#[derive(thiserror::Error, Debug)]
pub enum PythonError {
    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error("simulation id required: {0}")]
    SimulationIdRequired(String),

    #[error("python error: `{0:?}`")]
    PyErr(#[from] PyErr),

    #[error("{0}")]
    Unique(String),

    #[error("serde: {0:?}")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    TerminateMissingSimulationRun(SimulationId),

    #[error("io error")]
    IO(String, std::io::Error),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(#[from] SendError<(Span, Option<SimulationId>, InboundToRunnerMsgPayload)>),

    #[error("Couldn't send outbound message from runner: {0}")]
    OutboundSend(#[from] SendError<OutboundFromRunnerMsg>),

    #[error("Couldn't receive outbound message from runner")]
    OutboundReceive,

    #[error("Couldn't receive inbound message from worker")]
    InboundReceive,

    #[error("Can't start Python runner (again) as it is already running")]
    AlreadyRunning,

    #[error("Duplicate simulation run id: {0}")]
    DuplicateSimulationRun(SimulationId),
}
