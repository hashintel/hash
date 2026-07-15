use std::{
    fs::{self, File},
    io::{ErrorKind, Read as _, Write as _},
};

use camino::Utf8Path;
use tempfile::NamedTempFile;

use super::{
    GenerationManifest, ManifestLoadError, ManifestPublishError,
    artifact::{VerifiedArtifact, verify_and_retain_artifacts, verify_artifacts},
};
use crate::salt::hash::ContentHash;

/// Identity and disposition of an immutable manifest publication.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedManifest {
    pub content_hash: ContentHash,
    pub reused_existing: bool,
}

/// Canonical manifest and the exact artifact handles verified against it.
#[derive(Debug)]
pub(crate) struct VerifiedManifest {
    manifest: GenerationManifest,
    artifacts: Vec<VerifiedArtifact>,
}

impl VerifiedManifest {
    /// Separates the manifest value from its retained artifact handles.
    #[must_use]
    #[inline]
    pub(crate) fn into_parts(self) -> (GenerationManifest, Vec<VerifiedArtifact>) {
        (self.manifest, self.artifacts)
    }
}

/// Atomically publishes canonical manifest JSON without replacing content.
///
/// # Errors
///
/// This returns an error when the manifest is invalid, a declared artifact is
/// absent or differs, canonical encoding or durable I/O fails, or different
/// bytes already occupy `path`.
pub(crate) fn publish_manifest(
    path: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<PublishedManifest, ManifestPublishError> {
    let bytes = manifest
        .canonical_bytes()
        .map_err(|report| ManifestPublishError::Manifest(*report.current_context()))?;
    let content_hash = ContentHash::digest(&bytes);
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            format!("manifest path {path} has no parent"),
        )
    })?;
    verify_artifacts(parent, manifest)?;
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(&bytes)?;
    temporary.as_file().sync_all()?;

    let reused_existing = match temporary.persist_noclobber(path) {
        Ok(file) => {
            file.sync_all()?;
            File::open(parent)?.sync_all()?;
            false
        }
        Err(error) if error.error.kind() == ErrorKind::AlreadyExists => {
            let mut existing = Vec::new();
            File::open(path)?.read_to_end(&mut existing)?;
            if existing != bytes {
                return Err(ManifestPublishError::ExistingManifestMismatch {
                    path: path.to_owned(),
                });
            }
            true
        }
        Err(error) => return Err(ManifestPublishError::Persist(error)),
    };
    Ok(PublishedManifest {
        content_hash,
        reused_existing,
    })
}

/// Loads a canonical manifest while retaining every exact verified handle.
///
/// # Errors
///
/// This returns an error when the manifest is absent, malformed,
/// non-canonical, has a different identity, violates its invariants, or any
/// declared artifact fails role-specific verification.
pub(crate) fn load_verified_manifest_with_artifacts(
    path: &Utf8Path,
    expected: ContentHash,
) -> Result<VerifiedManifest, ManifestLoadError> {
    let bytes = fs::read(path)?;
    let manifest: GenerationManifest = serde_json::from_slice(&bytes)?;
    let canonical = manifest
        .canonical_bytes()
        .map_err(|report| ManifestLoadError::Manifest(*report.current_context()))?;
    if bytes != canonical {
        return Err(ManifestLoadError::NonCanonicalEncoding);
    }
    let actual = ContentHash::digest(&canonical);
    if actual != expected {
        return Err(ManifestLoadError::Hash { expected, actual });
    }
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            format!("manifest path {path} has no parent"),
        )
    })?;
    let artifacts = verify_and_retain_artifacts(parent, &manifest)?;
    Ok(VerifiedManifest {
        manifest,
        artifacts,
    })
}
