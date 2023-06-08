use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

use crate::{package::simulation::SimulationId, runner::comms::InboundToRunnerMsgPayload};

pub type PythonResult<T, E = PythonError> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum PythonError {
    #[error("{0}")]
    Unique(String),

    #[error("Can't start Python runner again when it is already running")]
    AlreadyRunning,

    #[error("Couldn't spawn Python child process: {0:?}")]
    Spawn(std::io::Error),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(#[from] SendError<(Option<SimulationId>, InboundToRunnerMsgPayload)>),

    #[error("Couldn't send message {0:?} to Python process: {1:?}")]
    NngSend(nng::Message, nng::Error),

    #[error("nng: {0:?}")]
    Nng(#[from] nng::Error),

    #[error("Couldn't receive outbound message from runner")]
    OutboundReceive,

    #[error("UUID error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("Serde JSON error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("Already awaiting for completion")]
    AlreadyAwaiting,

    #[error("Not awaiting for completion")]
    NotAwaiting,
}

impl From<&str> for PythonError {
    fn from(s: &str) -> Self {
        Self::Unique(s.to_string())
    }
}

impl From<String> for PythonError {
    fn from(s: String) -> Self {
        Self::Unique(s)
    }
}
