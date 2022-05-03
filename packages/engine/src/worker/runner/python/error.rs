use execution::runner::comms::InboundToRunnerMsgPayload;
use simulation_structure::SimulationShortId;
use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Datastore: {0}")]
    Datastore(#[from] crate::datastore::Error),

    #[error("Can't start Python runner again when it is already running")]
    AlreadyRunning,

    #[error("Couldn't import package {0}: {1}")]
    PackageImport(String, String), // First element is path/name.

    #[error("Missing simulation run with id {0}")]
    MissingSimRun(SimulationShortId),

    #[error("Couldn't spawn Python child process: {0:?}")]
    Spawn(std::io::Error),

    #[error("Couldn't send terminate message to Python: {0}")]
    TerminateSend(SendError<()>),

    #[error("Couldn't send inbound message to runner: {0}")]
    InboundSend(#[from] SendError<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>),

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
