use core::{error::Error, fmt};
use std::io;

use crate::salt::{
    manifest::ManifestLoadError, projector::ProjectorCheckpointError, release::GateEvidenceError,
    revision::GenerationId, storage::mmap::ArtifactMapError,
};

/// A failed activation-pointer read or compare-and-swap.
#[derive(Debug)]
pub(crate) enum ActivationError {
    Io(io::Error),
    Json(serde_json::Error),
    Persist(tempfile::PersistError),
    Manifest(ManifestLoadError),
    Evidence(GateEvidenceError),
    Projector(ProjectorCheckpointError),
    Artifact(ArtifactMapError),
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
            Self::Manifest(error) => error.fmt(formatter),
            Self::Evidence(error) => error.fmt(formatter),
            Self::Projector(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
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
            Self::Manifest(error) => Some(error),
            Self::Evidence(error) => Some(error),
            Self::Projector(error) => Some(error),
            Self::Artifact(error) => Some(error),
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

impl From<ManifestLoadError> for ActivationError {
    #[inline]
    fn from(error: ManifestLoadError) -> Self {
        Self::Manifest(error)
    }
}

impl From<GateEvidenceError> for ActivationError {
    #[inline]
    fn from(error: GateEvidenceError) -> Self {
        Self::Evidence(error)
    }
}

impl From<ProjectorCheckpointError> for ActivationError {
    #[inline]
    fn from(error: ProjectorCheckpointError) -> Self {
        Self::Projector(error)
    }
}

impl From<ArtifactMapError> for ActivationError {
    #[inline]
    fn from(error: ArtifactMapError) -> Self {
        Self::Artifact(error)
    }
}
