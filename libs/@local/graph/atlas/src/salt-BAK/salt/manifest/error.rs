use core::{error::Error, fmt};
use std::io;

use camino::Utf8PathBuf;

use super::ArtifactRole;
use crate::salt::{hash::ContentHash, storage::mmap::ArtifactMapError};

/// Invalid required manifest field or canonical serialization failure.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ManifestError {
    MissingText {
        field: &'static str,
    },
    InvalidFinite {
        field: &'static str,
        value: f64,
    },
    InvalidFraction {
        field: &'static str,
        value: f64,
    },
    InvalidInvariant {
        field: &'static str,
        expected: &'static str,
    },
    LandmarkCapacity {
        actual: usize,
        maximum: usize,
    },
    VariantCount {
        declared: usize,
        entries: usize,
        maximum: usize,
    },
    MissingCanonicalVariant,
    DuplicateVariant,
    DuplicateSeed,
    MissingArtifact {
        role: ArtifactRole,
    },
    DuplicateArtifact {
        role: ArtifactRole,
    },
    UnexpectedArtifact {
        role: ArtifactRole,
    },
    InvalidArtifactPath {
        role: ArtifactRole,
    },
    InvalidArtifactLength {
        role: ArtifactRole,
    },
    InvalidArtifactFormat {
        role: ArtifactRole,
    },
    ArtifactHashMismatch {
        role: ArtifactRole,
        field: &'static str,
    },
    Serialization,
}

impl fmt::Display for ManifestError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingText { field } => {
                write!(
                    formatter,
                    "required manifest field `{field}` is empty or unpinned"
                )
            }
            Self::InvalidFinite { field, value } => {
                write!(
                    formatter,
                    "manifest field `{field}` must be finite, got {value}"
                )
            }
            Self::InvalidFraction { field, value } => write!(
                formatter,
                "manifest field `{field}` must be a finite fraction in [0, 1], got {value}"
            ),
            Self::InvalidInvariant { field, expected } => {
                write!(formatter, "manifest field `{field}` must be {expected}")
            }
            Self::LandmarkCapacity { actual, maximum } => write!(
                formatter,
                "actual landmark count {actual} exceeds configured maximum {maximum}"
            ),
            Self::VariantCount {
                declared,
                entries,
                maximum,
            } => write!(
                formatter,
                "manifest declares {declared} variants, contains {entries}, and permits at most \
                 {maximum}"
            ),
            Self::MissingCanonicalVariant => {
                formatter.write_str("canonical variant has no matching entry")
            }
            Self::DuplicateVariant => formatter.write_str("variant identifiers are not unique"),
            Self::DuplicateSeed => formatter.write_str("reproducibility seed names are not unique"),
            Self::MissingArtifact { role } => {
                write!(formatter, "required generation artifact {role} is missing")
            }
            Self::DuplicateArtifact { role } => {
                write!(
                    formatter,
                    "generation artifact {role} is repeated or out of order"
                )
            }
            Self::UnexpectedArtifact { role } => {
                write!(formatter, "generation artifact {role} is not enabled")
            }
            Self::InvalidArtifactPath { role } => {
                write!(
                    formatter,
                    "generation artifact {role} must use one relative file name"
                )
            }
            Self::InvalidArtifactLength { role } => {
                write!(formatter, "generation artifact {role} has zero bytes")
            }
            Self::InvalidArtifactFormat { role } => {
                write!(
                    formatter,
                    "generation artifact {role} declares the wrong binary format"
                )
            }
            Self::ArtifactHashMismatch { role, field } => {
                write!(
                    formatter,
                    "generation artifact {role} does not match manifest field `{field}`"
                )
            }
            Self::Serialization => {
                formatter.write_str("manifest could not be serialized canonically")
            }
        }
    }
}

impl Error for ManifestError {}

/// A declared generation artifact that is absent or differs on disk.
#[derive(Debug)]
pub(crate) enum ArtifactVerificationError {
    Io {
        role: ArtifactRole,
        error: io::Error,
    },
    Map {
        role: ArtifactRole,
        error: ArtifactMapError,
    },
    Length {
        role: ArtifactRole,
        expected: u64,
        actual: u64,
    },
    Sections {
        role: ArtifactRole,
        expected: u32,
        actual: u32,
    },
    Schema {
        role: ArtifactRole,
        detail: &'static str,
    },
    Hash {
        role: ArtifactRole,
        expected: ContentHash,
        actual: ContentHash,
    },
}

impl fmt::Display for ArtifactVerificationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { role, error } => {
                write!(
                    formatter,
                    "could not read generation artifact {role}: {error}"
                )
            }
            Self::Map { role, error } => {
                write!(formatter, "generation artifact {role} is invalid: {error}")
            }
            Self::Length {
                role,
                expected,
                actual,
            } => write!(
                formatter,
                "generation artifact {role} has {actual} bytes, expected {expected}"
            ),
            Self::Sections {
                role,
                expected,
                actual,
            } => write!(
                formatter,
                "generation artifact {role} has {actual} sections, expected {expected}"
            ),
            Self::Schema { role, detail } => {
                write!(
                    formatter,
                    "generation artifact {role} violates its schema: {detail}"
                )
            }
            Self::Hash {
                role,
                expected,
                actual,
            } => write!(
                formatter,
                "generation artifact {role} has hash {actual}, expected {expected}"
            ),
        }
    }
}

impl Error for ArtifactVerificationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { error, .. } => Some(error),
            Self::Map { error, .. } => Some(error),
            Self::Length { .. }
            | Self::Sections { .. }
            | Self::Schema { .. }
            | Self::Hash { .. } => None,
        }
    }
}

/// A failure to atomically publish an immutable generation manifest.
#[derive(Debug)]
pub(crate) enum ManifestPublishError {
    Manifest(ManifestError),
    Artifact(ArtifactVerificationError),
    Io(io::Error),
    Persist(tempfile::PersistError),
    ExistingManifestMismatch { path: Utf8PathBuf },
}

/// A stored manifest or one of its declared artifacts failed verification.
#[derive(Debug)]
pub(crate) enum ManifestLoadError {
    Io(io::Error),
    Json(serde_json::Error),
    Manifest(ManifestError),
    Artifact(ArtifactVerificationError),
    NonCanonicalEncoding,
    Hash {
        expected: ContentHash,
        actual: ContentHash,
    },
}

impl fmt::Display for ManifestLoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "could not read generation manifest: {error}"),
            Self::Json(error) => write!(formatter, "could not decode generation manifest: {error}"),
            Self::Manifest(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
            Self::NonCanonicalEncoding => {
                formatter.write_str("stored generation manifest is not canonically encoded")
            }
            Self::Hash { expected, actual } => {
                write!(
                    formatter,
                    "stored generation manifest has hash {actual}, expected {expected}"
                )
            }
        }
    }
}

impl Error for ManifestLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Manifest(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::NonCanonicalEncoding | Self::Hash { .. } => None,
        }
    }
}

impl From<io::Error> for ManifestLoadError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ManifestLoadError {
    #[inline]
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<ArtifactVerificationError> for ManifestLoadError {
    #[inline]
    fn from(error: ArtifactVerificationError) -> Self {
        Self::Artifact(error)
    }
}

impl fmt::Display for ManifestPublishError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Manifest(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
            Self::Io(error) => write!(formatter, "could not write generation manifest: {error}"),
            Self::Persist(error) => {
                write!(formatter, "could not publish generation manifest: {error}")
            }
            Self::ExistingManifestMismatch { path } => write!(
                formatter,
                "immutable manifest at {path} differs from the attempted publication"
            ),
        }
    }
}

impl Error for ManifestPublishError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Manifest(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::ExistingManifestMismatch { .. } => None,
        }
    }
}

impl From<ArtifactVerificationError> for ManifestPublishError {
    #[inline]
    fn from(error: ArtifactVerificationError) -> Self {
        Self::Artifact(error)
    }
}

impl From<io::Error> for ManifestPublishError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
