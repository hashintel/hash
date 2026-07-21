//! The atlas read API: Surface v1 routes over one opened generation.
//!
//! Four routes serve the demo bootstrap: the mutable `current`
//! pointer, the immutable per-generation manifest, the tile endpoint
//! answering `SALTILET` bytes, and the edges endpoint answering
//! `SALTILEE` bytes. The generation is pinned at startup; rotation
//! reload is the serving track's step 11, not this shell.
//!
//! Each route lives in its own module - handler, path parameters,
//! and OpenAPI documentation together - so a new endpoint is a new
//! module plus one line in [`router`]'s table. The shared pieces are
//! [`problem`] (the RFC 9457 error surface), [`saltile`] (binary
//! envelope responses and their assembly worker), and [`reference`]
//! (the OpenAPI document and its reference page).
//!
//! Response assembly is synchronous and CPU-bound, so handlers
//! schedule it on a rayon worker behind `catch_unwind` and never
//! inline on the async runtime. Errors are RFC 9457 problem
//! documents; binary responses ship `Cache-Control: private,
//! no-store` because the client's application-layer cache is the
//! cache.

use alloc::sync::Arc;

use aide::{
    axum::{
        ApiRouter,
        routing::{get_with, post_with},
    },
    openapi::{Info, OpenApi},
};
use axum::{Extension, Router, body::Bytes};

use crate::serve::{Atlas, PostgresDetails, ServeCaps};

mod current;
mod edges;
mod locate;
mod manifest;
mod problem;
mod reference;
mod saltile;
mod tile;
mod translate;

/// The OpenAPI document's top-level description.
const API_DESCRIPTION: &str = "The read API over one published atlas generation: a zoomable map \
                               of the HASH graph, served as binary `SALTILE` envelopes.

## Bootstrap

1. `GET /v1/atlas/current` - the generation this process serves; the one mutable read.
2. `GET /v1/atlas/generation/{generation}/manifest` - immutable per-generation configuration: the \
                               served variants, the per-request caps (`limits`), and the bucket \
                               schedule the tile grid follows.
3. `POST` the tile and edges routes for binary geometry.

## Conventions

- Query-bearing endpoints are `POST` with a JSON body; the body is part of the client's cache key.
- Binary responses ship `Cache-Control: private, no-store`: the client's application-layer cache \
                               is the cache, keyed on (generation, route, canonical body).
- Every error is an RFC 9457 problem document (`application/problem+json`) whose `type` member \
                               carries a stable slug. An `unknown-generation` problem always \
                               means: re-bootstrap through `current`.
- The envelope byte layout is pinned in the atlas crate's `SPEC-ADDENDUM-WIRE.md`; the TypeScript \
                               decoder lives in the frontend's `NetworkGraph/atlas` module.";

/// The shared route state: the pinned generation, the caps the
/// handlers enforce and the manifest publishes, and the store
/// connection detail hydration reads through.
#[derive(Clone)]
struct AppState {
    atlas: Arc<Atlas>,
    caps: ServeCaps,
    details: Arc<PostgresDetails>,
}

/// Builds the read API router over one opened generation, with the
/// OpenAPI document generated at startup and served beside the API.
///
/// # Panics
///
/// Panics when the OpenAPI document fails to serialize, which the
/// statically declared route table rules out.
pub fn router(atlas: Arc<Atlas>, caps: ServeCaps, details: Arc<PostgresDetails>) -> Router {
    let state = AppState {
        atlas,
        caps,
        details,
    };

    // Responses are declared explicitly per operation; the
    // handler-signature inference would double-declare them.
    aide::generate::infer_responses(false);

    let mut api = OpenApi {
        info: Info {
            title: "HASH Atlas API".to_owned(),
            description: Some(API_DESCRIPTION.to_owned()),
            version: env!("CARGO_PKG_VERSION").to_owned(),
            ..Info::default()
        },
        ..OpenApi::default()
    };

    let router = ApiRouter::new()
        .api_route(
            "/v1/atlas/current",
            get_with(current::handler, current::document),
        )
        .api_route(
            "/v1/atlas/generation/{generation}/manifest",
            get_with(manifest::handler, manifest::document),
        )
        .api_route(
            "/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}",
            post_with(tile::handler, tile::document),
        )
        .api_route(
            "/v1/atlas/edges/{generation}/{variant}",
            post_with(edges::handler, edges::document),
        )
        .api_route(
            "/v1/atlas/locate/{generation}/{variant}",
            post_with(locate::handler, locate::document),
        )
        .api_route(
            "/v1/atlas/translate/{generation}/{variant}",
            post_with(translate::handler, translate::document),
        )
        .route(
            "/v1/atlas/openapi.json",
            axum::routing::get(reference::serve_document),
        )
        .route("/v1/atlas/openapi", axum::routing::get(reference::page()))
        .with_state(state)
        .finish_api(&mut api);

    // The generation is pinned at startup, so the document is too:
    // rendered once, served as bytes.
    let document =
        Bytes::from(serde_json::to_string(&api).expect("the OpenAPI document serializes"));
    router.layer(Extension(document))
}
