use stateful::agent::Agent;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Stateful error: {0}")]
    Stateful(#[from] stateful::Error),

    #[error("Execution error: {0}")]
    Execution(#[from] execution::Error),

    #[error("Datastore Error: {0}")]
    DataStore(#[from] crate::datastore::Error),

    #[error("Controller Error: {0}")]
    Controller(#[from] super::controller::Error),

    #[error("Tokio oneshot recv: {0}")]
    TokioOneshotRecv(#[from] tokio::sync::oneshot::error::RecvError),

    #[error("Unexpected message to hash with type {message_type}")]
    UnexpectedSystemMessage { message_type: String },

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error(
        "Received an incorrect `remove_agent` message: {0}. Valid examples: 1) {{\"agent_id\": \
         \"b2387514-e76a-4695-9831-8d9ac6254468\"}}, 2) None/null 3) {{}}, 4) \"\""
    )]
    RemoveAgentMessage(String),

    #[error(
        "Error parsing `create_agent` message payload, expected valid agent state, got error: \
         {0:?}. Payload was: {1:?}"
    )]
    CreateAgentPayload(serde_json::error::Error, String),

    #[error(
        "`create_agent` message has field \"{0}\" without respective field existing\nDetails: \
         {1:?}"
    )]
    CreateAgentField(String, Agent),

    #[error("Tokio Join Error: {0}")]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error("{0}")]
    RwLock(String),

    #[error("State sync failed: {0}")]
    StateSync(String),
}

impl Error {
    /// TODO: This is a temporary fix for the dependency cycle
    ///       between simulation and worker errors.
    pub fn state_sync(worker_error: execution::Error) -> Self {
        Self::StateSync(format!("{:?}", worker_error))
    }
}

impl From<Error> for execution::Error {
    fn from(error: Error) -> Self {
        execution::Error::from(error.to_string())
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
