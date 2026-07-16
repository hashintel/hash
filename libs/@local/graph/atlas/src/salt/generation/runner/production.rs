//! Store-backed canonical generation, activation, and restart loading.
//!
//! This module composes the graph store's existing permission APIs with SALT's
//! pure frozen-input runner. Extraction remains application-owned, but its
//! provenance, selected editions, and required type closure are checked here
//! before any relation can influence coordinates.
//!
//! A successful call returns three views of the same release:
//!
//! - the generation result produced while the candidate was still inactive;
//! - the explicit compare-and-swap activation outcome; and
//! - a [`LoadedGeneration`] opened through a newly constructed activation store.
//!
//! Keeping all three lets an adapter produce a stable receipt while proving
//! that publication, activation, and restart loading agree on the exact release
//! head.
//!
//! Permission reads are asynchronous; generation after authorization is a
//! long-running synchronous CPU/GPU and filesystem workload. Applications
//! should run this composition in a dedicated fitting worker or process, not
//! directly on an Axum request executor.

use burn::tensor::backend::{AutodiffBackend, Backend};
use error_stack::Report;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_store::{entity::EntityStore, entity_type::EntityTypeStore};

use super::{
    CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
    CanonicalReleaseAuthority, StoreBackedGenerationSource, identity::input_hash,
    input::freeze_generation_input, run::run_frozen_canonical_generation,
};
use crate::salt::{
    activation::{
        ActivationOutcome, FileActivationStore, LoadedGeneration, withdraw_candidate_marker,
    },
    generation::{GenerationError, activate_generation},
    snapshot::{
        AuthorizationActivationLeaseProvider, AuthorizationRevisionProvider,
        ExtractionReceiptSubject, LinkCandidate, RelationSecurityPolicy, SnapshotError,
        SnapshotTemporalAxes, StoreExtractionReceipt, StoreExtractionReceiptVerifier,
        authorize_relation_geometry, authorize_snapshot,
    },
};

/// Store-extracted link candidates and the security policy applied after visibility checks.
#[derive(Debug)]
pub(crate) struct StoreBackedSnapshotRequest {
    actor: AuthenticatedActor,
    temporal_axes: SnapshotTemporalAxes,
    candidates: Box<[LinkCandidate]>,
    security_policy: RelationSecurityPolicy,
    extraction_receipt: StoreExtractionReceipt,
}

impl StoreBackedSnapshotRequest {
    /// Creates one authorization request from a single pinned extraction.
    #[must_use]
    pub(crate) const fn new(
        actor: AuthenticatedActor,
        temporal_axes: SnapshotTemporalAxes,
        candidates: Box<[LinkCandidate]>,
        security_policy: RelationSecurityPolicy,
        extraction_receipt: StoreExtractionReceipt,
    ) -> Self {
        Self {
            actor,
            temporal_axes,
            candidates,
            security_policy,
            extraction_receipt,
        }
    }
}

/// Complete initial-generation request.
#[derive(Debug)]
pub(crate) struct StoreBackedCanonicalGenerationRequest {
    snapshot: StoreBackedSnapshotRequest,
    source: StoreBackedGenerationSource,
    expected_active: Option<crate::salt::activation::ActiveRelease>,
}

impl StoreBackedCanonicalGenerationRequest {
    /// Combines extracted inputs for an initial compare-and-swap activation.
    #[must_use]
    pub(crate) const fn new(
        snapshot: StoreBackedSnapshotRequest,
        source: StoreBackedGenerationSource,
    ) -> Self {
        Self {
            snapshot,
            source,
            expected_active: None,
        }
    }

    /// Supplies the authenticated active head observed before fitting.
    #[must_use]
    pub(crate) const fn with_expected_active(
        mut self,
        expected_active: Option<crate::salt::activation::ActiveRelease>,
    ) -> Self {
        self.expected_active = expected_active;
        self
    }
}

/// Published, explicitly activated, and independently reopened generation.
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

/// Authorizes, generates, publishes, activates, and restart-loads one generation.
///
/// The authorization revision is sampled around both permission calls. The
/// generation runner first publishes an inactive gated candidate. Activation
/// is a separate compare-and-swap performed while an authorization-owned lease
/// prevents the verified revision from changing. A fresh activation store then
/// independently verifies and loads the complete release.
///
/// # Errors
///
/// Returns an error when authorization is not revision-consistent, extraction
/// or generation fails, activation conflicts, or restart loading does not
/// return the exact activated release.
pub(crate) async fn run_store_backed_canonical_generation<Store, Revisions, Receipts, Training>(
    store: &Store,
    revisions: &Revisions,
    receipts: &Receipts,
    request: StoreBackedCanonicalGenerationRequest,
    config: &CanonicalGenerationConfig<'_>,
    release_authority: &CanonicalReleaseAuthority<'_>,
    device: Training::Device,
) -> Result<CompletedCanonicalGeneration<Training::InnerBackend>, CanonicalGenerationError>
where
    Store: EntityStore + EntityTypeStore + Sync,
    Revisions: AuthorizationRevisionProvider + AuthorizationActivationLeaseProvider,
    Receipts: StoreExtractionReceiptVerifier,
    Training: AutodiffBackend,
    Training::Device: Clone,
{
    let StoreBackedCanonicalGenerationRequest {
        snapshot,
        source,
        expected_active,
    } = request;
    let StoreBackedSnapshotRequest {
        actor,
        temporal_axes,
        candidates,
        security_policy,
        extraction_receipt,
    } = snapshot;
    if !source.matches_temporal_axes(&temporal_axes) {
        return Err(CanonicalGenerationError::SnapshotProvenance);
    }
    let snapshot = authorize_snapshot(
        store,
        revisions,
        actor,
        &temporal_axes,
        &source.selected_editions,
        &candidates,
    )
    .await?;
    let authorization_revision = snapshot.authorization_revision();
    let geometry = authorize_relation_geometry(&snapshot, &security_policy);
    let mut frozen = freeze_generation_input(source.authorize(geometry))?;
    let manifest = frozen.begin_manifest();
    let frozen_input_hash = input_hash(&frozen);
    let receipt_hash = receipts
        .verify_extraction_receipt(
            actor,
            extraction_receipt,
            ExtractionReceiptSubject {
                temporal_axes,
                authorization_revision,
                ontology_hash: manifest.input_snapshot.ontology_hash,
                knowledge_hash: manifest.input_snapshot.knowledge_hash,
                frozen_input_hash,
            },
        )
        .await
        .map_err(Report::new)?;
    if receipt_hash == crate::salt::hash::ContentHash::from_bytes([0; 32]) {
        return Err(Report::new(SnapshotError::ExtractionReceipt).into());
    }
    frozen.bind_extraction_receipt(receipt_hash);
    let generated =
        run_frozen_canonical_generation::<Training>(frozen, config, release_authority, &device)?;
    // The authorization authority, rather than a preceding standalone read,
    // owns the interval through the active-pointer linearization point.
    let activation_lease = revisions
        .acquire_activation_lease(authorization_revision)
        .await
        .map_err(Report::new)?;
    let completed = complete_published_generation::<Training::InnerBackend>(
        generated,
        config,
        release_authority,
        device,
        expected_active,
    );
    drop(activation_lease);
    completed
}

/// Runs the explicitly lower-assurance local M0 authorization envelope.
///
/// This path performs exact-edition permission checks and samples the
/// application-derived authorization revision before permissions, after
/// permissions, and immediately before activation. It deliberately does not
/// claim a store-issued extraction receipt or an authorization-owned activation
/// lease. A permission mutation can therefore race the last revision read and
/// the active-pointer update. Callers must surface that limitation as
/// `m0_local_attestation`; this function is not a substitute for
/// [`run_store_backed_canonical_generation`].
pub(crate) async fn run_local_m0_canonical_generation<Store, Revisions, Training>(
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
    Training::Device: Clone + Send + Sync,
{
    let StoreBackedCanonicalGenerationRequest {
        snapshot,
        source,
        expected_active,
    } = request;
    let StoreBackedSnapshotRequest {
        actor,
        temporal_axes,
        candidates,
        security_policy,
        extraction_receipt,
    } = snapshot;
    if !source.matches_temporal_axes(&temporal_axes) {
        return Err(CanonicalGenerationError::SnapshotProvenance);
    }
    let snapshot = authorize_snapshot(
        store,
        revisions,
        actor,
        &temporal_axes,
        &source.selected_editions,
        &candidates,
    )
    .await?;
    let authorization_revision = snapshot.authorization_revision();
    let rejection_counts = snapshot.rejection_counts();
    let geometry = authorize_relation_geometry(&snapshot, &security_policy);
    let mut source = source.authorize(geometry);
    source.bind_local_authorization_attestation(rejection_counts);
    let mut frozen = freeze_generation_input(source)?;
    let manifest = frozen.begin_manifest();
    let frozen_input_hash = input_hash(&frozen);
    let receipt_hash = local_receipt_hash(
        &extraction_receipt,
        &temporal_axes,
        authorization_revision,
        manifest.input_snapshot.ontology_hash,
        manifest.input_snapshot.knowledge_hash,
        frozen_input_hash,
    );
    frozen.bind_extraction_receipt(receipt_hash);
    let generated = std::thread::scope(|scope| {
        scope
            .spawn(|| {
                run_frozen_canonical_generation::<Training>(
                    frozen,
                    config,
                    release_authority,
                    &device,
                )
            })
            .join()
    })
    .map_err(|_panic| CanonicalGenerationError::WorkerPanic)??;
    let before_activation = revisions
        .authorization_revision()
        .await
        .map_err(Report::new)?;
    if before_activation != authorization_revision {
        withdraw_candidate_marker(config.root, generated.candidate.release())
            .map_err(GenerationError::from)?;
        return Err(Report::new(SnapshotError::AuthorizationRevisionChanged {
            before: authorization_revision,
            after: before_activation,
        })
        .into());
    }
    complete_published_generation::<Training::InnerBackend>(
        generated,
        config,
        release_authority,
        device,
        expected_active,
    )
}

fn local_receipt_hash(
    receipt: &StoreExtractionReceipt,
    temporal_axes: &SnapshotTemporalAxes,
    authorization_revision: crate::salt::revision::AuthorizationRevision,
    ontology_hash: crate::salt::hash::ContentHash,
    knowledge_hash: crate::salt::hash::ContentHash,
    frozen_input_hash: crate::salt::hash::ContentHash,
) -> crate::salt::hash::ContentHash {
    let mut hasher =
        crate::salt::hash::ContentHasher::new(b"hash.graph.atlas.salt.local-receipt.v1");
    hasher.update(receipt.as_bytes());
    hasher.update(temporal_axes.store_snapshot_identity().as_bytes());
    hasher.update(authorization_revision.content_hash().as_bytes());
    hasher.update(ontology_hash.as_bytes());
    hasher.update(knowledge_hash.as_bytes());
    hasher.update(frozen_input_hash.as_bytes());
    hasher.finish()
}

fn complete_published_generation<Serving>(
    generated: CanonicalGenerationOutcome,
    config: &CanonicalGenerationConfig<'_>,
    release_authority: &CanonicalReleaseAuthority<'_>,
    device: Serving::Device,
    expected_active: Option<crate::salt::activation::ActiveRelease>,
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
                actual: actual.map(crate::salt::activation::ActiveRelease::head),
            });
        }
    };
    // Construct a new store instead of reusing any publication-time handles.
    // This exercises the same pointer-to-signature-to-artifact chain that a
    // fresh serving process follows after restart.
    let restart_store = FileActivationStore::<Serving>::new(
        config.root.to_owned(),
        verifier,
        external_verifiers,
        device,
    );
    let loaded = match restart_store.load_active().map_err(GenerationError::from) {
        Ok(Some(loaded)) => loaded,
        Ok(None) => {
            return Err(compensate_activation(
                &restart_store,
                activation,
                expected_active,
                CanonicalGenerationError::ReloadMissing,
            ));
        }
        Err(error) => {
            return Err(compensate_activation(
                &restart_store,
                activation,
                expected_active,
                error.into(),
            ));
        }
    };
    if loaded.release() != active {
        return Err(compensate_activation(
            &restart_store,
            activation,
            expected_active,
            CanonicalGenerationError::ReloadMismatch,
        ));
    }
    Ok(CompletedCanonicalGeneration {
        generated,
        activation,
        loaded,
    })
}

fn compensate_activation<Serving>(
    store: &FileActivationStore<Serving>,
    activation: ActivationOutcome,
    previous: Option<crate::salt::activation::ActiveRelease>,
    error: CanonicalGenerationError,
) -> CanonicalGenerationError
where
    Serving: Backend,
{
    let ActivationOutcome::Activated(current) = activation else {
        return error;
    };
    match store.restore_if_current(current, previous) {
        Ok(_restored_or_replaced) => error,
        Err(rollback_error) => GenerationError::from(rollback_error).into(),
    }
}
