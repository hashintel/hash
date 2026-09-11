use core::{error::Error, fmt};
use std::io;

use tokio::task::JoinError;

use super::super::{ActivateError, CurrentError, OpenError, SealError};
use crate::{
    file::storage::{
        error::StorageError,
        path::{FilePath, error::FilePathError},
    },
    integrity::{ParseHexError, Sha256Digest},
};

/// A failure to acquire or select a local copy of a remote generation.
#[derive(Debug)]
pub(crate) enum DownloadError {
    /// Constructing a source path failed.
    Path(FilePathError),
    /// Opening a source object failed.
    Storage(StorageError),
    /// The remote current pointer is not a canonical generation identity.
    Current(ParseHexError),
    /// Reading or parsing the local current pointer failed.
    LocalCurrent(CurrentError),
    /// The metadata bytes failed identity verification or repository parsing.
    Document(OpenError),
    /// An artifact's bytes differ from the metadata document's digest.
    Checksum {
        path: FilePath,
        expected: Sha256Digest,
        actual: Sha256Digest,
    },
    /// Publishing the staged generation failed.
    Seal(SealError),
    /// Verifying or selecting the local publication failed.
    Activate(ActivateError),
    /// A filesystem worker failed to return its result.
    Join(JoinError),
    /// Reading an object body or writing the local files failed.
    Io(io::Error),
}

impl fmt::Display for DownloadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Path(error) => write!(fmt, "constructing the download path failed: {error}"),
            Self::Storage(error) => write!(fmt, "opening the download source failed: {error}"),
            Self::Current(error) => write!(fmt, "the remote current pointer is invalid: {error}"),
            Self::LocalCurrent(error) => {
                write!(fmt, "the local current pointer is invalid: {error}")
            }
            Self::Document(error) => write!(fmt, "the downloaded metadata is invalid: {error}"),
            Self::Checksum {
                path,
                expected,
                actual,
            } => {
                write!(fmt, "object {path} hashes to {actual}, expected {expected}")
            }
            Self::Seal(error) => {
                write!(fmt, "publishing the downloaded generation failed: {error}")
            }
            Self::Activate(error) => {
                write!(fmt, "selecting the downloaded generation failed: {error}")
            }
            Self::Join(error) => write!(fmt, "the download filesystem worker failed: {error}"),
            Self::Io(error) => write!(fmt, "generation download I/O failed: {error}"),
        }
    }
}

impl Error for DownloadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Path(error) => Some(error),
            Self::Storage(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::LocalCurrent(error) => Some(error),
            Self::Document(error) => Some(error),
            Self::Checksum { .. } => None,
            Self::Seal(error) => Some(error),
            Self::Activate(error) => Some(error),
            Self::Join(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

impl From<FilePathError> for DownloadError {
    fn from(error: FilePathError) -> Self {
        Self::Path(error)
    }
}

impl From<StorageError> for DownloadError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}

impl From<ParseHexError> for DownloadError {
    fn from(error: ParseHexError) -> Self {
        Self::Current(error)
    }
}

impl From<CurrentError> for DownloadError {
    fn from(error: CurrentError) -> Self {
        Self::LocalCurrent(error)
    }
}

impl From<OpenError> for DownloadError {
    fn from(error: OpenError) -> Self {
        Self::Document(error)
    }
}

impl From<SealError> for DownloadError {
    fn from(error: SealError) -> Self {
        Self::Seal(error)
    }
}

impl From<ActivateError> for DownloadError {
    fn from(error: ActivateError) -> Self {
        Self::Activate(error)
    }
}

impl From<JoinError> for DownloadError {
    fn from(error: JoinError) -> Self {
        Self::Join(error)
    }
}

impl From<io::Error> for DownloadError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
