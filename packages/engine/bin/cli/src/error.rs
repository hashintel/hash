use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Experiment server error: {0}")]
    ExperimentServer(#[from] super::exsrv::Error),

    #[error("Error parsing manifest: {0}")]
    Manifest(#[from] super::manifest::Error),

    #[error("CLI Process error: {0}")]
    Process(#[from] super::process::Error),

    #[error("I/O Error: {0}")]
    IO(#[from] std::io::Error),
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

impl Into<hash_engine::error::Error> for Error {
    fn into(self) -> hash_engine::error::Error {
        hash_engine::error::Error::Unique(self.to_string())
    }
}
