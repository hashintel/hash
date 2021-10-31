use crate::{
    simulation::packages::id::PackageId,
    worker::runner::comms::{inbound::InboundToRunnerMsgPayload, outbound::RunnerError},
};
use arrow::datatypes::DataType;
use arrow::error::ArrowError;
use tokio::sync::mpsc::error::SendError;

use super::mini_v8 as mv8;
use crate::proto::SimulationShortID;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Arrow: {0}")]
    Arrow(#[from] ArrowError),

    #[error("Unsupported flush datatype: {0:?}")]
    FlushType(DataType),

    #[error("Datastore: {0}")]
    Datastore(#[from] crate::datastore::error::Error),

    // TODO: Missing sim in JS runtime? (Currently just internal JS error.)
    // TODO: JSON parse error?
    #[error("{0}: IO {1}")]
    IO(String, std::io::Error), // First element is path.

    #[error("Couldn't run JS {0}: {1}")]
    Eval(String, String), // First element is path/name.

    #[error("Error in package: {0}")]
    Package(String),

    #[error("Couldn't import package {0}: {1}")]
    PackageImport(String, String), // First element is path/name.

    #[error("Couldn't import file {0}: {1}")]
    FileImport(String, String), // First element is path/name.

    #[error("V8: {0}")]
    V8(String),

    #[error("Missing simulation run with id {0}")]
    MissingSimulationRun(SimulationShortID),

    #[error("Couldn't terminate missing simulation run with id {0}")]
    TerminateMissingSimulationRun(SimulationShortID),

    #[error("User JavaScript errors: {0:?}")]
    User(Vec<RunnerError>),

    #[error("Duplicate package (id, name): {0:?}, {1:?}")]
    DuplicatePackage(PackageId, String),

    #[error("Duplicate simulation run id: {0}")]
    DuplicateSimulationRun(SimulationShortID),

    #[error("Error in embedded JavaScript: {0}")]
    Embedded(String),

    #[error("Task target must be py, js, rs, dyn or main, not {0}")]
    UnknownTarget(String),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(SendError<(Option<SimulationShortID>, InboundToRunnerMsgPayload)>),

    #[error("Couldn't receive outbound message from runner")]
    OutboundReceive,

    #[error("Message type '{0}' must have a simulation run id")]
    SimulationIDRequired(&'static str),
}

impl From<mv8::Error<'_>> for Error {
    fn from(e: mv8::Error<'_>) -> Self {
        Error::V8(format!("{:?}", e))
    }
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}
