use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

// TODO: UNUSED: Needs triage
pub struct SimulationRunError {
    pub error: Error,
    pub sim_id: String,
    pub steps_taken: isize,
}

impl From<(&str, &str)> for SimulationRunError {
    fn from(s: (&str, &str)) -> Self {
        SimulationRunError {
            sim_id: s.0.into(),
            error: Error::Unique(s.1.to_string()),
            steps_taken: 0,
        }
    }
}

#[derive(ThisError, Debug)]
pub enum Error {
    /// Used when errors need to propagate but are too unique to be typed
    #[error("{0}")]
    Unique(String),

    #[error("HTTP error: {0}")]
    Surf(surf::StatusCode),

    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
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
