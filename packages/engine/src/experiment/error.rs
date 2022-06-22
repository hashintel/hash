use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Execution error: {0}")]
    Execution(#[from] execution::Error),

    #[error("Controller error: {0}")]
    Controller(#[from] crate::experiment::controller::Error),

    #[error("Simulation run's changed Global values are not in a JSON object")]
    ChangedGlobalsNotObject,

    #[error("globals.json doesn't contain a JSON object")]
    BaseGlobalsNotProject,

    #[error("globals.json doesn't contain property to vary: {0}")]
    MissingChangedGlobalProperty(String),

    #[error("Property is not object, but is supposed to contain a varying property: {0}")]
    NestedPropertyNotObject(String),
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
