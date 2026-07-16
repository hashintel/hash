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
//! [`AtlasApiState::new`] eagerly reloads the active pointer. When a pointer is
//! present, startup fails unless the candidate marker, signed release report,
//! manifest, every artifact, and the projector checkpoint reverify. An empty
//! root is valid and serves `404 Not Found` from current-state routes.
//!
//! # Routes
//!
//! - `GET /healthz` returns `204 No Content` when the process is responsive. It does not assert
//!   that a generation is active.
//! - `GET /v1/atlas/current` returns release identity and artifact metadata for the verified active
//!   generation.
//! - `GET /v1/atlas/current/manifest` returns its generation manifest.
//! - `GET /v1/atlas/current/artifacts/{*relative_path}` streams one manifest-listed artifact.
//!
//! Artifact responses support one standard byte range, including open-ended
//! and suffix ranges. Multiple or unsatisfiable ranges return
//! `416 Range Not Satisfiable`. The content hash is the quoted `ETag`; response
//! caching is left to a trusted reverse proxy.
//!
//! # Reload and streaming
//!
//! Each request compares `active.json` with the cached `LoadedGeneration`.
//! A changed pointer is reopened once under a single-flight mutex on a blocking
//! worker and replaces the cache only after complete verification. In-flight
//! requests retain an [`Arc`] to the previous immutable generation and
//! complete safely.
//!
//! Artifacts are streamed from private immutable mappings in 64 KiB chunks.
//! The stream copies each chunk into an owned HTTP buffer so response lifetime
//! is independent of mapping borrows.
//!
//! # Security
//!
//! This router performs no request authentication, tenant authorization, rate
//! limiting, or TLS termination. Bind it to loopback or a trusted internal
//! network and add those controls in the surrounding application before
//! exposing it to untrusted clients.

use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr as _};
use std::{
    io,
    sync::{Mutex, PoisonError},
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{
            ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG, RANGE,
        },
    },
    response::{IntoResponse, Response},
    routing::get,
};
use burn::tensor::backend::Backend;
use bytes::Bytes;
use camino::Utf8PathBuf;
use futures::stream;
use serde::{Deserialize, Serialize};

use crate::salt::{
    ArtifactManifest, ArtifactRole, ContentHash, ExternalGateVerifierSet, FileActivationStore,
    GateId, GateVerifier, LoadedGeneration,
};

const STREAM_CHUNK_BYTES: usize = 64 * 1024;

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

/// Filesystem and trust roots for a verified Atlas API instance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AtlasApiConfiguration {
    /// UTF-8 filesystem root containing activation and generation records.
    pub root: String,
    /// Verifier for the authority signing every release gate document.
    pub release_verifier: VerifierConfiguration,
    /// Complete, unique verifier set for independently owned external gates.
    pub external_verifiers: Vec<ExternalVerifierConfiguration>,
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
}

impl<B: Backend> AtlasApiState<B> {
    /// Validates trust pins and reopens the active generation.
    ///
    /// # Errors
    ///
    /// Returns an error when a key is malformed or the complete external gate
    /// verifier set is not pinned. An active generation also fails startup when
    /// its release evidence, manifest, artifact, or checkpoint cannot be
    /// reverified.
    pub fn new(
        configuration: AtlasApiConfiguration,
        device: B::Device,
    ) -> Result<Self, AtlasApiConfigurationError> {
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
        Ok(Self {
            store,
            cached: Mutex::new(cached),
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
        cached.clone_from(&loaded);
        drop(cached);
        Ok(loaded)
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
            "/v1/atlas/current/artifacts/{*relative_path}",
            get(artifact::<B>),
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
        None,
    )
}

async fn artifact<B>(
    State(state): State<Arc<AtlasApiState<B>>>,
    Path(relative_path): Path<String>,
    headers: HeaderMap,
) -> Result<Response, HttpError>
where
    B: Backend + Send + Sync + 'static,
    B::Device: Send + Sync,
{
    validate_relative_path(&relative_path)?;
    let generation = current_generation(state).await?;
    let artifact = generation
        .manifest()
        .artifacts
        .iter()
        .find(|artifact| artifact.relative_path == relative_path)
        .ok_or_else(|| HttpError::not_found("atlas artifact does not exist"))?;
    let length =
        usize::try_from(artifact.byte_length).map_err(|error| internal_error(error.to_string()))?;
    let role = artifact.role;
    let content_hash = artifact.content_hash;
    let selected = parse_range(headers.get(RANGE), length)?;
    let (status, start, end, content_range) =
        selected.map_or((StatusCode::OK, 0, length, None), |selected| {
            (
                StatusCode::PARTIAL_CONTENT,
                selected.start,
                selected.end,
                Some(format!(
                    "bytes {}-{}/{}",
                    selected.start,
                    selected.end.saturating_sub(1),
                    length
                )),
            )
        });
    let selected_length = end.saturating_sub(start);
    let body = artifact_body(generation, Arc::<str>::from(relative_path), start, end);
    response(
        status,
        body,
        content_type(role),
        selected_length,
        Some(content_hash.to_string()),
        content_range,
    )
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

fn artifact_body<B: Backend + 'static>(
    generation: Arc<LoadedGeneration<B>>,
    relative_path: Arc<str>,
    start: usize,
    end: usize,
) -> Body {
    let chunks = stream::unfold(
        (generation, relative_path, start, end),
        |(generation, relative_path, cursor, end)| async move {
            if cursor >= end {
                return None;
            }
            let next = cursor.saturating_add(STREAM_CHUNK_BYTES).min(end);
            let result = generation
                .artifact_bytes(&relative_path)
                .and_then(|bytes| bytes.get(cursor..next))
                .map(Bytes::copy_from_slice)
                .ok_or_else(|| io::Error::other("verified artifact stream changed shape"));
            Some((result, (generation, relative_path, next, end)))
        },
    );
    Body::from_stream(chunks)
}

fn response(
    status: StatusCode,
    body: Body,
    content_type: &'static str,
    length: usize,
    etag: Option<String>,
    content_range: Option<String>,
) -> Result<Response, HttpError> {
    let mut builder = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header(ACCEPT_RANGES, "bytes")
        .header(CACHE_CONTROL, "no-cache")
        .header(CONTENT_LENGTH, length.to_string());
    if let Some(etag) = etag {
        builder = builder.header(ETAG, format!("\"{etag}\""));
    }
    if let Some(content_range) = content_range {
        builder = builder.header(CONTENT_RANGE, content_range);
    }
    builder.body(body).map_err(internal_error)
}

#[derive(Debug, Copy, Clone)]
struct SelectedRange {
    start: usize,
    end: usize,
}

fn parse_range(
    header: Option<&HeaderValue>,
    length: usize,
) -> Result<Option<SelectedRange>, HttpError> {
    let Some(header) = header else {
        return Ok(None);
    };
    let value = header
        .to_str()
        .map_err(|error| HttpError::range(error.to_string()))?;
    let value = value
        .strip_prefix("bytes=")
        .ok_or_else(|| HttpError::range("only byte ranges are supported"))?;
    if value.contains(',') {
        return Err(HttpError::range("multiple byte ranges are not supported"));
    }
    let (start, end) = value
        .split_once('-')
        .ok_or_else(|| HttpError::range("byte range is malformed"))?;
    let selected = if start.is_empty() {
        let suffix = end
            .parse::<usize>()
            .map_err(|error| HttpError::range(error.to_string()))?;
        if suffix == 0 || length == 0 {
            return Err(HttpError::range("byte range is unsatisfiable"));
        }
        SelectedRange {
            start: length.saturating_sub(suffix),
            end: length,
        }
    } else {
        let start = start
            .parse::<usize>()
            .map_err(|error| HttpError::range(error.to_string()))?;
        if start >= length {
            return Err(HttpError::range("byte range is unsatisfiable"));
        }
        let end = if end.is_empty() {
            length
        } else {
            end.parse::<usize>()
                .map_err(|error| HttpError::range(error.to_string()))?
                .saturating_add(1)
                .min(length)
        };
        if start >= end {
            return Err(HttpError::range("byte range is unsatisfiable"));
        }
        SelectedRange { start, end }
    };
    Ok(Some(selected))
}

fn validate_relative_path(path: &str) -> Result<(), HttpError> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains('\\')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        Err(HttpError::not_found("atlas artifact path is invalid"))
    } else {
        Ok(())
    }
}

#[derive(Debug, Serialize)]
struct CurrentAtlas {
    generation: String,
    base_revision: u64,
    delta_revision: u64,
    manifest_hash: String,
    release_report_hash: String,
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
        ArtifactRole::LegacyLayout => "legacy-layout",
        ArtifactRole::LegacyIdentities => "legacy-identities",
        ArtifactRole::LegacyExportManifest => "legacy-export-manifest",
    }
}

const fn content_type(role: ArtifactRole) -> &'static str {
    match role {
        ArtifactRole::LegacyIdentities | ArtifactRole::LegacyExportManifest => "application/json",
        ArtifactRole::Representations
        | ArtifactRole::RelationClassifier
        | ArtifactRole::StrengthHead
        | ArtifactRole::SemanticGraph
        | ArtifactRole::RelationIndexes
        | ArtifactRole::LandmarkSkeleton
        | ArtifactRole::LandmarkReferencePersistence
        | ArtifactRole::ProjectorCheckpoint
        | ArtifactRole::CanonicalBase
        | ArtifactRole::CanonicalAnalytics
        | ArtifactRole::LegacyLayout => "application/octet-stream",
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
    fn not_found(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            detail: detail.into(),
        }
    }

    fn range(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::RANGE_NOT_SATISFIABLE,
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
mod tests {
    use core::fmt::Write as _;

    use axum::{body::Body, http::Request};
    #[expect(
        deprecated,
        reason = "Candle CPU remains the pinned M0 checkpoint-serving backend"
    )]
    use burn::backend::{Candle, candle::CandleDevice};
    use ed25519_dalek::SigningKey;
    use tempfile::tempdir;
    use tower::ServiceExt as _;

    use super::*;

    #[test]
    fn byte_ranges_follow_single_range_semantics() {
        let header = HeaderValue::from_static("bytes=2-5");
        assert!(matches!(
            parse_range(Some(&header), 10),
            Ok(Some(SelectedRange { start: 2, end: 6 }))
        ));
        let suffix = HeaderValue::from_static("bytes=-3");
        assert!(matches!(
            parse_range(Some(&suffix), 10),
            Ok(Some(SelectedRange { start: 7, end: 10 }))
        ));
    }

    #[test]
    fn artifact_paths_reject_traversal() {
        assert!(validate_relative_path("canonical/base.salt").is_ok());
        assert!(validate_relative_path("../active.json").is_err());
        assert!(validate_relative_path("canonical//base.salt").is_err());
    }

    #[tokio::test]
    #[expect(
        deprecated,
        reason = "Candle CPU remains the pinned M0 checkpoint-serving backend"
    )]
    async fn modern_router_serves_health_and_an_empty_current_state() {
        let root = tempdir().expect("temporary API root should create");
        let gates = [
            ExternalGate::Representation,
            ExternalGate::SemanticFidelity,
            ExternalGate::RelationPolicy,
            ExternalGate::MergeTreePersistence,
            ExternalGate::SubgroupBehavior,
            ExternalGate::AuthorizationNoninterference,
            ExternalGate::SecurityApproval,
            ExternalGate::CompanionPin,
        ];
        let state = AtlasApiState::<Candle>::new(
            AtlasApiConfiguration {
                root: root.path().to_string_lossy().into_owned(),
                release_verifier: VerifierConfiguration {
                    authority: "release".to_owned(),
                    public_key: public_key(1),
                },
                external_verifiers: gates
                    .into_iter()
                    .enumerate()
                    .map(|(index, gate)| ExternalVerifierConfiguration {
                        gate,
                        authority: format!("external-{index}"),
                        public_key: public_key(
                            u8::try_from(index + 2).expect("fixture seed should fit u8"),
                        ),
                    })
                    .collect(),
            },
            CandleDevice::Cpu,
        )
        .expect("fixture trust roots should validate");
        let application = router(state);

        let health = application
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/healthz")
                    .body(Body::empty())
                    .expect("health request should build"),
            )
            .await
            .expect("health request should complete");
        assert_eq!(health.status(), StatusCode::NO_CONTENT);

        let current = application
            .oneshot(
                Request::builder()
                    .uri("/v1/atlas/current")
                    .body(Body::empty())
                    .expect("current request should build"),
            )
            .await
            .expect("current request should complete");
        assert_eq!(current.status(), StatusCode::NOT_FOUND);
    }

    fn public_key(seed: u8) -> String {
        SigningKey::from_bytes(&[seed; 32])
            .verifying_key()
            .to_bytes()
            .into_iter()
            .fold(String::with_capacity(64), |mut encoded, byte| {
                write!(encoded, "{byte:02x}").expect("writing to a String should succeed");
                encoded
            })
    }
}
