use std::fmt;

use arrow2::datatypes::DataType;
use thiserror::Error as ThisError;

#[derive(Debug)]
pub enum SupportedType {
    NullableField,
    DataType(String),
    ArrowDataType(DataType),
    VariableSizeColumn,
}

impl fmt::Display for SupportedType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NullableField => write!(f, "NullableField"),
            Self::DataType(s) => write!(f, "DataType: {}", s),
            Self::ArrowDataType(a) => write!(f, "ArrowDataType: {:?}", a),
            Self::VariableSizeColumn => write!(f, "VariableSizeColumn"),
        }
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Arrow Error: {0}")]
    Arrow(arrow2::error::Error),

    #[error("Invalid Arrow object downcast. Field name: {name}")]
    InvalidArrowDowncast { name: String },

    #[error("Memory Error: {0}")]
    Memory(String),

    #[error("Not implemented: {0}")]
    NotImplemented(SupportedType),

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Shared memory error: {0}")]
    SharedMemory(shared_memory::ShmemError),

    #[error("Arrow RecordBatch message error: {0}")]
    ArrowBatch(String),

    #[error("Array data was expected to contain child data")]
    ChildDataExpected,

    #[error("Unsupported Arrow datatype: {d_type:?}")]
    UnsupportedArrowDataType { d_type: DataType },

    #[error("Shmem max size reached: Size: {0}, Allowed: {1}")]
    SharedMemoryMaxSize(u64, u64),

    #[error("Invalid fixed size list. Required size of list: {required}, actual: {actual}.")]
    FixedSizeListInvalidValue { required: i32, actual: usize },

    #[error("Object is missing field with name: {0}")]
    MissingFieldInObject(String),

    #[error("Expected boolean value in `serde_json::Value`")]
    BooleanSerdeValueExpected,

    #[error("Unable to read IPC message as record batch")]
    InvalidRecordBatchIpcMessage,

    #[error("Expected new data buffer length to be smaller than current. Id: {0}")]
    ExpectedSmallerNewDataSize(String),

    #[error("Cannot create empty shared memory objects")]
    EmptySharedMemory,

    #[error("{0}")]
    InvalidFlatbuffer(#[from] flatbuffers::InvalidFlatbuffer),

    #[error("No column found in batch with name: {0}")]
    ColumnNotFound(String),

    #[error("Planus arrow error: {0}")]
    PlanusArrowError(#[from] arrow_format::ipc::planus::Error),
}

impl From<shared_memory::ShmemError> for Error {
    fn from(e: shared_memory::ShmemError) -> Self {
        if cfg!(target_os = "macos") && matches!(e, shared_memory::ShmemError::UnknownOsError(22)) {
            tracing::error!(
                "Have you set the `OS_MEMORY_ALLOC_OVERRIDE` variable (consult the engine \
                 README.md file if you are unsure on what this means)? If in doubt you can just \
                 enter `export OS_MEMORY_ALLOC_OVERRIDE=25000000` into your shell and try \
                 re-running the engine."
            );
        }
        Error::SharedMemory(e)
    }
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

// todo: revert this before merging (here for debugging)
impl From<arrow2::error::Error> for Error {
    fn from(e: arrow2::error::Error) -> Self {
        panic!("{:?}", e);
    }
}
