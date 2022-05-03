use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

use crate::worker::runner::{javascript::Error as JavaScriptError, python::Error as PythonError};

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Unexpected target for a message {0:?}")]
    UnexpectedTarget(execution::runner::MessageTarget),

    #[error("Datastore: {0}")]
    Datastore(#[from] crate::datastore::Error),

    #[error("Execution error: {0}")]
    Execution(#[from] execution::Error),

    #[error("Task already exists (id: {0})")]
    TaskAlreadyExists(execution::task::TaskId),

    #[error("Python runner error: {0}")]
    Python(#[from] PythonError),

    #[error("JavaScript runner error: {0}")]
    JavaScript(#[from] JavaScriptError),

    // #[error("Rust runner error: {0}")]
    // Rust(#[from] RustError),
    #[error("Simulation: {0}")]
    Simulation(#[from] crate::simulation::Error),

    #[error("Tokio Join Error: {0}")]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error("Io Error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serde: {0:?}")]
    Serde(#[from] serde_json::Error),

    #[error("Uuid error: {0}")]
    Uuid(#[from] uuid::Error),
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

impl<T> From<SendError<T>> for Error
where
    T: std::fmt::Debug,
{
    fn from(e: SendError<T>) -> Self {
        Error::Unique(format!("Tokio Send Error: {:?}", e))
    }
}
