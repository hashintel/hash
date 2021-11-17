use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Couldn't import package {0}: {1}")]
    PackageImport(String, String), // First element is path/name.

    #[error("Missing simulation run with id {0}")]
    MissingSimRun(crate::proto::SimulationShortID),

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
