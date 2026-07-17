use burn::tensor::backend::Backend;

use super::{ActivationError, ActiveRelease, FileActivationStore};
use crate::salt::{
    manifest::{ArtifactRole, GenerationManifest, VerifiedArtifact},
    projector::{ConditionedProjector, ProjectorConfig},
    storage::mmap::ArtifactView,
};

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

    /// Borrows verified bytes by their manifest-relative path.
    #[must_use]
    pub(crate) fn artifact_bytes(&self, relative_path: &str) -> Option<&[u8]> {
        let role = self.manifest.artifacts.iter().find_map(|artifact| {
            (artifact.relative_path == relative_path).then_some(artifact.role)
        })?;
        self.artifacts
            .iter()
            .find_map(|artifact| (artifact.role() == role).then(|| artifact.bytes()))
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
        let Some((release, prepared)) = self.prepare_current()? else {
            return Ok(None);
        };
        let (manifest, artifacts, projector) = prepared.into_parts();
        Ok(Some(LoadedGeneration {
            release,
            manifest,
            artifacts,
            projector,
        }))
    }
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
