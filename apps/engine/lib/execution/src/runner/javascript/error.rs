use arrow2::datatypes::DataType;
use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;
use tracing::Span;

use crate::{
    package::simulation::SimulationId,
    runner::comms::{InboundToRunnerMsgPayload, OutboundFromRunnerMsg, PackageError, UserError},
};

pub type JavaScriptResult<T, E = JavaScriptError> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum JavaScriptError {
    #[error("{0}")]
    Unique(String),

    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error("Can't start JavaScript runner again when it is already running")]
    AlreadyRunning,

    #[error("Arrow: {0}")]
    Arrow(#[from] arrow2::error::Error),

    #[error("Unsupported flush datatype: {0:?}")]
    FlushType(DataType),

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
    MissingSimulationRun(SimulationId),

    #[error("Couldn't terminate missing simulation run with id {0}")]
    TerminateMissingSimulationRun(SimulationId),

    #[error("User JavaScript errors: {0:?}")]
    User(Vec<UserError>),

    #[error("Duplicate simulation run id: {0}")]
    DuplicateSimulationRun(SimulationId),

    #[error("Error in embedded JavaScript: {0}")]
    Embedded(String),

    #[error("Task target must be Python, JavaScript, Rust, Dynamic or Main, not {0}")]
    UnknownTarget(String),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(#[from] SendError<(Span, Option<SimulationId>, InboundToRunnerMsgPayload)>),

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

    #[error("Couldn't access JavaScript file {0}: {1}")]
    AccessJavascriptImport(String, String),

    #[error("Exception occurred in JavaScript: {0}{}", match .1 {
        Some(exception_message) => format!(", with exception message: {exception_message}"),
        None => String::new()
    })]
    JavascriptException(String, Option<String>),

    #[error("Could not compile TypeScript file {filename}: {error}")]
    TypeScriptCompilation { filename: String, error: String },
}

impl From<&str> for JavaScriptError {
    fn from(s: &str) -> Self {
        Self::Unique(s.to_string())
    }
}

impl From<String> for JavaScriptError {
    fn from(s: String) -> Self {
        Self::Unique(s)
    }
}
