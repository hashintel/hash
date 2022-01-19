use arrow::error::ArrowError;
use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

use crate::worker::{
    runner::{comms::inbound::InboundToRunnerMsgPayload, rust::behaviors::error::SimulationError},
    SimulationShortId,
};

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Arrow: {0}")]
    Arrow(#[from] ArrowError),

    // TODO: JSON parse error?
    #[error("{0}: IO {1}")]
    IO(String, std::io::Error), // First element is path.

    #[error("Couldn't import package {0}: {1}")]
    PackageImport(String, String), // First element is path/name.

    #[error("Missing simulation run with id {0}")]
    MissingSimRun(crate::proto::SimulationShortId),

    #[error("Task target must be py, js, rs, dyn or main, not {0}")]
    UnknownTarget(String),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(SendError<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>),

    #[error("Couldn't receive outbound message from runner")]
    OutboundReceive,

    #[error("Message type '{0}' must have a simulation run id")]
    SimulationIDRequired(&'static str),

    #[error("Simulation error: {0}")]
    Simulation(#[from] SimulationError),

    #[error("Field not available in Rust runner: {0}")]
    InvalidRustColumn(String),

    #[error("Datastore: {0}")]
    Datastore(#[from] crate::datastore::error::Error),
}

impl From<&str> for Error {
    #[tracing::instrument(skip_all)]
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

impl From<String> for Error {
    #[tracing::instrument(skip_all)]
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}
