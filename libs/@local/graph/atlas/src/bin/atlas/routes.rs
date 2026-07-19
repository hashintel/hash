//! The atlas read API: Surface v1 routes over one opened generation.
//!
//! Three routes serve the demo bootstrap: the mutable `current`
//! pointer, the immutable per-generation manifest, and the tile
//! endpoint answering `SALTILET` bytes. The generation is pinned at
//! startup; rotation reload is the serving track's step 11, not this
//! shell.
//!
//! Tile assembly is synchronous and CPU-bound, so handlers schedule it
//! on a rayon worker behind `catch_unwind` and never inline on the
//! async runtime. Errors are RFC 9457 problem documents; binary
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
    Atlas, GenerationId, ManifestLimits, TileCoordinate, TileError, TileQuery, TileRequest,
    VARIANTS,
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
    if !VARIANTS.contains(&variant.as_str()) {
        return problem(
            StatusCode::NOT_FOUND,
            "unknown-variant",
            &format!("variant {variant} is not served; the manifest lists {VARIANTS:?}"),
        );
    }

    let request = TileRequest {
        coordinate: TileCoordinate { z, x, y },
        query: query.map_or_else(TileQuery::default, |Json(query)| query),
    };

    // CPU-bound assembly rides a rayon worker, never a runtime thread;
    // a panic is a producer bug surfacing as 500, not an unwind across
    // the runtime.
    let atlas = Arc::clone(&state.atlas);
    let (sender, receiver) = tokio::sync::oneshot::channel();
    rayon::spawn(move || {
        let result =
            std::panic::catch_unwind(core::panic::AssertUnwindSafe(|| atlas.tile(&request)));
        let _: Result<(), _> = sender.send(result);
    });

    let result = match receiver.await {
        Ok(result) => result,
        Err(_closed) => {
            return problem(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal",
                "the tile worker vanished",
            );
        }
    };

    match result {
        Ok(Ok(bytes)) => (
            [
                (header::CONTENT_TYPE, SALTILE),
                (header::CACHE_CONTROL, "private, no-store"),
            ],
            bytes,
        )
            .into_response(),
        Ok(Err(error @ (TileError::Depth { .. } | TileError::Grid { .. }))) => problem(
            StatusCode::BAD_REQUEST,
            "invalid-coordinate",
            &error.to_string(),
        ),
        Ok(Err(error @ TileError::Unsupported(_))) => problem(
            StatusCode::NOT_IMPLEMENTED,
            "unsupported-feature",
            &error.to_string(),
        ),
        Err(panic) => {
            let detail = panic
                .downcast_ref::<&str>()
                .map(|&message| message.to_owned())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "the tile assembly panicked".to_owned());
            problem(StatusCode::INTERNAL_SERVER_ERROR, "internal", &detail)
        }
    }
}
