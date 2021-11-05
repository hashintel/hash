use hash_prime::nano;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    Unique(String),

    #[error("I/O Error: {0}")]
    IO(#[from] std::io::Error),

    #[error("Experiment child process spawn {0}")]
    ExperimentSpawn(std::io::Error),

    #[error("Environment variable error: {0}")]
    EnvVar(#[from] std::env::VarError),

    #[error("Nano error: {0}")]
    Nano(#[from] nano::Error),
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
