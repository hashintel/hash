//! The atlas read API, serving Surface v1 routes over one opened generation.
//!
//! The routes are the mutable `current` pointer, the per-generation manifest that also states one
//! caller's resolved delivery schedule, the tile, edges, and locate endpoints answering binary
//! `SALTILE` envelopes, and the JSON translate endpoint. The server pins the generation at startup
//! and serves it until restart.
//!
//! Each route lives in its own module (handler, its own path parameters, and OpenAPI documentation
//! together), so a new endpoint is a new module plus one line in [`router`]'s table. The shared
//! pieces are [`problem`] (the RFC 9457 error surface), [`extract`] (request extraction whose
//! rejections are problem documents, and the generation/variant path shape four routes address a
//! layout by), [`clause`] (the OpenAPI responses more than one route states identically),
//! [`saltile`] (binary envelope responses and their assembly worker), [`headers`] (the
//! Cache-Control postures, sent and documented from one constant), and [`mod@openapi`] (the
//! OpenAPI document and its reference page).
//!
//! Response assembly is synchronous and CPU-bound, so handlers schedule it on a rayon worker behind
//! `catch_unwind` and never inline on the async runtime. Every error a route answers is an RFC 9457
//! problem document - handler failures directly, extraction failures through [`extract`]'s
//! wrappers; only the router's own rejections (an unmatched route, a wrong method) stay plain.
//! Binary responses send `Cache-Control: private, no-store` because the client's application-layer
//! cache is the cache.

use alloc::sync::Arc;

use aide::{
    axum::{
        ApiRouter,
        routing::{get_with, post_with},
    },
    openapi::{
        ApiKeyLocation, Components, Info, OpenApi, ReferenceOr, SecurityRequirement, SecurityScheme,
    },
};
use axum::{Extension, Router, extract::FromRef};
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use rand::rngs::SysRng;

use self::{openapi::OpenApiDocument, visibility::Authority};
use crate::serve::{
    Atlas, DeltaCell, DeltaEpoch, DensityBand, DensityPolicy, GraphDatabaseClient, ServeLimits,
    VisibilityLimits, authorization::TokenAuthority, hydrate::CachedTypeUrlResolver,
};

mod authorization;
mod clause;
mod current;
mod edges;
mod extract;
mod headers;
mod locate;
mod manifest;
mod openapi;
mod problem;
mod saltile;
mod tile;
mod translate;
mod visibility;

/// The OpenAPI document's top-level description.
const API_DESCRIPTION: &str =
    "The read API over one published atlas generation: a zoomable map of the HASH graph, served \
     as binary `SALTILE` envelopes.

## Bootstrap

1. `GET /v1/atlas/current` - the generation this process serves; the one mutable read.
2. `POST /v1/atlas/generation/{generation}/manifest` - the per-generation bootstrap: the served \
     variants, the published serving limits (`limits`), the bucket schedule the tile grid follows \
     (`bucketSchedule`), and the delivery schedule this caller's own responses follow \
     (`scopeSchedule`, whose `k` a restricted decoder adds to the bucket span to attribute runs \
     to buckets). Every block except `scopeSchedule` is immutable for the generation's lifetime. \
     Every successful response issues the authority token the data routes require, and the body \
     states the view the request wants: a filter document, or nothing for the unfiltered view.
3. `POST` the tile, edges, and locate routes for binary geometry; `POST` translate for JSON \
     identity resolution.

## Conventions

- Query-bearing endpoints are `POST` with a JSON body; the body is part of the client's cache key.
- Binary responses ship `Cache-Control: private, no-store`: the client's application-layer cache \
     is the cache, keyed on (authorization context, generation, route, canonical body). Tile \
     labels and icons come from the generation, with a placed arrival's label from its \
     placement's captured display. Edges labels come from the display the server captured at the \
     link's currently served edition, and from the generation's payload for a fitted link it \
     holds no capture for. Edges type references and locate type and property values read \
     request-time store state. Do not retain a detailed response as an immutable generation tile. \
     Cache geometry and refetch edges and locate detail where request-time state matters.
- Every error is an RFC 9457 problem document (`application/problem+json`) whose `type` member is \
     a stable root-relative URI (`/problems/atlas/<slug>`): an absent required body answers \
     `missing-body`, a body that is not the operation's JSON shape answers `invalid-body`, an \
     unparsable tile address answers `invalid-coordinate`, and a malformed generation id answers \
     `invalid-generation`. An `unknown-generation` problem always means: re-read `current` and \
     retry.
- Authorization answers three problems. A caller the authentication middleware cannot resolve \
     answers `unauthenticated`, carrying the middleware's own status. An absent, malformed, \
     foreign, or stale `Atlas-Authority` token answers `unauthorized` (401), one uniform refusal \
     whose remedy is a fresh manifest request. A scope this process cannot resolve answers \
     `visibility-unavailable` (503).
- The binary envelope's normative contract is the `Atlas wire format` section below - this \
     document is self-contained; a decoder implements against it.";

/// The wire-format contract, exported verbatim from `docs/wire.md`.
///
/// The binary envelope is observable from the outside, so the OpenAPI document includes its
/// normative text rather than pointing at a repository file.
const WIRE_FORMAT: &str = include_str!("../../docs/wire.md");

/// The credential schemes the deployment authenticates, by document name.
///
/// The authentication middleware resolves credentials ahead of this router and cannot write into
/// this document, so this array is the document's statement of what authenticates, and [`router`]
/// carries each scheme into the root security requirements.
// The Kratos and Cloudflare names mirror `hash-graph-authentication`'s provider constants;
// depending on that crate for three strings would pull its Kratos and JWT machinery into this one.
#[expect(
    clippy::default_trait_access,
    reason = "we do not want to pull in a dependency just to pin its default"
)]
fn credential_schemes() -> [(&'static str, SecurityScheme); 4] {
    [
        (
            "sessionToken",
            SecurityScheme::ApiKey {
                location: ApiKeyLocation::Header,
                name: "X-Session-Token".to_owned(),
                description: Some("the caller's Kratos session token".to_owned()),
                extensions: Default::default(),
            },
        ),
        (
            "sessionCookie",
            SecurityScheme::ApiKey {
                location: ApiKeyLocation::Cookie,
                name: "ory_kratos_session".to_owned(),
                description: Some("the caller's Kratos browser session".to_owned()),
                extensions: Default::default(),
            },
        ),
        (
            "cloudflareAccess",
            SecurityScheme::ApiKey {
                location: ApiKeyLocation::Header,
                name: "Cf-Access-Jwt-Assertion".to_owned(),
                description: Some(
                    "the Cloudflare Access JWT, on deployments behind Cloudflare Access".to_owned(),
                ),
                extensions: Default::default(),
            },
        ),
        (
            "serviceDelegation",
            SecurityScheme::Http {
                scheme: SERVICE_AUTH_SCHEME.to_owned(),
                bearer_format: None,
                description: Some(format!(
                    "the shared service secret, with the delegated actor beside it in the \
                     `{ACTOR_ID_HEADER}` header"
                )),
                extensions: Default::default(),
            },
        ),
    ]
}

/// The shared route state.
///
/// The pinned generation, the limits the handlers enforce and the manifest publishes, the store
/// connection detail hydration reads through, the authority every assembly path masks by - read per
/// request through [`visibility::Visibility`] - the delta cell every request captures its
/// withdrawal snapshot from at ingress, and the token authority behind the manifest's tokens,
/// whose sealed scope is the identity every data route resolves its visibility under.
#[derive(Clone)]
struct AppState<R> {
    atlas: Arc<Atlas>,
    limits: ServeLimits,
    visibility: VisibilityLimits,
    tokens: Arc<TokenAuthority<R>>,
    /// The published delta snapshot cell, empty until the consumer's first publication.
    ///
    /// Each request loads it once at ingress and reads that one snapshot at every admission in
    /// its answer. A serve without a consumer holds the empty cell for its lifetime, and every
    /// load answers [`None`] at no cost.
    delta: Arc<DeltaCell>,
    /// The delivery-cut policy a fresh bootstrap resolves `k` under.
    ///
    /// [`None`] for the schedules no offset deepens, where every scope serves the recorded cut.
    density: Option<DensityPolicy>,
    authority: Authority,
    remote: Arc<GraphDatabaseClient>,
    /// The type-URL resolution the edges trailer reads through, cached for the process's life.
    type_urls: Arc<CachedTypeUrlResolver<Arc<GraphDatabaseClient>>>,
}

impl<R> FromRef<AppState<R>> for Arc<TokenAuthority<R>> {
    fn from_ref(input: &AppState<R>) -> Self {
        Self::clone(&input.tokens)
    }
}

/// Builds the read API router over one opened generation.
///
/// With the OpenAPI document generated at startup and served beside the API.
///
/// A visibility proof scopes every corpus-bearing response the router serves, and every request
/// answers under the scope of the actor it names: `pool` is the store every read goes through and
/// `visibility` the window the router reuses a resolved scope for. The router serves no request
/// without an actor, and serves no actor another's rows. The authority token's key derives from the
/// secret that opened the atlas, and every token seals `epoch`, the serving process's delta epoch,
/// so a restarted delta register refuses the tokens issued beside its predecessor. The manifest
/// issues one per fetch, and the data routes refuse without one.
///
/// # Panics
///
/// This panics when the OpenAPI document fails to serialize, which the statically declared route
/// table rules out.
pub(crate) fn router(
    atlas: Arc<Atlas>,
    limits: ServeLimits,
    details: Arc<GraphDatabaseClient>,
    pool: Arc<PostgresStorePool>,
    visibility: VisibilityLimits,
    epoch: Option<DeltaEpoch>,
    delta: Arc<DeltaCell>,
) -> Router {
    let state = AppState {
        tokens: Arc::new(TokenAuthority::new(
            atlas.generation(),
            atlas.wire_secret().hex_bytes(),
            visibility.hard,
            epoch,
            SysRng,
        )),
        density: atlas.density_policy(DensityBand::default()),
        atlas,
        limits,
        visibility,
        authority: Authority::new(pool, visibility),
        type_urls: Arc::new(CachedTypeUrlResolver::new(Arc::clone(&details))),
        remote: details,
        delta,
    };

    // To increase the accuracy of response inference we manually declare
    // responses for each operation.
    aide::generate::infer_responses(false);

    let mut components = Components::default();
    let mut security = Vec::new();
    for (name, scheme) in credential_schemes() {
        security.push(SecurityRequirement::from_iter([(
            name.to_owned(),
            Vec::new(),
        )]));
        components
            .security_schemes
            .insert(name.to_owned(), ReferenceOr::Item(scheme));
    }

    let mut api = OpenApi {
        info: Info {
            title: "HASH Atlas API".to_owned(),
            description: Some(format!("{API_DESCRIPTION}\n\n---\n\n{WIRE_FORMAT}")),
            version: env!("CARGO_PKG_VERSION").to_owned(),
            ..Info::default()
        },
        security,
        components: Some(components),
        ..OpenApi::default()
    };

    let router = ApiRouter::new()
        .api_route(
            "/v1/atlas/current",
            get_with(current::handler, current::document),
        )
        .api_route(
            "/v1/atlas/generation/{generation}/manifest",
            post_with(manifest::handler, manifest::document),
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
        .route("/v1/atlas/openapi.json", axum::routing::get(openapi::json))
        .route("/v1/atlas/openapi", axum::routing::get(openapi::html))
        .with_state(state)
        .finish_api(&mut api);

    router.layer(Extension(OpenApiDocument::new(&api)))
}
