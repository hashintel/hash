//! Error types for [`GenerationRoot`](super::GenerationRoot) and [`Generation`](super::Generation).

use core::{error::Error, fmt};
use std::{ffi::OsString, io};

use super::GenerationId;
use crate::{
    file::repository::FileName,
    integrity::{ParseHexError, Sha256Digest},
};

/// A staging could not seal into a published generation.
#[derive(Debug)]
pub(crate) enum SealError {
    /// A manifest-listed file is absent from the staging directory.
    Missing {
        /// The absent file's name.
        name: FileName,
    },
    /// A staged file is not listed in the manifest.
    Unlisted {
        /// The unlisted file's name.
        name: OsString,
    },
    /// A generation with this metadata document is already published.
    AlreadyPublished(GenerationId),
    /// The metadata document failed to serialize.
    Document(serde_json::Error),
    /// A write, sync, or rename failed.
    Io(io::Error),
}

impl fmt::Display for SealError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { name } => {
                write!(fmt, "the manifest-listed file {name} is not staged")
            }
            Self::Unlisted { name } => write!(
                fmt,
                "the staged file {} is not listed in the manifest",
                name.display(),
            ),
            Self::AlreadyPublished(id) => {
                write!(fmt, "generation {id} is already published")
            }
            Self::Document(error) => {
                write!(fmt, "the metadata document failed to serialize: {error}")
            }
            Self::Io(error) => write!(fmt, "the generation failed to persist: {error}"),
        }
    }
}

impl Error for SealError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Document(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Missing { .. } | Self::Unlisted { .. } | Self::AlreadyPublished(_) => None,
        }
    }
}

/// Reading the current-generation pointer failed.
#[derive(Debug)]
pub(crate) enum CurrentError {
    /// The pointer's content is not a generation id.
    Corrupt(ParseHexError),
    /// Reading the pointer failed.
    Io(io::Error),
}

impl fmt::Display for CurrentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Corrupt(error) => write!(
                fmt,
                "the current-generation pointer does not name a generation: {error}",
            ),
            Self::Io(error) => write!(
                fmt,
                "the current-generation pointer failed to read: {error}",
            ),
        }
    }
}

impl Error for CurrentError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Corrupt(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// Activating a generation failed.
#[derive(Debug)]
pub(crate) enum ActivateError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    /// Locking the root or replacing the pointer failed.
    Io(io::Error),
}

impl fmt::Display for ActivateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(fmt, "generation {id} is not published in this root")
            }
            Self::Io(error) => write!(fmt, "generation activation failed: {error}"),
        }
    }
}

impl Error for ActivateError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Unpublished(_) => None,
            Self::Io(error) => Some(error),
        }
    }
}

impl From<io::Error> for ActivateError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Opening a published generation failed.
#[derive(Debug)]
pub(crate) enum OpenError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    /// The document's bytes do not hash to the generation id.
    Identity {
        /// The generation the caller asked for.
        id: GenerationId,
        /// What the document's bytes actually hash to.
        actual: Sha256Digest,
    },
    /// The document does not parse as a repository this module speaks.
    Document(serde_json::Error),
    /// Reading the document failed.
    Io(io::Error),
}

impl fmt::Display for OpenError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(fmt, "generation {id} is not published in this root")
            }
            Self::Identity { id, actual } => write!(
                fmt,
                "the metadata document of generation {id} hashes to {actual}",
            ),
            Self::Document(error) => {
                write!(fmt, "the metadata document failed to deserialize: {error}")
            }
            Self::Io(error) => write!(fmt, "the metadata document failed to read: {error}"),
        }
    }
}

impl Error for OpenError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Document(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Unpublished(_) | Self::Identity { .. } => None,
        }
    }
}

impl From<io::Error> for OpenError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for OpenError {
    fn from(error: serde_json::Error) -> Self {
        Self::Document(error)
    }
}

/// A failure removing an inactive generation.
#[derive(Debug)]
pub(crate) enum RemoveError {
    /// Reading or parsing the current-generation pointer failed.
    Current(CurrentError),
    /// The current-generation pointer still names this generation.
    Active(GenerationId),
    /// Locking the root, removing the directory or syncing the root failed.
    Io(io::Error),
}

impl fmt::Display for RemoveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Current(error) => write!(
                fmt,
                "could not read the current-generation pointer: {error}"
            ),
            Self::Active(id) => write!(fmt, "generation {id} is active"),
            Self::Io(error) => write!(fmt, "could not persist generation removal: {error}"),
        }
    }
}

impl Error for RemoveError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Active(_) => None,
        }
    }
}

impl From<io::Error> for RemoveError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<CurrentError> for RemoveError {
    fn from(error: CurrentError) -> Self {
        Self::Current(error)
    }
}
