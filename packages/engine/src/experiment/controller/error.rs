use thiserror::Error as ThisError;
use tokio::sync::mpsc::error::SendError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Experiment Controller error: {0}")]
    Unique(String),

    #[error("Stateful error: {0}")]
    Stateful(#[from] stateful::Error),

    #[error("Execution error: {0}")]
    Execution(#[from] execution::Error),

    #[error("Structure error: {0}")]
    Structure(#[from] experiment_structure::Error),

    #[error("Env error: {0}")]
    Env(#[from] crate::env::Error),

    #[error("Simulation error: {0}")]
    Simulation(#[from] crate::simulation::Error),

    #[error("Simulation controller error: {0}")]
    SimulationController(#[from] crate::simulation::controller::Error),

    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

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

impl<T> From<SendError<T>> for Error
where
    T: std::fmt::Debug,
{
    fn from(e: SendError<T>) -> Self {
        Error::Unique(format!("Tokio Send Error: {:?}", e))
    }
}
