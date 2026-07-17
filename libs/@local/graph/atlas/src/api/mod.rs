//! Modern Axum HTTP surface for verified Atlas serving state.
//!
//! The API is deliberately read-only and currently performs no request
//! authorization. Every response is nevertheless sourced from an active SALT
//! generation that has passed signature, manifest, artifact, and checkpoint
//! verification. The router uses Axum 0.8 state extractors and wildcard route
//! syntax and can be nested into a larger application or served directly.
//!
//! # Trust configuration
//!
//! [`AtlasApiConfiguration`] pins the filesystem root, release authority, and
//! one independent Ed25519 verifier for every externally owned gate. Keys are
//! raw 32-byte public keys encoded as 64 lowercase hexadecimal characters.
//! They must match the authorities embedded in the active generation; this is
//! not a key-discovery endpoint.
//!
//! [`AtlasApiState::new`] eagerly reloads the active pointer. Startup fails
//! when no generation is active or when the candidate marker, signed release
//! report, manifest, artifacts, and projector checkpoint do not reverify.
//! Evidence-deferred generations additionally require an explicit serving
//! configuration opt-in.
//!
//! # Routes
//!
//! - `GET /healthz` returns `204 No Content` when the process is responsive. It does not assert
//!   that a generation is active.
//! - `GET /v1/atlas/current` returns release identity and artifact metadata for the verified active
//!   generation.
//! - `GET /v1/atlas/current/manifest` returns its generation manifest.
//! - `GET /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}` returns a bounded binary wire-v2
//!   quadrant in delivery-priority order.
//! - `GET /v1/atlas/lookup/{generation}/{variant}` resolves quantized grid coordinates to the
//!   nearest entity identities and positions (optionally every identity within a radius).
//! - `GET /v1/atlas/locate/{generation}/{variant}` inverts the lookup: it resolves durable entity
//!   IDs to grid positions plus the shallowest tile zoom guaranteed to deliver each point.
//! - `POST /v1/atlas/lookup/{generation}/{variant}/subgraph` additionally hydrates the hits from
//!   the live HASH Graph store as a traversable subgraph in one round trip; it answers `503` when
//!   no store is configured.
//!
//! Tile responses identify the complete spatial subtree and delivered prefix,
//! use an exact response hash as the quoted `ETag`, and are immutable because
//! the route binds both generation and variant. Lookup responses derive from
//! the immutable canonical base and share the same caching contract; the
//! hydrating subgraph route reads live mutable store state and is never
//! cacheable.
//!
//! # Reload
//!
//! Each request compares `active.json` with the cached `LoadedGeneration`.
//! A changed pointer is reopened once under a single-flight mutex on a blocking
//! worker and replaces the cache only after complete verification. In-flight
//! requests retain an [`Arc`] to the previous immutable generation and
//! complete safely.
//!
//! # Security
//!
//! This router performs no request authentication, tenant authorization, rate
//! limiting, or TLS termination. Bind it to loopback or a trusted internal
//! network and add those controls in the surrounding application before
//! exposing it to untrusted clients.

use alloc::sync::Arc;
use core::{error::Error, fmt, num::NonZeroUsize, str::FromStr as _};
use std::{
    io,
    sync::{Mutex, PoisonError},
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{
        StatusCode,
        header::{CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, ETAG},
    },
    response::{IntoResponse, Response},
    routing::{get, post},
};
use burn::tensor::backend::Backend;
use camino::Utf8PathBuf;
use hash_graph_store::subgraph::edges::SubgraphTraversalParams;
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;
use type_system::knowledge::entity::id::EntityId;
use uuid::Uuid;

pub use crate::salt::GraphStoreConfiguration;
use crate::salt::{
    ActiveRelease, ArtifactManifest, ArtifactRole, CONTOUR_WIRE_V1_CONTENT_TYPE, ContentHash,
    EncodedOverlay, EncodedTile, EntityHydrator, EntitySubgraph, ExternalGateVerifierSet,
    FLOW_WIRE_V1_CONTENT_TYPE, FileActivationStore, GateId, GateVerifier, GenerationAssuranceMode,
    HydrationError, HydrationRequest, LoadedGeneration, LocatedEntity, LookupRequest,
    MAXIMUM_TILE_POINTS, SpatialHit, SpatialIndex, TILE_WIRE_V4_CONTENT_TYPE, TileRequest,
    VariantId, default_traversal, encode_contours, encode_flows, encode_tile,
};

const DEFAULT_TILE_POINT_BUDGET: usize = 4_096 * 4;

/// Default hit budget for radius lookups without an explicit limit.
const DEFAULT_RADIUS_LOOKUP_HITS: usize = 32;

/// Maximum entity identities accepted by one locate request.
const MAXIMUM_LOCATE_ENTITIES: usize = 128;

/// One named Ed25519 verification key encoded as lowercase hexadecimal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifierConfiguration {
    /// Stable authority name embedded in signed gate evidence.
    pub authority: String,
    /// Raw 32-byte Ed25519 public key as 64 lowercase hexadecimal characters.
    pub public_key: String,
}

/// External release gate whose verifier is pinned by the serving process.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalGate {
    /// Full/prefix representation audit.
    Representation,
    /// Identity-aware semantic neighborhood and map-quality suite.
    SemanticFidelity,
    /// Relation policy evaluation and review report.
    RelationPolicy,
    /// Candidate/reference persistence and synthetic-shape suite.
    MergeTreePersistence,
    /// Protected subgroup behavior report.
    SubgroupBehavior,
    /// Authorization noninterference report.
    AuthorizationNoninterference,
    /// Independent security approval.
    SecurityApproval,
    /// Client and wire companion compatibility approval.
    CompanionPin,
}

/// One independently owned external gate verification key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExternalVerifierConfiguration {
    /// External gate owned by this authority.
    pub gate: ExternalGate,
    /// Stable authority name embedded in the external grant.
    pub authority: String,
    /// Raw 32-byte Ed25519 public key as 64 lowercase hexadecimal characters.
    pub public_key: String,
}

#[expect(
    clippy::doc_markdown,
    reason = "Schemars preserves this description verbatim in the public JSON schema"
)]
/// Production accelerator implemented by CubeCL.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AtlasComputeBackend {
    /// Apple Metal on macOS.
    Metal,
    /// NVIDIA CUDA on Linux.
    Cuda,
}

impl AtlasComputeBackend {
    pub(crate) const fn inference_name(self) -> &'static str {
        match self {
            Self::Metal => "fusion<cubecl<wgpu<msl>>>",
            Self::Cuda => "fusion<cubecl<cuda>>",
        }
    }

    pub(crate) const fn training_name(self) -> &'static str {
        match self {
            Self::Metal => "autodiff<fusion<cubecl<wgpu<msl>>>>",
            Self::Cuda => "autodiff<fusion<cubecl<cuda>>>",
        }
    }
}

impl fmt::Display for AtlasComputeBackend {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Metal => "metal",
            Self::Cuda => "cuda",
        })
    }
}

/// GPU backend and zero-based device ordinal shared by fit and serve.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AtlasComputeConfiguration {
    /// Required production accelerator; CPU is deliberately unavailable.
    pub backend: AtlasComputeBackend,
    /// Zero-based accelerator ordinal on the host.
    pub device_ordinal: u16,
}

impl Default for AtlasComputeConfiguration {
    fn default() -> Self {
        Self {
            backend: AtlasComputeBackend::Metal,
            device_ordinal: 0,
        }
    }
}

/// Filesystem and trust roots for a verified Atlas API instance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AtlasApiConfiguration {
    /// UTF-8 filesystem root containing activation and generation records.
    pub root: String,
    /// Exact accelerator configuration used to fit and reload checkpoints.
    pub compute: AtlasComputeConfiguration,
    /// Verifier for the authority signing every release gate document.
    pub release_verifier: VerifierConfiguration,
    /// Complete, unique verifier set for independently owned external gates.
    pub external_verifiers: Vec<ExternalVerifierConfiguration>,
    /// Whether this process may serve explicitly evidence-deferred generations.
    #[serde(default)]
    pub allow_evidence_deferred: bool,
    /// Maximum point records returned from one quadtree tile request.
    #[serde(default = "default_tile_point_budget")]
    pub tile_point_budget: usize,
    /// Optional live HASH Graph store used by lookup subgraph hydration.
    ///
    /// When absent, the spatial lookup route still serves identities and
    /// positions, but the hydrating subgraph route answers 503.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub store: Option<GraphStoreConfiguration>,
}

const fn default_tile_point_budget() -> usize {
    DEFAULT_TILE_POINT_BUDGET
}

/// An invalid serving trust configuration.
#[derive(Debug)]
pub struct AtlasApiConfigurationError {
    detail: String,
}

impl fmt::Display for AtlasApiConfigurationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)
    }
}

impl Error for AtlasApiConfigurationError {}

/// Shared verified serving state for one Burn inference backend.
pub struct AtlasApiState<B: Backend> {
    store: FileActivationStore<B>,
    cached: Mutex<Option<Arc<LoadedGeneration<B>>>>,
    spatial: Mutex<Option<(ActiveRelease, Arc<SpatialIndex>)>>,
    compute: AtlasComputeConfiguration,
    enforce_compute: bool,
    allow_evidence_deferred: bool,
    tile_point_budget: NonZeroUsize,
    store_configuration: Option<GraphStoreConfiguration>,
    hydrator: OnceCell<EntityHydrator>,
}

impl<B: Backend> AtlasApiState<B> {
    /// Validates trust pins and reopens the active generation.
    ///
    /// # Errors
    ///
    /// Returns an error when no generation is active, a key is malformed, the
    /// external verifier set is incomplete, a deferred generation is not
    /// explicitly permitted, or release evidence and artifacts do not
    /// reverify.
    pub fn new(
        configuration: AtlasApiConfiguration,
        device: B::Device,
    ) -> Result<Self, AtlasApiConfigurationError> {
        Self::new_inner(configuration, device, true)
    }

    #[cfg(test)]
    pub(crate) fn new_for_tests(
        configuration: AtlasApiConfiguration,
        device: B::Device,
    ) -> Result<Self, AtlasApiConfigurationError> {
        Self::new_inner(configuration, device, false)
    }

    fn new_inner(
        configuration: AtlasApiConfiguration,
        device: B::Device,
        enforce_compute: bool,
    ) -> Result<Self, AtlasApiConfigurationError> {
        let tile_point_budget = NonZeroUsize::new(configuration.tile_point_budget)
            .filter(|budget| budget.get() <= MAXIMUM_TILE_POINTS)
            .ok_or_else(|| {
                configuration_error(format!(
                    "tilePointBudget must be between 1 and {MAXIMUM_TILE_POINTS}"
                ))
            })?;
        let store_configuration = configuration.store.clone();
        if enforce_compute && B::name(&device) != configuration.compute.backend.inference_name() {
            return Err(configuration_error(format!(
                "configured {} backend does not match initialized {}",
                configuration.compute.backend,
                B::name(&device)
            )));
        }
        let release = verifier(&configuration.release_verifier)?;
        let external = configuration
            .external_verifiers
            .into_iter()
            .map(|configuration| {
                let gate = gate_id(configuration.gate);
                verifier(&VerifierConfiguration {
                    authority: configuration.authority,
                    public_key: configuration.public_key,
                })
                .map(|verifier| (gate, verifier))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let external = ExternalGateVerifierSet::new(&release, external)
            .map_err(|error| configuration_error(error.to_string()))?;
        let store = FileActivationStore::new(
            Utf8PathBuf::from(configuration.root),
            release,
            external,
            device,
        );
        let cached = store
            .load_active()
            .map_err(|error| configuration_error(error.to_string()))?
            .map(Arc::new);
        if cached.is_none() {
            return Err(configuration_error(
                "no Atlas generation is active; run `hash-graph-atlas fit` first",
            ));
        }
        if enforce_compute
            && cached.as_deref().is_some_and(|generation| {
                !generation_matches_compute(generation, configuration.compute)
            })
        {
            return Err(configuration_error(
                "active generation was fitted with a different accelerator backend or ordinal",
            ));
        }
        if cached.as_deref().is_some_and(|generation| {
            generation.manifest().assurance_mode == GenerationAssuranceMode::EvidenceDeferredLocal
                && !configuration.allow_evidence_deferred
        }) {
            return Err(configuration_error(
                "active generation uses evidence_deferred_local but the server does not permit it",
            ));
        }
        Ok(Self {
            store,
            cached: Mutex::new(cached),
            spatial: Mutex::new(None),
            compute: configuration.compute,
            enforce_compute,
            allow_evidence_deferred: configuration.allow_evidence_deferred,
            tile_point_budget,
            store_configuration,
            hydrator: OnceCell::new(),
        })
    }

    fn current(&self) -> Result<Option<Arc<LoadedGeneration<B>>>, HttpError> {
        let mut cached = self.cached.lock().unwrap_or_else(PoisonError::into_inner);
        // Read the pointer under the single-flight lock. A waiter must observe
        // a transition completed by the previous lock holder instead of
        // acting on a stale pointer sampled before it entered the queue.
        let pointer = self.store.active_pointer().map_err(internal_error)?;
        if cached.as_ref().map(|generation| generation.release()) == pointer {
            let current = cached.clone();
            drop(cached);
            return Ok(current);
        }
        // Keep reload single-flight. This method always runs on a blocking
        // worker, so holding the mutex across artifact copying and checkpoint
        // decoding serializes one expensive transition without blocking an
        // async executor thread.
        let loaded = self
            .store
            .load_active()
            .map_err(internal_error)?
            .map(Arc::new);
        if self.enforce_compute
            && loaded
                .as_deref()
                .is_some_and(|generation| !generation_matches_compute(generation, self.compute))
        {
            return Err(internal_error(io::Error::new(
                io::ErrorKind::InvalidData,
                "active generation was fitted with a different accelerator backend or ordinal",
            )));
        }
        if loaded.as_deref().is_some_and(|generation| {
            generation.manifest().assurance_mode == GenerationAssuranceMode::EvidenceDeferredLocal
                && !self.allow_evidence_deferred
        }) {
            return Err(internal_error(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "new active generation uses an unapproved evidence-deferred assurance mode",
            )));
        }
        cached.clone_from(&loaded);
        drop(cached);
        Ok(loaded)
    }

    /// Returns the derived spatial index for the loaded generation.
    ///
    /// The index is rebuilt at most once per activation under a single-flight
    /// mutex and shared through an [`Arc`], so in-flight lookups against a
    /// replaced generation keep their own consistent index. This method
    /// blocks while building and therefore always runs on a blocking worker.
    fn spatial(&self, loaded: &Arc<LoadedGeneration<B>>) -> Result<Arc<SpatialIndex>, HttpError> {
        let mut cached = self.spatial.lock().unwrap_or_else(PoisonError::into_inner);
        let release = loaded.release();
        if let Some((key, index)) = cached.as_ref()
            && *key == release
        {
            return Ok(Arc::clone(index));
        }
        let artifact = loaded
            .artifact(ArtifactRole::CanonicalBase)
            .ok_or_else(|| {
                internal_error(io::Error::other(
                    "active generation has no canonical base artifact",
                ))
            })?;
        let index = Arc::new(SpatialIndex::build(artifact).map_err(internal_error)?);
        *cached = Some((release, Arc::clone(&index)));
        drop(cached);
        Ok(index)
    }

    /// Returns the lazily connected lookup hydrator.
    ///
    /// A failed connection attempt is not cached; the next request retries.
    async fn store_hydrator(&self) -> Result<&EntityHydrator, HttpError> {
        let Some(configuration) = &self.store_configuration else {
            return Err(HttpError::service_unavailable(
                "no HASH Graph store is configured for lookup hydration",
            ));
        };
        self.hydrator
            .get_or_try_init(|| EntityHydrator::connect(configuration))
            .await
            .map_err(internal_error)
    }
}

/// Builds the read-only Axum 0.8 router for verified Atlas state.
pub fn router<B>(state: AtlasApiState<B>) -> Router
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let state = Arc::new(state);
    Router::new()
        .route("/healthz", get(health))
        .route("/v1/atlas/current", get(current::<B>))
        .route("/v1/atlas/current/manifest", get(manifest::<B>))
        .route(
            "/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}",
            get(tile::<B>),
        )
        .route(
            "/v1/atlas/contours/{generation}/{variant}",
            get(contours::<B>),
        )
        .route("/v1/atlas/flows/{generation}/{variant}", get(flows::<B>))
        .route("/v1/atlas/lookup/{generation}/{variant}", get(lookup::<B>))
        .route("/v1/atlas/locate/{generation}/{variant}", get(locate::<B>))
        .route(
            "/v1/atlas/lookup/{generation}/{variant}/subgraph",
            post(lookup_subgraph::<B>),
        )
        .with_state(state)
}

async fn health() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn current<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
) -> Result<Json<CurrentAtlas>, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let generation = current_generation(state).await?;
    Ok(Json(CurrentAtlas::new(&generation)))
}

async fn manifest<B>(State(state): State<Arc<AtlasApiState<B>>>) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let generation = current_generation(state).await?;
    let bytes = serde_json::to_vec(generation.manifest()).map_err(internal_error)?;
    let length = bytes.len();
    response(
        StatusCode::OK,
        Body::from(bytes),
        "application/json",
        length,
        Some(generation.release().head().manifest.to_string()),
    )
}

async fn tile<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant, zoom, x, y)): Path<(String, u16, u8, u32, u32)>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let loaded = current_generation(Arc::clone(&state)).await?;
    let release = loaded.release();
    if release.head().generation.to_string() != generation {
        return Err(HttpError::not_found(
            "requested Atlas generation is not active",
        ));
    }
    let variant = VariantId::new(variant);
    if !loaded
        .manifest()
        .variants
        .entries
        .iter()
        .any(|entry| entry.id == variant)
    {
        return Err(HttpError::not_found(
            "requested Atlas variant is not published",
        ));
    }
    if variant != loaded.manifest().variants.canonical_variant {
        return Err(HttpError::not_found(
            "requested Atlas variant has no materialized tile artifact",
        ));
    }
    let request = TileRequest::new(zoom, x, y, state.tile_point_budget)
        .map_err(|error| HttpError::bad_request(error.to_string()))?;
    let store_snapshot_identity = loaded.manifest().input_snapshot.store_snapshot_identity;
    let tile = tokio::task::spawn_blocking(move || {
        let artifact = loaded
            .artifact(ArtifactRole::CanonicalBase)
            .ok_or_else(|| io::Error::other("active generation has no canonical base artifact"))?;
        encode_tile(artifact, release, store_snapshot_identity, variant, request)
            .map_err(io::Error::other)
    })
    .await
    .map_err(internal_error)?
    .map_err(internal_error)?;
    tile_response(tile)
}

async fn contours<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant)): Path<(String, u16)>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let (loaded, variant) = materialized_generation(state, &generation, variant).await?;
    let release = loaded.release();
    let store_snapshot_identity = loaded.manifest().input_snapshot.store_snapshot_identity;
    let overlay = tokio::task::spawn_blocking(move || {
        let analytic = loaded
            .artifact(ArtifactRole::CanonicalAnalytics)
            .ok_or_else(|| io::Error::other("active generation has no analytic artifact"))?;
        let base = loaded
            .artifact(ArtifactRole::CanonicalBase)
            .ok_or_else(|| io::Error::other("active generation has no canonical base artifact"))?;
        encode_contours(analytic, base, release, store_snapshot_identity, variant)
            .map_err(io::Error::other)
    })
    .await
    .map_err(internal_error)?
    .map_err(internal_error)?;
    overlay_response(overlay, CONTOUR_WIRE_V1_CONTENT_TYPE)
}

async fn flows<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant)): Path<(String, u16)>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let (loaded, variant) = materialized_generation(state, &generation, variant).await?;
    let release = loaded.release();
    let store_snapshot_identity = loaded.manifest().input_snapshot.store_snapshot_identity;
    let overlay = tokio::task::spawn_blocking(move || {
        let analytic = loaded
            .artifact(ArtifactRole::CanonicalAnalytics)
            .ok_or_else(|| io::Error::other("active generation has no analytic artifact"))?;
        let semantic = loaded
            .artifact(ArtifactRole::SemanticGraph)
            .ok_or_else(|| io::Error::other("active generation has no semantic graph artifact"))?;
        let base = loaded
            .artifact(ArtifactRole::CanonicalBase)
            .ok_or_else(|| io::Error::other("active generation has no canonical base artifact"))?;
        encode_flows(
            analytic,
            semantic,
            base,
            release,
            store_snapshot_identity,
            variant,
        )
        .map_err(io::Error::other)
    })
    .await
    .map_err(internal_error)?
    .map_err(internal_error)?;
    overlay_response(overlay, FLOW_WIRE_V1_CONTENT_TYPE)
}

/// Query parameters for one grid-space spatial lookup.
#[derive(Debug, Copy, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LookupQuery {
    /// Quantized grid x in `[0, 65536)`, the tile wire's axis space.
    x: f32,
    /// Quantized grid y in `[0, 65536)`, the tile wire's axis space.
    y: f32,
    /// Optional search radius in grid units; absent means nearest-neighbour.
    #[serde(default)]
    radius: Option<f32>,
    /// Maximum hits; defaults to 1 without a radius and 32 with one.
    #[serde(default)]
    limit: Option<usize>,
}

/// One spatial hit serialized for lookup responses.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LookupHit {
    /// Durable graph identity in the canonical `web~entity[~draft]` form.
    entity_id: EntityId,
    /// Generation row identity, matching tile-wire records.
    row: u32,
    /// Quantized grid coordinates of the hit.
    x: f32,
    y: f32,
    /// Canonical generation coordinates of the hit.
    canonical_x: f32,
    canonical_y: f32,
    /// Euclidean distance from the query point in grid units.
    distance: f32,
    /// Importance rung of the hit's delivery bucket.
    bucket: u16,
}

impl From<SpatialHit> for LookupHit {
    fn from(hit: SpatialHit) -> Self {
        Self {
            entity_id: hit.entity_id,
            row: hit.row,
            x: hit.grid[0],
            y: hit.grid[1],
            canonical_x: hit.canonical[0],
            canonical_y: hit.canonical[1],
            distance: hit.distance,
            bucket: hit.bucket,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LookupResponse {
    generation: String,
    variant: u16,
    hits: Vec<LookupHit>,
}

async fn lookup<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant)): Path<(String, u16)>,
    Query(query): Query<LookupQuery>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let (loaded, variant) =
        materialized_generation(Arc::clone(&state), &generation, variant).await?;
    let request = lookup_request(query)?;
    let index = spatial_index(state, loaded).await?;
    let hits = index
        .query(request)
        .into_iter()
        .map(LookupHit::from)
        .collect();
    let body = LookupResponse {
        generation,
        variant: variant.get(),
        hits,
    };
    immutable_json_response(&body)
}

/// Query parameters for one identity-to-position resolution.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocateQuery {
    /// Comma-separated durable entity IDs in `web~entity[~draft]` form.
    entity_id: String,
}

/// One located entity serialized for locate responses.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocatePoint {
    /// Durable graph identity in the canonical `web~entity[~draft]` form.
    entity_id: EntityId,
    /// Generation row identity, matching tile-wire records.
    row: u32,
    /// Quantized grid coordinates of the point.
    x: f32,
    y: f32,
    /// Canonical generation coordinates of the point.
    canonical_x: f32,
    canonical_y: f32,
    /// Importance rung of the point's delivery bucket.
    bucket: u16,
    /// Shallowest tile zoom guaranteed to deliver the point under the
    /// serving point budget.
    minimum_zoom: u8,
}

impl From<LocatedEntity> for LocatePoint {
    fn from(located: LocatedEntity) -> Self {
        Self {
            entity_id: located.entity_id,
            row: located.row,
            x: located.grid[0],
            y: located.grid[1],
            canonical_x: located.canonical[0],
            canonical_y: located.canonical[1],
            bucket: located.bucket,
            minimum_zoom: located.minimum_zoom,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocateResponse {
    generation: String,
    variant: u16,
    points: Vec<LocatePoint>,
    /// Requested identities absent from the generation, original order.
    missing: Vec<EntityId>,
}

async fn locate<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant)): Path<(String, u16)>,
    Query(query): Query<LocateQuery>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let (loaded, variant) =
        materialized_generation(Arc::clone(&state), &generation, variant).await?;
    let entity_ids = query
        .entity_id
        .split(',')
        .map(|raw| {
            serde_json::from_value::<EntityId>(serde_json::Value::String(raw.trim().to_owned()))
                .map_err(|error| {
                    HttpError::bad_request(format!("invalid entityId `{raw}`: {error}"))
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if entity_ids.is_empty() {
        return Err(HttpError::bad_request(
            "locate requires at least one entityId",
        ));
    }
    if entity_ids.len() > MAXIMUM_LOCATE_ENTITIES {
        return Err(HttpError::bad_request(format!(
            "locate accepts at most {MAXIMUM_LOCATE_ENTITIES} entity IDs"
        )));
    }
    let budget = state.tile_point_budget;
    let index = spatial_index(state, loaded).await?;
    let mut points = Vec::with_capacity(entity_ids.len());
    let mut missing = Vec::new();
    for entity_id in entity_ids {
        match index.locate(&entity_id, budget) {
            Some(located) => points.push(LocatePoint::from(located)),
            None => missing.push(entity_id),
        }
    }
    let body = LocateResponse {
        generation,
        variant: variant.get(),
        points,
        missing,
    };
    immutable_json_response(&body)
}

/// Serializes one immutable, generation-bound payload with tile caching.
fn immutable_json_response<T: Serialize>(body: &T) -> Result<Response, HttpError> {
    let bytes = serde_json::to_vec(body).map_err(internal_error)?;
    let content_hash = ContentHash::digest(&bytes);
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/json")
        .header(CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .header(ETAG, format!("\"{content_hash}\""))
        .body(Body::from(bytes))
        .map_err(internal_error)
}

/// Body of one hydrating spatial lookup.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LookupSubgraphBody {
    /// Quantized grid x in `[0, 65536)`, the tile wire's axis space.
    x: f32,
    /// Quantized grid y in `[0, 65536)`, the tile wire's axis space.
    y: f32,
    /// Optional search radius in grid units; absent means nearest-neighbour.
    #[serde(default)]
    radius: Option<f32>,
    /// Maximum hits; defaults to 1 without a radius and 32 with one.
    #[serde(default)]
    limit: Option<usize>,
    /// Traversal shape in the Graph API's `SubgraphTraversalParams` form;
    /// absent means one link hop in both directions plus entity types.
    #[serde(default)]
    traversal: Option<SubgraphTraversalParams>,
    /// Acting actor for the store query; absent uses the configured default.
    #[serde(default)]
    actor_id: Option<Uuid>,
    /// Whether draft entities participate in the hydration query.
    #[serde(default)]
    include_drafts: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LookupSubgraphResponse {
    generation: String,
    variant: u16,
    hits: Vec<LookupHit>,
    subgraph: EntitySubgraph,
}

async fn lookup_subgraph<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path((generation, variant)): Path<(String, u16)>,
    Json(body): Json<LookupSubgraphBody>,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let (loaded, variant) =
        materialized_generation(Arc::clone(&state), &generation, variant).await?;
    let request = lookup_request(LookupQuery {
        x: body.x,
        y: body.y,
        radius: body.radius,
        limit: body.limit,
    })?;
    let index = spatial_index(Arc::clone(&state), loaded).await?;
    let hits: Vec<LookupHit> = index
        .query(request)
        .into_iter()
        .map(LookupHit::from)
        .collect();
    let subgraph = state
        .store_hydrator()
        .await?
        .entity_subgraph(HydrationRequest {
            roots: hits.iter().map(|hit| hit.entity_id).collect(),
            traversal: body.traversal.unwrap_or_else(default_traversal),
            actor_id: body.actor_id,
            include_drafts: body.include_drafts,
        })
        .await
        .map_err(|error| match error {
            HydrationError::Traversal { .. } => HttpError::bad_request(error.to_string()),
            HydrationError::Password { .. }
            | HydrationError::Pool { .. }
            | HydrationError::Query { .. } => internal_error(error),
        })?;
    let body = LookupSubgraphResponse {
        generation,
        variant: variant.get(),
        hits,
        subgraph,
    };
    let bytes = serde_json::to_vec(&body).map_err(internal_error)?;
    let length = bytes.len();
    response(
        StatusCode::OK,
        Body::from(bytes),
        "application/json",
        length,
        None,
    )
}

/// Resolves query defaults and validates one grid-space lookup.
fn lookup_request(query: LookupQuery) -> Result<LookupRequest, HttpError> {
    let limit = query.limit.unwrap_or_else(|| {
        if query.radius.is_some() {
            DEFAULT_RADIUS_LOOKUP_HITS
        } else {
            1
        }
    });
    let limit = NonZeroUsize::new(limit)
        .ok_or_else(|| HttpError::bad_request("lookup limit must be at least 1"))?;
    LookupRequest::new(query.x, query.y, query.radius, limit)
        .map_err(|error| HttpError::bad_request(error.to_string()))
}

/// Returns the shared spatial index for the loaded generation.
async fn spatial_index<B>(
    state: Arc<AtlasApiState<B>>,
    loaded: Arc<LoadedGeneration<B>>,
) -> Result<Arc<SpatialIndex>, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    tokio::task::spawn_blocking(move || state.spatial(&loaded))
        .await
        .map_err(internal_error)?
}

/// Validates an immutable generation-and-variant route against the active
/// head and requires the variant to carry materialized artifacts.
async fn materialized_generation<B>(
    state: Arc<AtlasApiState<B>>,
    generation: &str,
    variant: u16,
) -> Result<(Arc<LoadedGeneration<B>>, VariantId), HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let loaded = current_generation(state).await?;
    if loaded.release().head().generation.to_string() != generation {
        return Err(HttpError::not_found(
            "requested Atlas generation is not active",
        ));
    }
    let variant = VariantId::new(variant);
    if !loaded
        .manifest()
        .variants
        .entries
        .iter()
        .any(|entry| entry.id == variant)
    {
        return Err(HttpError::not_found(
            "requested Atlas variant is not published",
        ));
    }
    if variant != loaded.manifest().variants.canonical_variant {
        return Err(HttpError::not_found(
            "requested Atlas variant has no materialized artifacts",
        ));
    }
    Ok((loaded, variant))
}

fn overlay_response(
    overlay: EncodedOverlay,
    content_type: &'static str,
) -> Result<Response, HttpError> {
    let content_hash = overlay.content_hash();
    let bytes = overlay.into_bytes();
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type)
        .header(CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .header(ETAG, format!("\"{content_hash}\""))
        .body(Body::from(bytes))
        .map_err(internal_error)
}

async fn current_generation<B>(
    state: Arc<AtlasApiState<B>>,
) -> Result<Arc<LoadedGeneration<B>>, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    let generation = tokio::task::spawn_blocking(move || state.current())
        .await
        .map_err(internal_error)??;
    generation.ok_or_else(no_active_generation)
}

fn response(
    status: StatusCode,
    body: Body,
    content_type: &'static str,
    length: usize,
    etag: Option<String>,
) -> Result<Response, HttpError> {
    let mut builder = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header(CACHE_CONTROL, "no-cache")
        .header(CONTENT_LENGTH, length.to_string());
    if let Some(etag) = etag {
        builder = builder.header(ETAG, format!("\"{etag}\""));
    }
    builder.body(body).map_err(internal_error)
}

fn tile_response(tile: EncodedTile) -> Result<Response, HttpError> {
    let content_hash = tile.content_hash();
    let visible = tile.visible_subtree_count();
    let delivered = tile.delivered_count();
    let bytes = tile.into_bytes();
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, TILE_WIRE_V4_CONTENT_TYPE)
        .header(CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .header(ETAG, format!("\"{content_hash}\""))
        .header("x-atlas-visible-subtree-count", visible.to_string())
        .header("x-atlas-delivered-count", delivered.to_string())
        .body(Body::from(bytes))
        .map_err(internal_error)
}

#[derive(Debug, Serialize)]
struct CurrentAtlas {
    generation: String,
    base_revision: u64,
    delta_revision: u64,
    manifest_hash: String,
    release_report_hash: String,
    assurance_mode: &'static str,
    created_at: String,
    artifacts: Vec<ArtifactSummary>,
}

impl CurrentAtlas {
    fn new<B: Backend>(generation: &LoadedGeneration<B>) -> Self {
        let release = generation.release();
        let head = release.head();
        let manifest = generation.manifest();
        Self {
            generation: head.generation.to_string(),
            base_revision: head.data.base().get(),
            delta_revision: head.data.delta().get(),
            manifest_hash: head.manifest.to_string(),
            release_report_hash: release.report().to_string(),
            assurance_mode: match manifest.assurance_mode {
                GenerationAssuranceMode::IndependentAuthorities => "independent_authorities",
                GenerationAssuranceMode::EvidenceDeferredLocal => "evidence_deferred_local",
            },
            created_at: manifest.created_at.to_string(),
            artifacts: manifest
                .artifacts
                .iter()
                .map(ArtifactSummary::new)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
struct ArtifactSummary {
    role: &'static str,
    relative_path: String,
    content_hash: String,
    byte_length: u64,
}

impl ArtifactSummary {
    fn new(artifact: &ArtifactManifest) -> Self {
        Self {
            role: role_name(artifact.role),
            relative_path: artifact.relative_path.clone(),
            content_hash: artifact.content_hash.to_string(),
            byte_length: artifact.byte_length,
        }
    }
}

const fn role_name(role: ArtifactRole) -> &'static str {
    match role {
        ArtifactRole::Representations => "representations",
        ArtifactRole::RelationClassifier => "relation-classifier",
        ArtifactRole::StrengthHead => "strength-head",
        ArtifactRole::SemanticGraph => "semantic-graph",
        ArtifactRole::RelationIndexes => "relation-indexes",
        ArtifactRole::LandmarkSkeleton => "landmark-skeleton",
        ArtifactRole::LandmarkReferencePersistence => "landmark-reference-persistence",
        ArtifactRole::ProjectorCheckpoint => "projector-checkpoint",
        ArtifactRole::CanonicalBase => "canonical-base",
        ArtifactRole::CanonicalAnalytics => "canonical-analytics",
        ArtifactRole::RepresentationReport => "representation-report",
        ArtifactRole::SemanticFidelityReport => "semantic-fidelity-report",
        ArtifactRole::RelationPolicyReport => "relation-policy-report",
        ArtifactRole::MergeTreePersistenceReport => "merge-tree-persistence-report",
        ArtifactRole::SubgroupBehaviorReport => "subgroup-behavior-report",
        ArtifactRole::AuthorizationNoninterferenceReport => "authorization-noninterference-report",
        ArtifactRole::SecurityApprovalReport => "security-approval-report",
        ArtifactRole::CompanionPinReport => "companion-pin-report",
        ArtifactRole::LegacyLayout => "legacy-layout",
        ArtifactRole::LegacyIdentities => "legacy-identities",
        ArtifactRole::LegacyExportManifest => "legacy-export-manifest",
    }
}

fn verifier(
    configuration: &VerifierConfiguration,
) -> Result<GateVerifier, AtlasApiConfigurationError> {
    let public_key = ContentHash::from_str(&configuration.public_key)
        .map_err(|error| configuration_error(error.to_string()))?;
    GateVerifier::new(configuration.authority.clone(), *public_key.as_bytes())
        .map_err(|error| configuration_error(error.to_string()))
}

const fn gate_id(gate: ExternalGate) -> GateId {
    match gate {
        ExternalGate::Representation => GateId::Representation,
        ExternalGate::SemanticFidelity => GateId::SemanticFidelity,
        ExternalGate::RelationPolicy => GateId::RelationPolicy,
        ExternalGate::MergeTreePersistence => GateId::MergeTreePersistence,
        ExternalGate::SubgroupBehavior => GateId::SubgroupBehavior,
        ExternalGate::AuthorizationNoninterference => GateId::AuthorizationNoninterference,
        ExternalGate::SecurityApproval => GateId::SecurityApproval,
        ExternalGate::CompanionPin => GateId::CompanionPin,
    }
}

fn generation_matches_compute<B: Backend>(
    generation: &LoadedGeneration<B>,
    compute: AtlasComputeConfiguration,
) -> bool {
    let execution = &generation.manifest().reproducibility.execution_contract;
    execution.training_backend == compute.backend.training_name()
        && execution.accelerator_device_ordinal == compute.device_ordinal
}

fn configuration_error(detail: impl Into<String>) -> AtlasApiConfigurationError {
    AtlasApiConfigurationError {
        detail: detail.into(),
    }
}

#[derive(Debug)]
struct HttpError {
    status: StatusCode,
    detail: String,
}

impl HttpError {
    fn bad_request(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            detail: detail.into(),
        }
    }

    fn not_found(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            detail: detail.into(),
        }
    }

    fn service_unavailable(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            detail: detail.into(),
        }
    }
}

impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        (self.status, Json(ErrorResponse { error: self.detail })).into_response()
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn no_active_generation() -> HttpError {
    HttpError::not_found("no Atlas generation is active")
}

fn internal_error(error: impl fmt::Display) -> HttpError {
    HttpError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        detail: error.to_string(),
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
