use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Experiment Controller error: {0}")]
    Unique(String),

    #[error("Env error: {0}")]
    Env(#[from] crate::env::Error),

    #[error("Experiment error: {0}")]
    Experiment(#[from] crate::experiment::Error),

    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    #[error("Difference detected in SystemTime! {0}")]
    SystemTime(#[from] std::time::SystemTimeError),

    #[error("I/O Error: {0}")]
    IO(#[from] std::io::Error),

    #[error("Missing configuration in dynamic payloads. Key: {0}")]
    MissingConfiguration(String),

    #[error("Datastore: {0}")]
    Datastore(#[from] crate::datastore::error::Error),
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
