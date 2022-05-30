use std::fmt;

use error::Report;

pub type Result<T, E = OrchestratorError> = error::Result<T, E>;

// TODO: Use proper context type
#[derive(Debug)]
pub enum OrchestratorError {
    Unique(String),
    Report(Report<()>),
}

impl fmt::Display for OrchestratorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unique(error) => fmt::Display::fmt(&error, fmt),
            Self::Report(error) => fmt::Display::fmt(&error, fmt),
        }
    }
}

impl std::error::Error for OrchestratorError {}

impl From<&str> for OrchestratorError {
    fn from(error: &str) -> Self {
        Self::Unique(error.to_owned())
    }
}

impl From<String> for OrchestratorError {
    fn from(error: String) -> Self {
        Self::Unique(error)
    }
}

impl From<Report<()>> for OrchestratorError {
    fn from(report: Report<()>) -> Self {
        Self::Report(report)
    }
}
