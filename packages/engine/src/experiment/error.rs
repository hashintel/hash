use execution::package::experiment::comms::ExperimentControl;
use serde_json::Value as SerdeValue;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;
pub type SerdeMap = serde_json::Map<String, SerdeValue>;

use crate::experiment::controller::Error as ControllerError;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Controller error: {0}")]
    Controller(#[from] ControllerError),

    #[error("Number of simulation runs should be greater than 0")]
    NoSimulationRuns,

    #[error("Unexpected simulation run id ({0}) received")]
    MissingSimulationRun(simulation_structure::SimulationShortId),

    #[error("Unexpected opt client id received: {0:?}")]
    MissingClient(String, String),

    #[error("Internal id response has existing simulation run id ({0})")]
    DuplicateSimId(String),

    #[error("Error sending control to experiment main loop: {0:?}")]
    ExperimentSend(#[from] tokio::sync::mpsc::error::SendError<ExperimentControl>),

    #[error("Error receiving from experiment main loop: {0}")]
    ExperimentRecv(String),

    #[error("Optimization experiment package data doesn't contain maximum number of runs")]
    MissingMaxRuns,

    #[error("Invalid maximum number of runs for optimization experiment: {0}")]
    InvalidMaxRuns(i64),

    #[error("Optimization experiment package data doesn't contain metric name string")]
    MissingMetricName,

    #[error("Optimization experiment package data metric name is not a string")]
    MetricNameNotString,

    #[error("Invalid optimization experiment metric objective: {0:?}")]
    InvalidMetricObjective(Option<super::MetricObjective>),

    #[error("Python child process spawn")]
    PythonSpawn(std::io::Error),

    #[error("nng: {0:?}")]
    Nng(#[from] nng::Error),

    #[error("serde: {0:?}")]
    Serde(#[from] serde_json::Error),

    #[error("Received Python message is not utf-8: {0:?}")]
    PythonNotUtf8(std::str::Utf8Error),

    #[error("Received Python message doesn't have 'type' field: {0:?}")]
    PythonNoType(SerdeMap),

    #[error("Received Python message 'type' field is not a string: {0:?}")]
    PythonTypeNotString(SerdeMap),

    #[error("Received Python message doesn't have 'client_id' field: {0:?}")]
    PythonNoId(SerdeMap),

    #[error("Received Python message 'client_id' field is not a string: {0:?}")]
    PythonIdNotString(SerdeMap),

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
