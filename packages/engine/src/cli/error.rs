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

impl Into<hash_prime::error::Error> for Error {
    fn into(self) -> hash_prime::error::Error {
        hash_prime::error::Error::Unique(self.to_string())
    }
}
