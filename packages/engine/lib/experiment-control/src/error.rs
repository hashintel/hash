use error_stack::Report;
use thiserror::Error as ThisError;

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

    #[error("Simulation error: {0}")]
    SimulationControl(#[from] simulation_control::Error),

    #[error("Simulation controller error: {0}")]
    SimulationController(#[from] simulation_control::controller::Error),

    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    #[error("Nano error: {0:?}")]
    Nano(Report<nano::ErrorKind>),

    #[error("Missing configuration in dynamic payloads. Key: {0}")]
    MissingConfiguration(String),

    #[error("Simulation run's changed Global values are not in a JSON object")]
    ChangedGlobalsNotObject,

    #[error("globals.json doesn't contain a JSON object")]
    BaseGlobalsNotProject,

    #[error("globals.json doesn't contain property to vary: {0}")]
    MissingChangedGlobalProperty(String),

    #[error("Property is not object, but is supposed to contain a varying property: {0}")]
    NestedPropertyNotObject(String),

    #[error("Unexpected message to the engine, expected an init message")]
    UnexpectedEngineMsgExpectedInit,
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

impl From<Report<nano::ErrorKind>> for Error {
    fn from(report: Report<nano::ErrorKind>) -> Self {
        Self::Nano(report)
    }
}
