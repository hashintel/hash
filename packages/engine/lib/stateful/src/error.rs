use thiserror::Error as ThisError;

use crate::{agent::AgentStateField, field::RootFieldKey};

/// Convenient alias, which defaults to [`Error`] as [`Err`]-Variant.
pub type Result<T, E = Error> = std::result::Result<T, E>;

/// Error variants returned by this module.
#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error(
        "Attempting to insert a new field under key:{0:?} which clashes. New field: {1} Existing \
         field: {2}"
    )]
    FieldKeyClash(RootFieldKey, String, String),

    #[error("Couldn't acquire shared lock on object")]
    ProxySharedLock,

    #[error("Couldn't acquire exclusive lock on object")]
    ProxyExclusiveLock,

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Could not parse outbound message: {0}")]
    OutboundMessageParse(#[from] crate::message::OutboundError),

    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow2::error::Error),

    #[error("Failed to read Arrow Schema from buffer")]
    ArrowSchemaRead,

    #[error("Arrow RecordBatch message error: {0}")]
    ArrowBatch(String),

    #[error("Invalid Arrow object downcast. Field name: {name}")]
    InvalidArrowDowncast { name: String },

    #[error("Unexpected vector length: was {len} but expected {expected}")]
    UnexpectedVectorLength { len: usize, expected: usize },

    #[error("Agent id ({0}) is not a valid uuid")]
    InvalidAgentId(String),

    #[error("Built-in column missing: {0:?}")]
    BuiltInColumnMissing(AgentStateField),

    #[error("Uuid error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("{0}")]
    InvalidFlatbuffer(#[from] flatbuffers::InvalidFlatbuffer),

    #[error("Did not expect to resize Shared Memory")]
    UnexpectedAgentBatchMemoryResize,

    #[error("No column found in batch with name: {0}")]
    ColumnNotFound(String),

    #[error("Unable to read IPC message as record batch")]
    InvalidRecordBatchIpcMessage,

    #[error("Unable to read flatbuffers: {0}")]
    Planus(#[from] arrow_format::ipc::planus::Error),
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
