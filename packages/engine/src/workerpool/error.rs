use crate::proto;
use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;
use crate::simulation::task::result::TaskResultOrCancelled;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Task result send error: {0}")]
    TaskResultSend(SendError<TaskResultOrCancelled>),

    #[error("Missing worker with index {0}")]
    MissingWorkerWithIndex(crate::types::WorkerIndex),

    #[error("Kill message already sent")]
    KillMessageAlreadySent,

    #[error("Kill message not sent")]
    KillMessageNotSent,

    #[error("Kill confirm already sent")]
    KillConfirmAlreadySent,

    #[error("Missing simulation with id {0}")]
    MissingSimulationWithID(proto::SimulationShortID),

    #[error("Channel for sending cancel task messages has unexpectedly closed")]
    CancelClosed,

    #[error("Missing worker controllers")]
    MissingWorkerControllers,

    #[error("The communications with worker controllers has been unexpectedly dropped")]
    UnexpectedWorkerCommsDrop,

    #[error("Missing pending task with id {0}")]
    MissingPendingTask(crate::types::TaskID),
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
