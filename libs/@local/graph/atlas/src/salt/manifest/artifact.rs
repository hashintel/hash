use std::{fs, io};

use camino::{Utf8Component, Utf8Path};

use super::{
    ArtifactFormatManifest, ArtifactManifest, ArtifactRole, ArtifactVerificationError,
    GenerationManifest, ManifestError, schema::validate_role_schema,
};
use crate::salt::{
    format::{
        ANALYTIC_FORMAT, BASE_ARTIFACT_FORMAT, CLASSIFIER_FORMAT, LANDMARK_FORMAT, RELATION_FORMAT,
        SEMANTIC_GRAPH_FORMAT, STRENGTH_CLASSIFIER_FORMAT,
    },
    hash::ContentHash,
    storage::mmap::{ArtifactFormat, ArtifactView, MappedArtifact, MappedFile, PublishedArtifact},
};

const REQUIRED_ARTIFACTS: [ArtifactRole; 10] = [
    ArtifactRole::RelationClassifier,
    ArtifactRole::SemanticGraph,
    ArtifactRole::RelationIndexes,
    ArtifactRole::LandmarkSkeleton,
    ArtifactRole::ProjectorCheckpoint,
    ArtifactRole::CanonicalBase,
    ArtifactRole::CanonicalAnalytics,
    ArtifactRole::LegacyLayout,
    ArtifactRole::LegacyIdentities,
    ArtifactRole::LegacyExportManifest,
];

/// One exact artifact handle retained after manifest verification.
#[derive(Debug)]
pub(crate) enum VerifiedArtifact {
    Mmap {
        role: ArtifactRole,
        artifact: MappedArtifact,
    },
    Opaque {
        role: ArtifactRole,
        file: MappedFile,
    },
}

impl VerifiedArtifact {
    /// Returns the semantic role bound by the manifest.
    #[must_use]
    #[inline]
    pub(crate) const fn role(&self) -> ArtifactRole {
        match self {
            Self::Mmap { role, .. } | Self::Opaque { role, .. } => *role,
        }
    }

    /// Borrows validated SALT sections when this is a typed mmap artifact.
    #[must_use]
    #[inline]
    pub(crate) fn view(&self) -> Option<ArtifactView<'_>> {
        match self {
            Self::Mmap { artifact, .. } => Some(artifact.view()),
            Self::Opaque { .. } => None,
        }
    }

    /// Borrows the exact bytes hashed during manifest verification.
    #[must_use]
    #[inline]
    pub(crate) fn bytes(&self) -> &[u8] {
        match self {
            Self::Mmap { artifact, .. } => artifact.bytes(),
            Self::Opaque { file, .. } => file.bytes(),
        }
    }
}

impl From<ArtifactFormat> for ArtifactFormatManifest {
    #[inline]
    fn from(format: ArtifactFormat) -> Self {
        Self {
            kind: format.kind.as_u16(),
            version: format.version.as_u16(),
        }
    }
}

impl ArtifactFormatManifest {
    #[inline]
    pub(crate) const fn artifact_format(self) -> ArtifactFormat {
        ArtifactFormat {
            kind: crate::salt::storage::mmap::ArtifactKind::new(self.kind),
            version: crate::salt::storage::mmap::FormatVersion::new(self.version),
        }
    }
}

impl ArtifactManifest {
    /// Describes a published mmap artifact.
    #[must_use]
    pub(crate) fn mmap(
        role: ArtifactRole,
        relative_path: impl Into<String>,
        artifact: PublishedArtifact,
    ) -> Self {
        Self {
            role,
            relative_path: relative_path.into(),
            content_hash: artifact.content_hash,
            byte_length: artifact.header.total_bytes,
            format: Some(artifact.header.format.into()),
        }
    }

    /// Describes a published opaque file such as a projector checkpoint.
    #[must_use]
    pub(crate) fn opaque(
        role: ArtifactRole,
        relative_path: impl Into<String>,
        content_hash: crate::salt::hash::ContentHash,
        byte_length: u64,
    ) -> Self {
        Self {
            role,
            relative_path: relative_path.into(),
            content_hash,
            byte_length,
            format: None,
        }
    }
}

pub(super) fn validate_artifacts(manifest: &GenerationManifest) -> Result<(), ManifestError> {
    for pair in manifest.artifacts.windows(2) {
        let [left, right] = pair else {
            unreachable!("two-element windows should contain two artifacts");
        };
        if left.role >= right.role {
            return Err(ManifestError::DuplicateArtifact { role: right.role });
        }
    }

    for artifact in &manifest.artifacts {
        if !single_file_name(&artifact.relative_path) {
            return Err(ManifestError::InvalidArtifactPath {
                role: artifact.role,
            });
        }
        if artifact.byte_length == 0 {
            return Err(ManifestError::InvalidArtifactLength {
                role: artifact.role,
            });
        }
        if artifact.format != expected_format(artifact.role).map(Into::into) {
            return Err(ManifestError::InvalidArtifactFormat {
                role: artifact.role,
            });
        }
    }

    for role in REQUIRED_ARTIFACTS {
        require(manifest, role)?;
    }
    match (
        manifest.relations.strength_head.enabled,
        find(manifest, ArtifactRole::StrengthHead).is_some(),
    ) {
        (true, _) => require(manifest, ArtifactRole::StrengthHead)?,
        (false, true) => {
            return Err(ManifestError::UnexpectedArtifact {
                role: ArtifactRole::StrengthHead,
            });
        }
        (false, false) => {}
    }
    let expected_count =
        REQUIRED_ARTIFACTS.len() + usize::from(manifest.relations.strength_head.enabled);
    if manifest.artifacts.len() != expected_count {
        let role = manifest
            .artifacts
            .iter()
            .map(|artifact| artifact.role)
            .find(|role| !REQUIRED_ARTIFACTS.contains(role) && *role != ArtifactRole::StrengthHead)
            .expect("unexpected artifact count should identify an unexpected role");
        return Err(ManifestError::UnexpectedArtifact { role });
    }

    bind_hash(
        manifest,
        ArtifactRole::RelationClassifier,
        manifest.relations.classifier_model_hash,
        "relations.classifier_model_hash",
    )?;
    bind_hash(
        manifest,
        ArtifactRole::SemanticGraph,
        manifest.semantic_graph.graph_hash,
        "semantic_graph.graph_hash",
    )?;
    bind_hash(
        manifest,
        ArtifactRole::LandmarkSkeleton,
        manifest.landmarks.artifact_hash,
        "landmarks.artifact_hash",
    )?;
    bind_hash(
        manifest,
        ArtifactRole::ProjectorCheckpoint,
        manifest.projector.checkpoint_hash,
        "projector.checkpoint_hash",
    )?;
    if manifest.relations.strength_head.enabled {
        bind_hash(
            manifest,
            ArtifactRole::StrengthHead,
            manifest.relations.strength_head.model_hash,
            "relations.strength_head.model_hash",
        )?;
    }
    Ok(())
}

#[expect(
    clippy::filetype_is_file,
    reason = "generation artifacts must be regular files; every other file type is rejected"
)]
pub(super) fn verify_artifacts(
    directory: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<(), ArtifactVerificationError> {
    verify_and_retain_artifacts(directory, manifest).map(drop)
}

pub(super) fn verify_and_retain_artifacts(
    directory: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<Vec<VerifiedArtifact>, ArtifactVerificationError> {
    let mut verified = Vec::with_capacity(manifest.artifacts.len());
    for artifact in &manifest.artifacts {
        let path = directory.join(&artifact.relative_path);
        let path_metadata =
            fs::symlink_metadata(&path).map_err(|error| ArtifactVerificationError::Io {
                role: artifact.role,
                error,
            })?;
        if !path_metadata.file_type().is_file() {
            return Err(ArtifactVerificationError::Io {
                role: artifact.role,
                error: io::Error::new(io::ErrorKind::InvalidData, "artifact is not a regular file"),
            });
        }
        let file = fs::File::open(&path).map_err(|error| ArtifactVerificationError::Io {
            role: artifact.role,
            error,
        })?;
        let metadata = file
            .metadata()
            .map_err(|error| ArtifactVerificationError::Io {
                role: artifact.role,
                error,
            })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt as _;

            if path_metadata.dev() != metadata.dev() || path_metadata.ino() != metadata.ino() {
                return Err(ArtifactVerificationError::Io {
                    role: artifact.role,
                    error: io::Error::new(
                        io::ErrorKind::InvalidData,
                        "artifact path changed while it was opened",
                    ),
                });
            }
        }
        let actual_length = metadata.len();
        if actual_length != artifact.byte_length {
            return Err(ArtifactVerificationError::Length {
                role: artifact.role,
                expected: artifact.byte_length,
                actual: actual_length,
            });
        }

        let retained =
            if let Some(format) = artifact.format {
                let mapped = MappedArtifact::map_immutable(file, format.artifact_format())
                    .map_err(|error| ArtifactVerificationError::Map {
                        role: artifact.role,
                        error,
                    })?;
                let header = mapped.view().header();
                let expected_sections = expected_section_count(artifact.role)
                    .expect("mmap artifact role should declare a section count");
                if header.section_count != expected_sections {
                    return Err(ArtifactVerificationError::Sections {
                        role: artifact.role,
                        expected: expected_sections,
                        actual: header.section_count,
                    });
                }
                validate_role_schema(artifact.role, mapped.view(), manifest).map_err(|detail| {
                    ArtifactVerificationError::Schema {
                        role: artifact.role,
                        detail,
                    }
                })?;
                VerifiedArtifact::Mmap {
                    role: artifact.role,
                    artifact: mapped,
                }
            } else {
                let mapped = MappedFile::map_immutable(file).map_err(|error| {
                    ArtifactVerificationError::Map {
                        role: artifact.role,
                        error,
                    }
                })?;
                VerifiedArtifact::Opaque {
                    role: artifact.role,
                    file: mapped,
                }
            };
        let actual_hash = ContentHash::digest(retained.bytes());
        if actual_hash != artifact.content_hash {
            return Err(ArtifactVerificationError::Hash {
                role: artifact.role,
                expected: artifact.content_hash,
                actual: actual_hash,
            });
        }
        verified.push(retained);
    }
    Ok(verified)
}

#[inline]
fn find(manifest: &GenerationManifest, role: ArtifactRole) -> Option<&ArtifactManifest> {
    manifest
        .artifacts
        .binary_search_by_key(&role, |artifact| artifact.role)
        .ok()
        .map(|index| &manifest.artifacts[index])
}

fn require(manifest: &GenerationManifest, role: ArtifactRole) -> Result<(), ManifestError> {
    find(manifest, role)
        .map(|_| ())
        .ok_or(ManifestError::MissingArtifact { role })
}

fn bind_hash(
    manifest: &GenerationManifest,
    role: ArtifactRole,
    expected: crate::salt::hash::ContentHash,
    field: &'static str,
) -> Result<(), ManifestError> {
    if find(manifest, role)
        .expect("required artifact should have been validated")
        .content_hash
        != expected
    {
        return Err(ManifestError::ArtifactHashMismatch { role, field });
    }
    Ok(())
}

#[inline]
fn single_file_name(path: &str) -> bool {
    let mut components = Utf8Path::new(path).components();
    !path.contains(['\\', ':'])
        && matches!(components.next(), Some(Utf8Component::Normal(_)))
        && components.next().is_none()
}

#[inline]
const fn expected_format(role: ArtifactRole) -> Option<ArtifactFormat> {
    match role {
        ArtifactRole::RelationClassifier => Some(CLASSIFIER_FORMAT),
        ArtifactRole::StrengthHead => Some(STRENGTH_CLASSIFIER_FORMAT),
        ArtifactRole::SemanticGraph => Some(SEMANTIC_GRAPH_FORMAT),
        ArtifactRole::RelationIndexes => Some(RELATION_FORMAT),
        ArtifactRole::LandmarkSkeleton => Some(LANDMARK_FORMAT),
        ArtifactRole::ProjectorCheckpoint => None,
        ArtifactRole::CanonicalBase => Some(BASE_ARTIFACT_FORMAT),
        ArtifactRole::CanonicalAnalytics => Some(ANALYTIC_FORMAT),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => None,
    }
}

#[inline]
const fn expected_section_count(role: ArtifactRole) -> Option<u32> {
    match role {
        ArtifactRole::RelationClassifier | ArtifactRole::StrengthHead => Some(7),
        ArtifactRole::SemanticGraph => Some(6),
        ArtifactRole::RelationIndexes => Some(21),
        ArtifactRole::LandmarkSkeleton => Some(3),
        ArtifactRole::ProjectorCheckpoint => None,
        ArtifactRole::CanonicalBase => Some(16),
        ArtifactRole::CanonicalAnalytics => Some(13),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => None,
    }
}
