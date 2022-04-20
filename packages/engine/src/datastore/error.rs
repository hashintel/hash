use arrow::error::ArrowError;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error("Stateful error: {0}")]
    Stateful(#[from] stateful::Error),

    #[error("Arrow Error: {0}")]
    Arrow(#[from] ArrowError),

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Shared memory error: {0}")]
    SharedMemory(#[from] shared_memory::ShmemError),

    #[error("No column found in batch with name: {0}")]
    ColumnNotFound(String),

    #[error("Expected Node Metadata")]
    NodeMetadataExpected,

    #[error("Expected Buffer Metadata")]
    BufferMetadataExpected,

    #[error("Expected Shift Action Vector to be non-empty")]
    EmptyShiftActionVector,

    #[error("{0}")]
    RwLock(String),

    #[error("Invalid utf-8: {0}")]
    FromUtf8Error(#[from] std::string::FromUtf8Error),

    #[error("Unexpected undefined command")]
    UnexpectedUndefinedCommand,

    #[error(
        "Can't take multiple write access to shared state, e.g. by cloning writable task shared \
         store"
    )]
    MultipleWriteSharedState,
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
