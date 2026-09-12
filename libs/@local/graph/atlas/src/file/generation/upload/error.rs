use core::{error::Error, fmt};
use std::io;

use tokio::task::JoinError;

use crate::{
    file::{
        generation::OpenError,
        repository::IntegrityVerificationError,
        storage::{
            error::StorageError,
            path::{FilePath, error::FilePathError},
        },
    },
    integrity::{ParseHexError, Sha256Digest},
};

/// A failure to complete or select a destination generation.
#[derive(Debug)]
pub(crate) enum UploadError {
    /// Opening the local generation failed.
    Open(OpenError),
    /// Constructing an object path failed.
    Path(FilePathError),
    /// A file transfer failed, retaining the storage error.
    Storage(StorageError),
    /// A local artifact failed its metadata document's integrity check.
    Integrity(IntegrityVerificationError),
    /// A filesystem worker failed to return its result.
    Join(JoinError),
    /// The destination current pointer is not a canonical generation identity.
    Current(ParseHexError),
    /// Reading an object body failed.
    Io(io::Error),
    /// An existing object contains bytes different from the expected artifact.
    Checksum {
        path: FilePath,
        expected: Sha256Digest,
        actual: Sha256Digest,
    },
    /// The current-pointer write failed its captured precondition.
    Conflict(StorageError),
}

impl fmt::Display for UploadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(error) => write!(fmt, "opening the upload generation failed: {error}"),
            Self::Path(error) => write!(fmt, "constructing the upload path failed: {error}"),
            Self::Storage(error) => write!(fmt, "generation transfer failed: {error}"),
            Self::Integrity(error) => write!(fmt, "the local upload artifact is invalid: {error}"),
            Self::Join(error) => write!(fmt, "the upload filesystem worker failed: {error}"),
            Self::Current(error) => {
                write!(fmt, "the destination current pointer is invalid: {error}")
            }
            Self::Io(error) => write!(fmt, "reading the destination file failed: {error}"),
            Self::Checksum {
                path,
                expected,
                actual,
            } => write!(fmt, "object {path} hashes to {actual}, expected {expected}"),
            Self::Conflict(error) => {
                write!(fmt, "the destination current precondition failed: {error}")
            }
        }
    }
}

impl Error for UploadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::Path(error) => Some(error),
            Self::Storage(error) | Self::Conflict(error) => Some(error),
            Self::Integrity(error) => Some(error),
            Self::Join(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Checksum { .. } => None,
        }
    }
}

impl From<OpenError> for UploadError {
    fn from(error: OpenError) -> Self {
        Self::Open(error)
    }
}

impl From<FilePathError> for UploadError {
    fn from(error: FilePathError) -> Self {
        Self::Path(error)
    }
}

impl From<StorageError> for UploadError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}

impl From<IntegrityVerificationError> for UploadError {
    fn from(error: IntegrityVerificationError) -> Self {
        Self::Integrity(error)
    }
}

impl From<JoinError> for UploadError {
    fn from(error: JoinError) -> Self {
        Self::Join(error)
    }
}

impl From<ParseHexError> for UploadError {
    fn from(error: ParseHexError) -> Self {
        Self::Current(error)
    }
}

impl From<io::Error> for UploadError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
