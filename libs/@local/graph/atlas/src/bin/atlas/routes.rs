//! The atlas read API: Surface v1 routes over one opened generation.
//!
//! Four routes serve the demo bootstrap: the mutable `current`
//! pointer, the immutable per-generation manifest, the tile endpoint
//! answering `SALTILET` bytes, and the edges endpoint answering
//! `SALTILEE` bytes. The generation is pinned at startup; rotation
//! reload is the serving track's step 11, not this shell.
//!
//! Response assembly is synchronous and CPU-bound, so handlers
//! schedule it on a rayon worker behind `catch_unwind` and never
//! inline on the async runtime. Errors are RFC 9457 problem documents; binary
//! responses ship `Cache-Control: private, no-store` because the
//! client's application-layer cache is the cache.

use alloc::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse as _, Response},
    routing::{get, post},
};
use hash_graph_atlas::serve::{
    Atlas, EdgesCaps, EdgesError, EdgesRequest, GenerationId, ManifestLimits, TileCoordinate,
    TileError, TileQuery, TileRequest, VARIANTS,
};

/// The tile response media type: the `SALTILE` family, version 1.
const SALTILE: &str = "application/vnd.hash.saltile-v1";

/// The shared route state: the pinned generation and the caps the
/// manifest publishes.
#[derive(Clone)]
struct AppState {
    atlas: Arc<Atlas>,
    limits: ManifestLimits,
}

/// Builds the read API router over one opened generation.
pub(crate) fn router(atlas: Arc<Atlas>) -> Router {
    let state = AppState {
        atlas,
        limits: ManifestLimits::default(),
    };

    Router::new()
        .route("/v1/atlas/current", get(current))
        .route("/v1/atlas/generation/{generation}/manifest", get(manifest))
        .route(
            "/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}",
            post(tile),
        )
        .route("/v1/atlas/edges/{generation}/{variant}", post(edges))
        .with_state(state)
}

/// One RFC 9457 problem document; the `type` slugs are Surface v1's.
fn problem(status: StatusCode, kind: &str, detail: &str) -> Response {
    let body = serde_json::json!({
        "type": kind,
        "title": status.canonical_reason().unwrap_or("error"),
        "status": status.as_u16(),
        "detail": detail,
    });

    (
        status,
        [(header::CONTENT_TYPE, "application/problem+json")],
        body.to_string(),
    )
        .into_response()
}

/// Rejects a route whose generation echo does not name the pinned
/// generation, [`None`] when it does.
///
/// An unparsable id and a foreign id answer the same rejection: both
/// name a generation this process does not serve, and the client's
/// recovery - re-bootstrap through `current` - is identical.
fn reject_generation(state: &AppState, generation: &str) -> Option<Response> {
    let known = generation
        .parse::<GenerationId>()
        .is_ok_and(|id| id == state.atlas.generation());
    if known {
        return None;
    }

    Some(problem(
        StatusCode::NOT_FOUND,
        "unknown-generation",
        &format!("generation {generation} is not served; re-bootstrap via /v1/atlas/current"),
    ))
}

/// Rejects a route naming a variant this generation does not serve,
/// [`None`] when it serves.
fn reject_variant(variant: &str) -> Option<Response> {
    if VARIANTS.contains(&variant) {
        return None;
    }

    Some(problem(
        StatusCode::NOT_FOUND,
        "unknown-variant",
        &format!("variant {variant} is not served; the manifest lists {VARIANTS:?}"),
    ))
}

/// Runs CPU-bound response assembly on a rayon worker behind
/// `catch_unwind`, mapping a vanished worker or a panic - a producer
/// bug surfacing as 500, never an unwind across the runtime - to its
/// problem document.
async fn assemble<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, Box<Response>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    rayon::spawn(move || {
        let result = std::panic::catch_unwind(core::panic::AssertUnwindSafe(work));
        let _: Result<(), _> = sender.send(result);
    });

    match receiver.await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(panic)) => {
            let detail = panic
                .downcast_ref::<&str>()
                .map(|&message| message.to_owned())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "the response assembly panicked".to_owned());
            Err(Box::new(problem(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal",
                &detail,
            )))
        }
        Err(_closed) => Err(Box::new(problem(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "the assembly worker vanished",
        ))),
    }
}

/// Wraps envelope bytes in the binary response headers.
fn saltile(bytes: Vec<u8>) -> Response {
    (
        [
            (header::CONTENT_TYPE, SALTILE),
            (header::CACHE_CONTROL, "private, no-store"),
        ],
        bytes,
    )
        .into_response()
}

/// `GET /v1/atlas/current`: the one mutable read.
async fn current(State(state): State<AppState>) -> Response {
    (
        [(header::CACHE_CONTROL, "private, no-cache")],
        Json(serde_json::json!({ "generation": state.atlas.generation() })),
    )
        .into_response()
}

/// `GET /v1/atlas/generation/{generation}/manifest`: immutable
/// configuration-derived bootstrap data.
async fn manifest(State(state): State<AppState>, Path(generation): Path<String>) -> Response {
    if let Some(rejection) = reject_generation(&state, &generation) {
        return rejection;
    }

    (
        [(
            header::CACHE_CONTROL,
            "private, max-age=31536000, immutable",
        )],
        Json(state.atlas.manifest(state.limits)),
    )
        .into_response()
}

/// `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile
/// as `SALTILET` bytes. An absent body reads as the all-defaults
/// query.
async fn tile(
    State(state): State<AppState>,
    Path((generation, variant, z, x, y)): Path<(String, String, u8, u32, u32)>,
    query: Option<Json<TileQuery>>,
) -> Response {
    if let Some(rejection) = reject_generation(&state, &generation) {
        return rejection;
    }
    if let Some(rejection) = reject_variant(&variant) {
        return rejection;
    }

    let request = TileRequest {
        coordinate: TileCoordinate { z, x, y },
        query: query.map_or_else(TileQuery::default, |Json(query)| query),
    };

    let atlas = Arc::clone(&state.atlas);
    let result = match assemble(move || atlas.tile(&request)).await {
        Ok(result) => result,
        Err(rejection) => return *rejection,
    };

    match result {
        Ok(bytes) => saltile(bytes),
        Err(error @ (TileError::Depth { .. } | TileError::Grid { .. })) => problem(
            StatusCode::BAD_REQUEST,
            "invalid-coordinate",
            &error.to_string(),
        ),
        Err(error @ TileError::Unsupported(_)) => problem(
            StatusCode::NOT_IMPLEMENTED,
            "unsupported-feature",
            &error.to_string(),
        ),
    }
}

/// `POST /v1/atlas/edges/{generation}/{variant}`: the edges among the
/// listed tiles' delivered rows, as `SALTILEE` bytes. The tiles list
/// is the request's subject, so the body is required.
async fn edges(
    State(state): State<AppState>,
    Path((generation, variant)): Path<(String, String)>,
    body: Option<Json<EdgesRequest>>,
) -> Response {
    if let Some(rejection) = reject_generation(&state, &generation) {
        return rejection;
    }
    if let Some(rejection) = reject_variant(&variant) {
        return rejection;
    }
    let Some(Json(request)) = body else {
        return problem(
            StatusCode::BAD_REQUEST,
            "missing-body",
            "an edges request lists its tiles in a JSON body",
        );
    };

    let atlas = Arc::clone(&state.atlas);
    let result = match assemble(move || atlas.edges(&request, EdgesCaps::default())).await {
        Ok(result) => result,
        Err(rejection) => return *rejection,
    };

    match result {
        Ok(bytes) => saltile(bytes),
        Err(error @ EdgesError::Tiles { .. }) => problem(
            StatusCode::BAD_REQUEST,
            "too-many-tiles",
            &error.to_string(),
        ),
        Err(error @ (EdgesError::Depth { .. } | EdgesError::Grid { .. })) => problem(
            StatusCode::BAD_REQUEST,
            "invalid-coordinate",
            &error.to_string(),
        ),
        Err(error @ EdgesError::Unsupported(_)) => problem(
            StatusCode::NOT_IMPLEMENTED,
            "unsupported-feature",
            &error.to_string(),
        ),
    }
}
