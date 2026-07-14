use core::{error::Error, fmt};
use std::io;

use crate::salt::revision::GenerationId;

/// A failed activation-pointer read or compare-and-swap.
#[derive(Debug)]
pub(crate) enum ActivationError {
    Io(io::Error),
    Json(serde_json::Error),
    Persist(tempfile::PersistError),
    MissingCandidate { generation: GenerationId },
    CandidateMismatch { generation: GenerationId },
}

impl fmt::Display for ActivationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => formatter.write_str("failed to access activation storage"),
            Self::Json(_) => formatter.write_str("failed to encode or parse an activation record"),
            Self::Persist(_) => {
                formatter.write_str("failed to atomically publish activation state")
            }
            Self::MissingCandidate { generation } => {
                write!(
                    formatter,
                    "generation {generation} has no published candidate marker"
                )
            }
            Self::CandidateMismatch { generation } => write!(
                formatter,
                "generation {generation} candidate marker does not authorize the requested head"
            ),
        }
    }
}

impl Error for ActivationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::MissingCandidate { .. } | Self::CandidateMismatch { .. } => None,
        }
    }
}

impl From<io::Error> for ActivationError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ActivationError {
    #[inline]
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<tempfile::PersistError> for ActivationError {
    #[inline]
    fn from(error: tempfile::PersistError) -> Self {
        Self::Persist(error)
    }
}
