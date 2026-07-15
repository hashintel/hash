//! Store-backed M0 generation, activation, and restart loading.

use burn::tensor::backend::{AutodiffBackend, Backend};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_store::{entity::EntityStore, entity_type::EntityTypeStore};

use super::{
    CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
    CanonicalReleaseAuthority, StoreBackedGenerationSource, run_canonical_generation,
};
use crate::salt::{
    activation::{ActivationOutcome, ActiveRelease, FileActivationStore, LoadedGeneration},
    generation::{GenerationError, activate_generation},
    snapshot::{
        AuthorizationRevisionProvider, LinkCandidate, RelationSecurityPolicy, SnapshotTemporalAxes,
        authorize_relation_geometry, authorize_snapshot,
    },
};

/// Store-extracted link candidates and the security policy applied after visibility checks.
#[derive(Debug, Clone)]
pub(crate) struct StoreBackedSnapshotRequest {
    actor: AuthenticatedActor,
    temporal_axes: SnapshotTemporalAxes,
    candidates: Box<[LinkCandidate]>,
    security_policy: RelationSecurityPolicy,
}

impl StoreBackedSnapshotRequest {
    /// Creates one authorization request from a single pinned extraction.
    #[must_use]
    pub(crate) const fn new(
        actor: AuthenticatedActor,
        temporal_axes: SnapshotTemporalAxes,
        candidates: Box<[LinkCandidate]>,
        security_policy: RelationSecurityPolicy,
    ) -> Self {
        Self {
            actor,
            temporal_axes,
            candidates,
            security_policy,
        }
    }
}

/// Complete M0 request including compare-and-swap activation precondition.
#[derive(Debug, Clone)]
pub(crate) struct StoreBackedCanonicalGenerationRequest {
    snapshot: StoreBackedSnapshotRequest,
    source: StoreBackedGenerationSource,
    expected_active: Option<ActiveRelease>,
}

impl StoreBackedCanonicalGenerationRequest {
    /// Combines extracted inputs with their explicit activation precondition.
    #[must_use]
    pub(crate) const fn new(
        snapshot: StoreBackedSnapshotRequest,
        source: StoreBackedGenerationSource,
        expected_active: Option<ActiveRelease>,
    ) -> Self {
        Self {
            snapshot,
            source,
            expected_active,
        }
    }
}

/// Published, explicitly activated, and independently reopened M0 generation.
pub(crate) struct CompletedCanonicalGeneration<B: Backend> {
    generated: CanonicalGenerationOutcome,
    activation: ActivationOutcome,
    loaded: LoadedGeneration<B>,
}

impl<B: Backend> CompletedCanonicalGeneration<B> {
    /// Borrows the inactive publication result produced before activation.
    #[must_use]
    #[inline]
    pub(crate) const fn generated(&self) -> &CanonicalGenerationOutcome {
        &self.generated
    }

    /// Returns the explicit compare-and-swap result.
    #[must_use]
    #[inline]
    pub(crate) const fn activation(&self) -> ActivationOutcome {
        self.activation
    }

    /// Borrows the generation reopened through a freshly constructed reader.
    #[must_use]
    #[inline]
    pub(crate) const fn loaded(&self) -> &LoadedGeneration<B> {
        &self.loaded
    }
}

/// Authorizes, generates, publishes, activates, and restart-loads one M0 generation.
///
/// The authorization revision is sampled around both permission calls. The
/// generation runner first publishes an inactive gated candidate. Activation
/// is a separate compare-and-swap, after which a fresh activation store
/// independently verifies and loads the complete release.
///
/// # Errors
///
/// Returns an error when authorization is not revision-consistent, extraction
/// or generation fails, activation conflicts, or restart loading does not
/// return the exact activated release.
pub(crate) async fn run_store_backed_canonical_generation<Store, Revisions, Training>(
    store: &Store,
    revisions: &Revisions,
    request: StoreBackedCanonicalGenerationRequest,
    config: &CanonicalGenerationConfig<'_>,
    release_authority: &CanonicalReleaseAuthority<'_>,
    device: Training::Device,
) -> Result<CompletedCanonicalGeneration<Training::InnerBackend>, CanonicalGenerationError>
where
    Store: EntityStore + EntityTypeStore + Sync,
    Revisions: AuthorizationRevisionProvider,
    Training: AutodiffBackend,
    Training::Device: Clone,
{
    if !request
        .source
        .matches_temporal_axes(&request.snapshot.temporal_axes)
    {
        return Err(CanonicalGenerationError::SnapshotProvenance);
    }
    let snapshot = authorize_snapshot(
        store,
        revisions,
        request.snapshot.actor,
        &request.snapshot.temporal_axes,
        &request.snapshot.candidates,
    )
    .await?;
    let geometry = authorize_relation_geometry(&snapshot, &request.snapshot.security_policy);
    let source = request.source.authorize(geometry);
    let generated =
        run_canonical_generation::<Training>(source, config, release_authority, &device)?;
    complete_published_generation::<Training::InnerBackend>(
        generated,
        config,
        release_authority,
        request.expected_active,
        device,
    )
}

fn complete_published_generation<Serving>(
    generated: CanonicalGenerationOutcome,
    config: &CanonicalGenerationConfig<'_>,
    release_authority: &CanonicalReleaseAuthority<'_>,
    expected_active: Option<ActiveRelease>,
    device: Serving::Device,
) -> Result<CompletedCanonicalGeneration<Serving>, CanonicalGenerationError>
where
    Serving: Backend,
    Serving::Device: Clone,
{
    let verifier = release_authority.signer().verifier();
    let external_verifiers = release_authority.external_verifiers().clone();
    let activation = activate_generation::<Serving>(
        config.root,
        verifier.clone(),
        external_verifiers.clone(),
        device.clone(),
        expected_active,
        generated.candidate,
    )?;
    let active = match activation {
        ActivationOutcome::Activated(active) | ActivationOutcome::AlreadyActive(active) => active,
        ActivationOutcome::Conflict { actual } => {
            return Err(CanonicalGenerationError::ActivationConflict {
                actual: actual.map(ActiveRelease::head),
            });
        }
    };
    let loaded = FileActivationStore::<Serving>::new(
        config.root.to_owned(),
        verifier,
        external_verifiers,
        device,
    )
    .load_active()
    .map_err(GenerationError::from)?
    .ok_or(CanonicalGenerationError::ReloadMissing)?;
    if loaded.release() != active {
        return Err(CanonicalGenerationError::ReloadMismatch);
    }
    Ok(CompletedCanonicalGeneration {
        generated,
        activation,
        loaded,
    })
}
