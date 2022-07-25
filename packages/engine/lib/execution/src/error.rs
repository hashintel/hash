use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

use crate::{
    package::simulation::SimulationId,
    runner::{JavaScriptError, MessageTarget, PythonError},
    task::{SharedContext, SharedState, TaskId},
    worker_pool::WorkerIndex,
};

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

    #[error("JavaScript error: {0}")]
    JavaScript(#[from] JavaScriptError),

    #[error("Python error: {0}")]
    Python(#[from] PythonError),

    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow2::error::Error),

    #[error("IO error: {0:?}")]
    StdIo(#[from] std::io::Error),

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
    InvalidBehaviorTaskMessage(crate::task::TaskMessage),

    #[error("Behavior Key Error: {0}")]
    BehaviorKeyJsonError(
        #[from] crate::package::simulation::state::behavior_execution::BehaviorKeyJsonError,
    ),

    #[error("Tokio oneshot recv: {0}")]
    TokioOneshotRecv(#[from] tokio::sync::oneshot::error::RecvError),

    #[error("Globals parse error. Invalid format for field: {0}")]
    GlobalsParseError(String),

    #[error("No column found in batch with name: {0}")]
    ColumnNotFound(String),

    #[error("Invalid behavior bytes: {0:?} ({1:?})")]
    InvalidBehaviorBytes(Vec<u8>, Result<String, std::string::FromUtf8Error>),

    #[error("Uuid error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("KdTree error: {0}")]
    KdTree(#[from] kdtree::ErrorKind),

    #[error("Missing worker with index {0}")]
    MissingWorkerWithIndex(WorkerIndex),

    #[error("Terminate message already sent")]
    TerminateMessageAlreadySent,

    #[error("Terminate message not sent")]
    TerminateMessageNotSent,

    #[error("Terminate confirm already sent")]
    TerminateConfirmAlreadySent,

    #[error("Unexpected target for a message {0:?}")]
    UnexpectedTarget(MessageTarget),

    #[error("Task already exists (id: {0})")]
    TaskAlreadyExists(TaskId),

    #[error("Tokio Join Error: {0}")]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error("{0}")]
    RwLock(String),

    #[error("Missing simulation with id {0}")]
    MissingSimulationWithId(SimulationId),

    #[error("Channel for sending cancel task messages has unexpectedly closed")]
    CancelClosed,

    #[error("Missing worker")]
    MissingWorker,

    #[error("Missing pending task with id {0}")]
    MissingPendingTask(TaskId),

    #[error("Missing one-shot task result sender to send result with")]
    NoResultSender,

    #[error("Error receiving from experiment main loop: {0}")]
    ExperimentRecv(String),

    #[error("Missing simulation run with id {0}")]
    MissingSimulationRun(SimulationId),
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

impl<T> From<SendError<T>> for Error
where
    T: std::fmt::Debug,
{
    fn from(e: SendError<T>) -> Self {
        Error::Unique(format!("Tokio Send Error: {:?}", e))
    }
}

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock write error".into())
    }
}

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock write error".into())
    }
}
