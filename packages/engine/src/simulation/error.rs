use crate::datastore::table::task_shared_store::{SharedContext, SharedState};
use crate::hash_types::Agent;
use thiserror::Error as ThisError;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Controller error: {0}")]
    Env(#[from] super::controller::Error),

    #[error("Output error: {0}")]
    Output(#[from] crate::output::Error),

    #[error("Datastore Error: {0}")]
    DataStore(#[from] crate::datastore::Error),

    #[error("Worker Pool error: {0}")]
    WorkerPool(#[from] crate::workerpool::Error),

    #[error("Simulation (id: {0}) failed with error: {1:?}")]
    SimulationRunWorkFailed(String, crate::worker::Error),

    #[error("Kill signal sender for simulation (id: {0}) unexpectedly closed")]
    UnexpectedClosedKillSignalSender(String),

    // #[error("Main Loop Tokio upstream mpsc send error: {0:?}")]
    // TokioUpstreamSend(#[from] tokio::sync::mpsc::error::SendError<Upstream>),
    #[error("Unexpected message to hash with type {message_type}")]
    UnexpectedSystemMessage { message_type: String },

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Uuid error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("HTTP error: {0}")]
    Surf(http_types::StatusCode),

    #[error("Expected to have a migration command for this batch")]
    CommandExpected,

    #[error("Expected to have row actions")]
    ExpectedRowActions,

    #[error("Expected to have buffer actions")]
    ExpectedBufferActions,

    #[error("Unexpected \"Create\" Command")]
    UnexpectedCreateCommand,

    #[error("Expected the \"Create\" Command")]
    ExpectedCreateCommand,

    #[error("Completion message received for batch with no pending work")]
    InvalidCompletionMessage,

    #[error("Received an incorrect `remove_agent` message: {0}. Valid examples: 1) {{\"agent_id\": \"b2387514-e76a-4695-9831-8d9ac6254468\"}}, 2) None/null 3) {{}}, 4) \"\"")]
    RemoveAgentMessage(String),

    #[error("IO: {0:?}")]
    IO(#[from] std::io::Error),

    #[error("Error parsing `create_agent` message payload, expected valid agent state, got error: {0:?}. Payload was: {1:?}")]
    CreateAgentPayload(serde_json::error::Error, String),

    #[error("`create_agent` message has field \"{0}\" without respective field existing\nDetails: {1:?}")]
    CreateAgentField(String, Agent),

    #[error("Error parsing `stop` message payload, expected valid JSON, got error: {0:?}. Payload was: {1:?}")]
    StopSimPayload(serde_json::error::Error, String),

    #[error("Signal send error: {0}")]
    SignalSendError(#[from] tokio::sync::mpsc::error::SendError<()>),

    #[error("The number of parallel workers should be a power of 2")]
    NumParallelWorkers,

    #[error("Invalid behavior name: \"{0}\"")]
    InvalidBehaviorName(String),

    #[error("Behavior names should be valid utf-8 bytes")]
    InvalidBehaviorNameUtf8,

    #[error("Invalid behavior name utf-8: {0}")]
    FromUtf8Error(#[from] std::string::FromUtf8Error),

    #[error("Unexpected undefined command")]
    UnexpectedUndefinedCommand,

    #[error("Invalid analysis metric (name: {name}) for optimization. Value: {value}")]
    InvalidAnalysisOutputForOptimization { name: String, value: String },

    #[error("Can't read empty analysis output: {0}")]
    EmptyAnalysisOutput(String),

    #[error("Can't find analysis output: {0}")]
    MissingAnalysisOutput(String),

    #[error("Handler closed while simulation run was waiting for 'started' message")]
    HandlerClosed,

    #[error("Got 'started' message from handler in middle of simulation run")]
    UnexpectedStartedMessage,

    #[error("KdTree error: {0}")]
    KdTree(#[from] kdtree::ErrorKind),

    #[error("{0}")]
    CustomAPIMessageError(
        #[from] super::packages::context::packages::api_requests::CustomAPIMessageError,
    ),

    #[error("Tokio Join Error: {0}")]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error("Properties parse error. Invalid format for field: {0}")]
    PropertiesParseError(String),

    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow::error::ArrowError),

    // TODO error requires moving the objects
    #[error("State or Context access not allowed for package (with type: {2}). StateAccess: {0}, ContextAccess: {1}.")]
    AccessNotAllowed(SharedState, SharedContext, String),

    #[error("Distribution node handling is not implemented for this message type")]
    DistributionNodeHandlerNotImplemented,

    #[error("Worker node handling is not implemented for this message type")]
    WorkerNodeHandlerNotImplemented,
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

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock read error for simulation".into())
    }
}

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock write error for simulation".into())
    }
}
