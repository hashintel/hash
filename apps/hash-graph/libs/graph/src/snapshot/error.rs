use core::{error::Error, fmt};

#[derive(Debug)]
pub enum SnapshotDumpError {
    Read,
    Query,
    Write,
}

impl fmt::Display for SnapshotDumpError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read => write!(fmt, "could not read a snapshot record"),
            Self::Query => write!(fmt, "could not query snapshot records from the store"),
            Self::Write => write!(fmt, "could not write a snapshot record into the sink"),
        }
    }
}

impl Error for SnapshotDumpError {}

#[derive(Debug)]
pub enum SnapshotRestoreError {
    Unsupported,
    MissingMetadata,
    Read,
    Buffer,
    Write,
    Validation,
}

impl fmt::Display for SnapshotRestoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported => write!(fmt, "The snapshot contains unsupported entries"),
            Self::MissingMetadata => write!(fmt, "The snapshot does not contain metadata"),
            Self::Read => write!(fmt, "could not read a snapshot entry"),
            Self::Buffer => write!(fmt, "could not buffer a snapshot entry"),
            Self::Write => write!(fmt, "could not write a snapshot entry into the store"),
            Self::Validation => write!(fmt, "could not validate a snapshot entry"),
        }
    }
}

impl Error for SnapshotRestoreError {}
