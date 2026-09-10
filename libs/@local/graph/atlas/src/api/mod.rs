//! The Atlas read API over present and retained generations.
//!
//! Each request captures its generation publication before visibility resolution. Response assembly
//! runs on Rayon workers, with failures rendered as RFC 9457 problem documents. An empty or closed
//! generation registry answers 503.

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
use axum::{Extension, Router};
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use rand::rngs::SysRng;

use self::openapi::OpenApiDocument;
use crate::serve2::{
    authorization::authority::Authority,
    document::DocumentLimits,
    hydrate::{CachedTypeUrlResolver, GraphDatabaseClient},
    runtime::registry::UniverseRegistry,
    visibility::{cache::VisibilityLimits, resolver::ScopeResolver},
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
pub(crate) mod problem;
mod saltile;
mod tile;
mod translate;
mod visibility;

/// The OpenAPI document's top-level description.
const API_DESCRIPTION: &str =
    "The read API over one published atlas generation: a zoomable map of the HASH graph, served \
     as binary `SALTILE` envelopes.

## Bootstrap

1. `GET /v1/atlas/current` - the currently promoted generation. Requests answer 503 until initial \
     publication. Previously promoted generations remain requestable during their retention \
     window.
2. `POST /v1/atlas/generation/{generation}/manifest` - the per-generation bootstrap: the served \
     variants, the published serving limits (`limits`), the bucket schedule the tile grid follows \
     (`bucketSchedule`), and the delivery schedule this caller's own responses follow \
     (`scopeSchedule`, whose `k` a restricted decoder adds to the bucket span to attribute runs \
     to buckets). The bucket schedule is generation-local, while limits reflect this deployment. \
     Every successful response issues the authority token the data routes require, and the body \
     states the view the request wants: a filter document, or nothing for the unfiltered view.
3. `POST` the tile, edges, and locate routes for binary geometry; `POST` translate for JSON \
     identity resolution.

## Conventions

- Query-bearing endpoints are `POST` with a JSON body; the body is part of the client's cache key.
- Binary responses ship `Cache-Control: private, no-store`: the client's application-layer cache \
     is the cache, keyed on (authorization context, generation, route, canonical body). Geometry, \
     labels and icons use the publication captured for the request. Edges type references and \
     locate type and property values read request-time store state. Do not retain a detailed \
     response as an immutable generation tile. Cache geometry and refetch edges and locate detail \
     where request-time state matters.
- Every error is an RFC 9457 problem document (`application/problem+json`) whose `type` member is \
     a stable root-relative URI (`/problems/atlas/<slug>`): an absent required body answers \
     `missing-body`, a body that is not the operation's JSON shape answers `invalid-body`, an \
     unparsable tile address answers `invalid-coordinate`, and a malformed generation id answers \
     `invalid-generation`. An `unknown-generation` problem always means: re-read `current` and \
     retry.
- Authorization answers three problems. A caller the authentication middleware cannot resolve \
     answers `unauthenticated`, carrying the middleware's own status. An absent, malformed, \
     foreign, or stale `Atlas-Authority` token answers `unauthorized` (401), one uniform refusal \
     whose remedy is a fresh manifest request. A scope this process cannot resolve, or a request \
     made before any generation is ready, answers `visibility-unavailable` (503).
- The binary envelope's normative contract is the `Atlas wire format` section below - this \
     document is self-contained; a decoder implements against it.";

/// The binary envelope contract included in the OpenAPI document.
const WIRE_FORMAT: &str = include_str!("../../docs/wire.md");

/// Credential schemes declared in the OpenAPI root.
// The Kratos and Cloudflare names mirror `hash-graph-authentication`'s provider constants;
// depending on that crate for three strings would pull its Kratos and JWT machinery into this one.
#[expect(
    clippy::default_trait_access,
    reason = "naming the upstream type would add an authentication dependency"
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

struct AppState<R> {
    registry: Arc<UniverseRegistry>,
    limits: DocumentLimits,
    visibility: VisibilityLimits,
    tokens: Arc<Authority<R>>,
    scopes: Arc<ScopeResolver>,
    remote: Arc<GraphDatabaseClient>,
    type_urls: Arc<CachedTypeUrlResolver<Arc<GraphDatabaseClient>>>,
}

impl<R> Clone for AppState<R> {
    fn clone(&self) -> Self {
        Self {
            registry: Arc::clone(&self.registry),
            limits: self.limits,
            visibility: self.visibility,
            tokens: Arc::clone(&self.tokens),
            scopes: Arc::clone(&self.scopes),
            remote: Arc::clone(&self.remote),
            type_urls: Arc::clone(&self.type_urls),
        }
    }
}

/// Builds routes over the manager's request registry and one shared visibility cache.
///
/// # Panics
///
/// Panics outside a Tokio runtime or if the static OpenAPI route document cannot serialize.
pub(crate) fn router(
    registry: Arc<UniverseRegistry>,
    tokens: Arc<Authority<SysRng>>,
    limits: DocumentLimits,
    pool: Arc<PostgresStorePool>,
    visibility: VisibilityLimits,
) -> Router {
    let details = Arc::new(GraphDatabaseClient::new(
        Arc::clone(&pool),
        tokio::runtime::Handle::current(),
    ));
    let state = AppState {
        registry,
        tokens,
        limits,
        visibility,
        scopes: Arc::new(ScopeResolver::new(pool, visibility)),
        type_urls: Arc::new(CachedTypeUrlResolver::new(Arc::clone(&details))),
        remote: details,
    };

    // Each operation declares its responses explicitly.
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
        .finish_api_with(&mut api, clause::middleware);

    router.layer(Extension(OpenApiDocument::new(&api)))
}
