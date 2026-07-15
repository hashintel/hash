use burn::tensor::backend::Backend;
use camino::Utf8Path;

use super::{ActivationError, ActiveRelease, FileActivationStore};
use crate::salt::{
    manifest::{
        ArtifactRole, GenerationManifest, VerifiedArtifact, load_verified_manifest_with_artifacts,
    },
    projector::{ConditionedProjector, ProjectorConfig, load_projector_checkpoint_bytes},
    storage::mmap::ArtifactView,
};

const MANIFEST_FILE: &str = "manifest.json";

/// A verified active generation ready for zero-copy reads and projection.
///
/// Every typed artifact remains mapped and locked for the lifetime of this
/// value. The projector checkpoint has already been decoded into the exact
/// architecture declared by [`GenerationManifest`].
pub(crate) struct LoadedGeneration<B: Backend> {
    release: ActiveRelease,
    manifest: GenerationManifest,
    artifacts: Vec<VerifiedArtifact>,
    projector: ConditionedProjector<B>,
}

impl<B: Backend> LoadedGeneration<B> {
    /// Returns the immutable release identity verified during loading.
    #[must_use]
    #[inline]
    pub(crate) const fn release(&self) -> ActiveRelease {
        self.release
    }

    /// Borrows the manifest governing every loaded artifact.
    #[must_use]
    #[inline]
    pub(crate) const fn manifest(&self) -> &GenerationManifest {
        &self.manifest
    }

    /// Borrows one validated mapped artifact by semantic role.
    #[must_use]
    pub(crate) fn artifact(&self, role: ArtifactRole) -> Option<ArtifactView<'_>> {
        self.artifacts
            .iter()
            .find_map(|artifact| (artifact.role() == role).then(|| artifact.view()).flatten())
    }

    /// Borrows the decoded relation-conditioned projector.
    #[must_use]
    #[inline]
    pub(crate) const fn projector(&self) -> &ConditionedProjector<B> {
        &self.projector
    }
}

impl<B: Backend> FileActivationStore<B> {
    /// Loads the complete active generation.
    ///
    /// The active pointer, candidate marker, signed release evidence, manifest,
    /// artifact hashes and schemas, and projector record are revalidated before
    /// this returns. `None` means no generation has been activated.
    ///
    /// # Errors
    ///
    /// This returns an error when any active identity, signature, file hash,
    /// artifact schema, memory mapping, or projector tensor differs from the
    /// immutable release contract.
    pub(crate) fn load_active(&self) -> Result<Option<LoadedGeneration<B>>, ActivationError> {
        let Some(release) = self.current()? else {
            return Ok(None);
        };
        let directory = generation_directory(&self.root, release);
        let verified = load_verified_manifest_with_artifacts(
            &directory.join(MANIFEST_FILE),
            release.head().manifest,
        )?;
        let (manifest, artifacts) = verified.into_parts();
        let checkpoint = artifacts
            .iter()
            .find(|artifact| artifact.role() == ArtifactRole::ProjectorCheckpoint)
            .expect("validated manifest should contain a projector checkpoint");
        let projector = load_projector_checkpoint_bytes::<B>(
            checkpoint.bytes(),
            projector_config(&manifest),
            &self.device,
        )?;
        Ok(Some(LoadedGeneration {
            release,
            manifest,
            artifacts,
            projector,
        }))
    }
}

#[inline]
fn generation_directory(root: &Utf8Path, release: ActiveRelease) -> camino::Utf8PathBuf {
    root.join("generations")
        .join(release.head().generation.to_string())
}

#[inline]
pub(super) const fn projector_config(manifest: &GenerationManifest) -> ProjectorConfig {
    ProjectorConfig {
        width: manifest.projector.width,
        residual_blocks: manifest.projector.residual_blocks,
        type_context_dimensions: manifest.projector.type_context_dimensions,
        role_count: manifest.projector.role_count,
        role_dimensions: manifest.projector.role_dimensions,
    }
}
