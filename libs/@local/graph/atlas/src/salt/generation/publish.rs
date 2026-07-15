use std::time::Instant;

use burn::tensor::backend::Backend;
use camino::Utf8Path;

use super::error::GenerationError;
use crate::salt::{
    activation::{ActivationOutcome, ActiveRelease, FileActivationStore},
    manifest::{GenerationManifest, PublishedManifest, publish_manifest_with_artifacts},
    release::{
        ExternalGateVerifierSet, GateEvidenceSet, GateVerifier, GatedRelease,
        publish_gated_candidate,
    },
};

const MANIFEST_FILE: &str = "manifest.json";

/// Immutable manifest and gate authority for a discoverable candidate.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedCandidate {
    manifest: PublishedManifest,
    release: GatedRelease,
}

impl PublishedCandidate {
    /// Returns the immutable manifest publication.
    #[must_use]
    #[inline]
    pub(crate) const fn manifest(self) -> PublishedManifest {
        self.manifest
    }

    /// Returns the gate authority bound to the same manifest.
    #[must_use]
    #[inline]
    pub(crate) const fn release(self) -> GatedRelease {
        self.release
    }
}

/// Publishes a complete manifest and passing release report as a candidate.
///
/// This operation deliberately stops before activation. Every required gate,
/// including the canvas companion pin and security approval, must have passing
/// evidence before the candidate marker becomes visible.
///
/// # Errors
///
/// This returns an error when manifest publication fails, gate evidence is
/// incomplete or failing, or durable candidate publication fails.
pub(crate) fn publish_generation_candidate(
    root: &Utf8Path,
    manifest: &GenerationManifest,
    evidence: &GateEvidenceSet,
) -> Result<PublishedCandidate, GenerationError> {
    let started = Instant::now();
    let directory = root
        .join("generations")
        .join(manifest.generation_id.to_string());
    let (published_manifest, _verified_artifacts) =
        publish_manifest_with_artifacts(&directory.join(MANIFEST_FILE), manifest)?;
    if evidence.head().generation != manifest.generation_id
        || evidence.head().manifest != published_manifest.content_hash
    {
        return Err(GenerationError::EvidenceHead);
    }
    let release = publish_gated_candidate(root, evidence)?;
    let candidate = PublishedCandidate {
        manifest: published_manifest,
        release,
    };
    tracing::info!(
        target: "hash_graph_atlas::salt",
        duration_ms = started.elapsed().as_millis(),
        "gated atlas generation candidate published"
    );
    Ok(candidate)
}

/// Explicitly activates a previously published gated candidate.
///
/// Compare-and-swap prevents an operator from overwriting a generation that
/// became active after they inspected the current pointer.
///
/// # Errors
///
/// This returns an error when the candidate marker is absent or activation
/// state cannot be read or durably replaced.
pub(crate) fn activate_generation<B: Backend>(
    root: &Utf8Path,
    verifier: GateVerifier,
    external_verifiers: ExternalGateVerifierSet,
    device: B::Device,
    expected: Option<ActiveRelease>,
    candidate: PublishedCandidate,
) -> Result<ActivationOutcome, GenerationError> {
    let started = Instant::now();
    let outcome =
        FileActivationStore::<B>::new(root.to_owned(), verifier, external_verifiers, device)
            .compare_exchange(expected, candidate.release)
            .map_err(GenerationError::from)?;
    tracing::info!(
        target: "hash_graph_atlas::salt",
        duration_ms = started.elapsed().as_millis(),
        "atlas generation activated"
    );
    Ok(outcome)
}
