use std::fmt;

use provider::{Demand, Provider};

pub type Result<T, E = OrchestratorError> = error::Result<T, E>;

// TODO: Use proper context type
#[derive(Debug)]
pub enum OrchestratorError {
    UniqueOwned(Box<str>),
    Unique(&'static str),
}

impl fmt::Display for OrchestratorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UniqueOwned(error) => fmt::Display::fmt(&error, fmt),
            Self::Unique(error) => fmt::Display::fmt(&error, fmt),
        }
    }
}

impl std::error::Error for OrchestratorError {}

impl Provider for OrchestratorError {
    fn provide<'a>(&'a self, _: &mut Demand<'a>) {}
}

impl From<&'static str> for OrchestratorError {
    fn from(error: &'static str) -> Self {
        Self::Unique(error)
    }
}

impl From<String> for OrchestratorError {
    fn from(error: String) -> Self {
        Self::UniqueOwned(error.into_boxed_str())
    }
}
