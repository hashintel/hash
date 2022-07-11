use thiserror::Error as ThisError;

#[derive(ThisError, Debug)]
pub enum SimulationError {
    #[error("{0}")]
    Unique(String),
}

impl From<&str> for SimulationError {
    fn from(s: &str) -> Self {
        SimulationError::Unique(s.to_string())
    }
}

impl From<String> for SimulationError {
    fn from(s: String) -> Self {
        SimulationError::Unique(s)
    }
}
