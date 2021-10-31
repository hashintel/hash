use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Experiment Controller error: {0}")]
    Unique(String),

    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    #[error("Difference detected in SystemTime! {0}")]
    SystemTime(#[from] std::time::SystemTimeError),

    #[error("I/O Error: {0}")]
    IO(#[from] std::io::Error),

    #[error("Missing configuration in dynamic payloads. Key: {0}")]
    MissingConfiguration(String),
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
