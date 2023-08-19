use std::{error::Error, fmt};

#[derive(Debug)]
pub enum SnapshotDumpError {
    Read,
    Query,
    Write,
}

impl fmt::Display for SnapshotDumpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read => write!(f, "could not read a snapshot record"),
            Self::Query => write!(f, "could not query snapshot records from the store"),
            Self::Write => write!(f, "could not write a snapshot record into the sink"),
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
}

impl fmt::Display for SnapshotRestoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported => write!(f, "The snapshot contains unsupported entries"),
            Self::MissingMetadata => write!(f, "The snapshot does not contain metadata"),
            Self::Read => write!(f, "could not read a snapshot entry"),
            Self::Buffer => write!(f, "could not buffer a snapshot entry"),
            Self::Write => write!(f, "could not write a snapshot entry into the store"),
        }
    }
}

impl Error for SnapshotRestoreError {}
