use std::fmt;

pub type Result<T, E = OrchestratorError> = error_stack::Result<T, E>;

// TODO: Use proper context type
//   Currently, we capture every error message inside of a generic error message. We want a context
//   object similar to the one we using in the integration test suite, e.g.
//   `OrchestratorError::InvalidManifest` with additional information provided by `attach`.
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
