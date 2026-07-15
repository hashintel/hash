#![expect(
    clippy::std_instead_of_core,
    reason = "core::io::ErrorKind remains unstable on the pinned nightly toolchain"
)]
use std::{
    fs::{self, File},
    io::{ErrorKind, Read as _, Write as _},
};

use camino::Utf8Path;
use tempfile::NamedTempFile;

use super::{
    GenerationManifest, ManifestLoadError, ManifestPublishError,
    artifact::{VerifiedArtifact, verify_and_retain_artifacts},
};
use crate::salt::hash::ContentHash;

const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

/// Identity and disposition of an immutable manifest publication.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedManifest {
    pub content_hash: ContentHash,
    pub reused_existing: bool,
}

/// Atomically publishes canonical manifest JSON without replacing content.
///
/// # Errors
///
/// This returns an error when the manifest is invalid, a declared artifact is
/// absent or differs, canonical encoding or durable I/O fails, or different
/// bytes already occupy `path`.
#[cfg(test)]
pub(crate) fn publish_manifest(
    path: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<PublishedManifest, ManifestPublishError> {
    publish_manifest_with_artifacts(path, manifest).map(|(published, _artifacts)| published)
}

/// Publishes a manifest while retaining the artifact handles it verified.
///
/// The returned handles keep the exact files used for manifest validation
/// alive across a subsequent candidate-marker publication.
///
/// # Errors
///
/// This returns an error when manifest validation, artifact verification,
/// canonical encoding, or durable no-clobber publication fails.
pub(crate) fn publish_manifest_with_artifacts(
    path: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<(PublishedManifest, Vec<VerifiedArtifact>), ManifestPublishError> {
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
    let artifacts = verify_and_retain_artifacts(parent, manifest)?;
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
            let existing = read_bounded(path, MAX_MANIFEST_BYTES)?;
            if existing != bytes {
                return Err(ManifestPublishError::ExistingManifestMismatch {
                    path: path.to_owned(),
                });
            }
            true
        }
        Err(error) => return Err(ManifestPublishError::Persist(error)),
    };
    Ok((
        PublishedManifest {
            content_hash,
            reused_existing,
        },
        artifacts,
    ))
}

/// Loads and authenticates canonical manifest metadata without opening artifacts.
///
/// # Errors
///
/// This returns an error when the file exceeds 16 MiB, is malformed or
/// non-canonical, has a different identity, or violates manifest invariants.
pub(crate) fn load_verified_manifest(
    path: &Utf8Path,
    expected: ContentHash,
) -> Result<GenerationManifest, ManifestLoadError> {
    let bytes = read_bounded(path, MAX_MANIFEST_BYTES)?;
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
    Ok(manifest)
}

/// Opens and verifies every artifact declared by authenticated manifest metadata.
///
/// # Errors
///
/// This returns an error when the manifest has no parent directory or any
/// artifact differs in path, type, length, format, schema, or content hash.
pub(crate) fn verify_loaded_manifest_artifacts(
    manifest_path: &Utf8Path,
    manifest: &GenerationManifest,
) -> Result<Vec<VerifiedArtifact>, ManifestLoadError> {
    let parent = manifest_path.parent().ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            format!("manifest path {manifest_path} has no parent"),
        )
    })?;
    verify_and_retain_artifacts(parent, manifest).map_err(Into::into)
}

fn read_bounded(path: &Utf8Path, maximum: u64) -> Result<Vec<u8>, std::io::Error> {
    let mut file = File::open(path)?;
    file.lock_shared()?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            format!(
                "manifest file must be regular and no larger than {maximum} bytes; actual length \
                 is {}",
                metadata.len()
            ),
        ));
    }
    let capacity = usize::try_from(metadata.len()).map_err(|_error| {
        std::io::Error::new(
            ErrorKind::InvalidData,
            "manifest length does not fit memory",
        )
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    std::io::Read::by_ref(&mut file)
        .take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if !matches!(
        u64::try_from(bytes.len()),
        Ok(length) if length <= maximum
    ) {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            "manifest grew beyond its byte limit while it was read",
        ));
    }
    if u64::try_from(bytes.len()).ok() != Some(metadata.len()) {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            "manifest length changed while it was read",
        ));
    }
    Ok(bytes)
}
