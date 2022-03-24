use arrow::{datatypes::DataType, error::ArrowError};
use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;
use tracing::Span;

use crate::{
    proto::SimulationShortId,
    simulation::package::id::PackageId,
    worker::runner::comms::{
        inbound::InboundToRunnerMsgPayload,
        outbound::{OutboundFromRunnerMsg, PackageError, UserError},
    },
};

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Can't start JavaScript runner again when it is already running")]
    AlreadyRunning,

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
    Package(PackageError),

    #[error("Couldn't import package {0}: {1}")]
    PackageImport(String, String), // First element is path/name.

    #[error("Couldn't import file {0}: {1}")]
    FileImport(String, String), // First element is path/name.

    #[error("V8: {0}")]
    V8(String),

    #[error("Missing simulation run with id {0}")]
    MissingSimulationRun(SimulationShortId),

    #[error("Couldn't terminate missing simulation run with id {0}")]
    TerminateMissingSimulationRun(SimulationShortId),

    #[error("User JavaScript errors: {0:?}")]
    User(Vec<UserError>),

    #[error("Duplicate package (id, name): {0:?}, {1:?}")]
    DuplicatePackage(PackageId, String),

    #[error("Duplicate simulation run id: {0}")]
    DuplicateSimulationRun(SimulationShortId),

    #[error("Error in embedded JavaScript: {0}")]
    Embedded(String),

    #[error("Task target must be Python, JavaScript, Rust, Dynamic or Main, not {0}")]
    UnknownTarget(String),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(#[from] SendError<(Span, Option<SimulationShortId>, InboundToRunnerMsgPayload)>),

    #[error("Couldn't send outbound message from runner: {0}")]
    OutboundSend(#[from] SendError<OutboundFromRunnerMsg>),

    #[error("Couldn't receive outbound message from runner")]
    OutboundReceive,

    #[error("Couldn't receive inbound message from worker")]
    InboundReceive,

    #[error("Message type '{0}' must have a simulation run id")]
    SimulationIdRequired(&'static str),

    #[error("serde: {0:?}")]
    Serde(#[from] serde_json::Error),
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
