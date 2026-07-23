//! The atlas read API: Surface v1 routes over one opened generation.
//!
//! Six routes serve the surface: the mutable `current` pointer, the immutable per-generation
//! manifest, the tile, edges, and locate endpoints answering binary `SALTILE` envelopes, and the
//! JSON translate endpoint. The generation is pinned at startup and served until restart.
//!
//! Each route lives in its own module - handler, path parameters, and OpenAPI documentation
//! together - so a new endpoint is a new module plus one line in [`router`]'s table. The shared
//! pieces are [`problem`] (the RFC 9457 error surface), [`saltile`] (binary envelope responses and
//! their assembly worker), and [`mod@reference`] (the OpenAPI document and its reference page).
//!
//! Response assembly is synchronous and CPU-bound, so handlers schedule it on a rayon worker behind
//! `catch_unwind` and never inline on the async runtime. Handler errors are RFC 9457 problem
//! documents; requests the framework's extractors reject before a handler runs answer plain
//! rejections instead. Binary responses ship `Cache-Control: private, no-store` because the
//! client's application-layer cache is the cache.

use alloc::sync::Arc;

use aide::{
    axum::{
        ApiRouter,
        routing::{get_with, post_with},
    },
    openapi::{Info, OpenApi},
};
use axum::{Extension, Router, body::Bytes};

use crate::serve::{Atlas, GraphDatabaseClient, ServeCaps, VisibilityProof};

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
const API_DESCRIPTION: &str =
    "The read API over one published atlas generation: a zoomable map of the HASH graph, served \
     as binary `SALTILE` envelopes.

## Bootstrap

1. `GET /v1/atlas/current` - the generation this process serves; the one mutable read.
2. `GET /v1/atlas/generation/{generation}/manifest` - the immutable per-generation bootstrap \
     (configuration and snapshot provenance): the served variants, the published serving limits \
     (`limits`), and the bucket schedule the tile grid follows.
3. `POST` the tile, edges, and locate routes for binary geometry; `POST` translate for JSON \
     identity resolution.

## Conventions

- Query-bearing endpoints are `POST` with a JSON body; the body is part of the client's cache key.
- Binary responses ship `Cache-Control: private, no-store`: the client's application-layer cache \
     is the cache, keyed on (authorization context, generation, route, canonical body). Detailed \
     responses hydrate their trailers live from the store and leave the immutable cache - cache \
     the geometry surfaces, refetch detail.
- Handler errors are RFC 9457 problem documents (`application/problem+json`) whose `type` member \
     is a stable root-relative URI (`/problems/atlas/<slug>`). Requests the framework's \
     extractors reject - malformed bodies, unparsable paths - answer plain rejections instead. An \
     `unknown-generation` problem always means: re-bootstrap through `current`.
- The binary envelope's normative contract is the `Atlas wire format` section below - this \
     document is self-contained; a decoder implements against it.";

/// The wire-format contract, exported verbatim from `docs/wire.md`.
///
/// The binary envelope is observable from the outside, so its normative text ships inside the
/// OpenAPI document rather than pointing at a repository file.
const WIRE_FORMAT: &str = include_str!("../../docs/wire.md");

/// The shared route state.
///
/// The pinned generation, the caps the handlers enforce and the manifest publishes, the store
/// connection detail hydration reads through, and the visibility proof every assembly path masks
/// by.
#[derive(Clone)]
struct AppState {
    atlas: Arc<Atlas>,
    caps: ServeCaps, /* NOTE: can we please use something that isn't an abbreviation (throught
                      * the code *Caps isn't great) */
    remote: Arc<GraphDatabaseClient>,
    proof: Arc<VisibilityProof>,
}

/// Builds the read API router over one opened generation.
///
/// With the OpenAPI document generated at startup and served beside the API.
///
/// The visibility proof scopes every corpus-bearing response the router serves: the caller
/// supplies it, naming the process's authority explicitly - the graph binary deliberately
/// constructs [`VisibilityProof::full_visibility`] for operator serving.
///
/// # Panics
///
/// Panics when the OpenAPI document fails to serialize, which the statically declared route table
/// rules out.
pub fn router(
    atlas: Arc<Atlas>,
    caps: ServeCaps,
    details: Arc<GraphDatabaseClient>,
    proof: VisibilityProof, // NOTE: shouldn't the proof be per user?
) -> Router {
    let state = AppState {
        atlas,
        caps,
        remote: details,
        proof: Arc::new(proof),
    };

    // Responses are declared explicitly per operation; the
    // handler-signature inference would double-declare them.
    aide::generate::infer_responses(false);

    let mut api = OpenApi {
        info: Info {
            title: "HASH Atlas API".to_owned(),
            description: Some(format!("{API_DESCRIPTION}\n\n---\n\n{WIRE_FORMAT}")),
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
