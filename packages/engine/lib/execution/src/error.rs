use thiserror::Error as ThisError;

use crate::task::{SharedContext, SharedState};

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    /// Used when errors need to propagate but are too unique to be typed
    #[error("{0}")]
    Unique(String),

    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error("Stateful error: {0}")]
    Stateful(#[from] stateful::Error),

    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow::error::ArrowError),

    #[error("Behavior language parse error: {0}")]
    ParseBehavior(String),

    #[error(
        "Can't take multiple write access to shared state, e.g. by cloning writable task shared \
         store"
    )]
    MultipleWriteSharedState,

    #[error(
        "State or Context access not allowed for package (with type: {2}). StateAccess: {0}, \
         ContextAccess: {1}."
    )]
    AccessNotAllowed(String, String, String),

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Distribution node handling is not implemented for this message type")]
    DistributionNodeHandlerNotImplemented,

    #[error("Worker node handling is not implemented for this message type")]
    WorkerNodeHandlerNotImplemented,

    #[error("Invalid type of task message for behavior execution: {0:?}")]
    InvalidBehaviorTaskMessage(crate::package::TaskMessage),

    #[error("Behavior Key Error: {0}")]
    BehaviorKeyJsonError(#[from] crate::package::state::behavior_execution::BehaviorKeyJsonError),
}

impl Error {
    pub fn access_not_allowed(
        state: &SharedState,
        ctx: &SharedContext,
        package_type: String,
    ) -> Self {
        Self::AccessNotAllowed(format!("{:?}", state), format!("{:?}", ctx), package_type)
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
