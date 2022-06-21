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

    #[cfg(test)]
    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow::error::ArrowError),

    #[error("Expected Node Metadata")]
    NodeMetadataExpected,

    #[error("Expected Buffer Metadata")]
    BufferMetadataExpected,

    #[error("Expected Shift Action Vector to be non-empty")]
    EmptyShiftActionVector,

    #[cfg(test)]
    #[error("Invalid utf-8: {0}")]
    FromUtf8Error(#[from] std::string::FromUtf8Error),

    #[error("Unexpected undefined command")]
    UnexpectedUndefinedCommand,
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
