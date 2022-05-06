use thiserror::Error as ThisError;
pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Config error: {0}")]
    Unique(String),

    #[error("Execution error: {0}")]
    Execution(#[from] execution::Error),

    #[error("Simulation error: {0}")]
    Simulation(#[from] crate::simulation::Error),

    #[error("Datastore error: {0}")]
    Datastore(#[from] crate::datastore::Error),

    #[error("Deserialization error: {0}")]
    FromSerde(#[from] serde_json::Error),
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
