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
    Canceled,
}

impl fmt::Display for SnapshotRestoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported => write!(f, "The snapshot contains unsupported entries"),
            Self::Canceled => write!(f, "The snapshot restore was canceled"),
        }
    }
}

impl Error for SnapshotRestoreError {}
