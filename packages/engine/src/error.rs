use thiserror::Error as ThisError;

use crate::{
    proto,
    simulation::{controller::sim_control::SimControl, status::SimStatus},
};

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

impl Error {
    pub fn user_facing_string(self) -> String {
        stringify_error(self)
    }
}

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("Serialize/Deserialize error")]
    Serde(#[from] serde_json::Error),

    /// Used when errors need to propagate but are too unique to be typed
    #[error("{0}")]
    Unique(String),

    #[error("Failed to parse Integer")]
    ParseInt(#[from] std::num::ParseIntError),

    #[error("Could not find shared behavior with ID {0}")]
    MissingSharedBehavior(String),

    #[error("Datastore error: {0}")]
    Datastore(#[from] crate::datastore::Error),

    #[error("Worker pool error: {0}")]
    WorkerPool(#[from] crate::workerpool::Error),

    #[error("Simulation error: {0}")]
    Simulation(#[from] crate::simulation::Error),

    #[error("Config error: {0}")]
    Config(#[from] crate::config::Error),

    // #[error("Worker handler error: {0}")]
    // WorkerHandler(#[from] crate::worker::Error),
    #[error("Experiment package error: {0}")]
    ExperimentPackage(#[from] crate::experiment::Error),

    #[error("Env error: {0}")]
    Env(#[from] crate::env::Error),

    #[error("Behavior language parse error: {0}")]
    ParseBehavior(String),

    #[error("Uuid error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("Invalid number of external runtime language runners planned")]
    InvalidNumExternalLanguageRunners,

    #[error("HTTP error: {0}")]
    Surf(http_types::StatusCode),

    // #[error("Experiment main loop to handler send error: {0:?}")]
    // HandlerSend(#[from] tokio::sync::mpsc::error::SendError<message::HandlerTopLevel>),
    #[error("Sim status send error: {0:?}")]
    ResultSend(#[from] tokio::sync::mpsc::error::SendError<SimStatus>),

    #[error("Sim control send error: {0:?}")]
    SimControlSend(#[from] tokio::sync::mpsc::error::SendError<SimControl>),

    // #[error("Built in Rust Behaviors: {0}")]
    // BuiltInRustBehavior(#[from] crate::worker::internal::rs::behaviors::Error),
    #[error("NNG error: {0}")]
    Nng(#[from] nng::Error),

    #[error("NNG Send error for message: \"{msg:?}\". Error: {err}")]
    NngSend { msg: nng::Message, err: nng::Error },

    #[error("{0}")]
    RwLock(String),

    #[error("Initializer timeout: {0}")]
    InitializerTimeout(String),

    #[error("Unsupported initializer file type: {0}")]
    UnsupportedInitializer(String),

    #[error("Tokio oneshot recv: {0}")]
    TokioOneshotRecv(#[from] tokio::sync::oneshot::error::RecvError),

    #[error("Sending Upstream message: {0}")]
    UpstreamSend(String),

    #[error("Tokio Join Error: {0}")]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error("Unknown experiment package: {0:?}")]
    UnknownExperimentPackage(proto::ExperimentPackageConfig),

    #[error("Unknown simulation package: {0}")]
    UnknownSimPackage(String),

    #[error("Invalid simulation package arguments: {0}")]
    SimPackageArgs(String),

    #[error("Unexpected simulation run id ({0}) received")]
    MissingSimulationRun(String),

    #[error("Start message received with existing simulation run id ({0})")]
    DuplicateSimId(String),

    #[error("Received unexpected message from the orchestrator")]
    UnexpectedEngineMsg,
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

// TODO: OS - revisit these "stringify" methods, they are messy and clearly WIP.
fn stringify_error(error: Error) -> String {
    match &error {
        Error::Datastore(datastore_error) => stringify_datastore_error(datastore_error, &error),
        // Error::WorkerHandler(worker_handler_error) => {
        //     stringify_worker_handler_error(worker_handler_error, &error)
        // }
        _ => error.to_string(),
    }
}

fn stringify_datastore_error(error: &crate::datastore::Error, original_error: &Error) -> String {
    match error {
        crate::datastore::Error::SharedMemory(shmem_error) => {
            match shmem_error {
                shared_memory::ShmemError::DevShmOutOfMemory => {
                    // TODO: Use a static string instead of allocating a string here.
                    "Experiment has run out of memory.".into()
                }
                _ => error.to_string(),
            }
        }
        _ => original_error.to_string(),
    }
}

// fn stringify_worker_handler_error(
//     error: &worker::error::Error,
//     original_error: &Error,
// ) -> String {
//     match error {
//         worker::Error::JavascriptRunner(javascript_runner_error) =>
//             match javascript_runner_error {
//                 worker::internal::js::error::Error::Datastore(datastore_error) => {
//                     stringify_datastore_error(datastore_error, original_error)
//             }
//             _ => original_error.to_string(),
//         },
//         _ => original_error.to_string(),
//     }
// }

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockReadGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock read error".into())
    }
}

impl<'a, T> From<std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>> for Error {
    fn from(_: std::sync::TryLockError<std::sync::RwLockWriteGuard<'a, T>>) -> Self {
        Error::RwLock("RwLock write error".into())
    }
}
