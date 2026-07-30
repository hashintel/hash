//! One request's visibility, resolved from its admitted authority token.
//!
//! Every corpus-bearing response is masked by a [`VisibilityProof`], and [`Visibility`] is that
//! proof for one request: extraction admits the presented token through
//! [`authorization::admit`], then resolves the scope the token seals - actor and filter digest,
//! the visibility key's own fields - through the store, held in the visibility cache for its
//! reuse window. A data route that resolves visibility without an admitted token is
//! unrepresentable: the key's identity comes out of the sealed scope.
//!
//! The actor is named by the `X-Authenticated-User-Actor-Id` header, the trust boundary the graph's
//! REST API stands on: the gateway authenticates the session and states the actor, and this process
//! takes the header as that statement. A request carrying no such header is malformed and answers
//! 400; one whose token refuses answers 401; one whose scope the store cannot resolve answers 503.
//! Every refusal lands before any assembly reads the request.

use alloc::sync::Arc;
use core::{
    future::{self, Future},
    str::FromStr as _,
};
use std::time::Instant;

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{extract::FromRequestParts, http::request::Parts};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::{PostgresStorePool, error::StoreError};
use hash_graph_store::{filter::Filter, pool::StorePool as _};
use type_system::{knowledge::Entity, principal::actor::ActorEntityUuid};
use uuid::Uuid;

use super::{
    AppState, authorization, headers,
    problem::{Problem, missing_actor, unauthorized, visibility_unavailable},
};
use crate::serve::{
    FilterDigest, ProofError, Resolution, ViewCensus, VisibilityCache, VisibilityKey,
    VisibilityLimits, VisibilityProof, visibility_proof,
};

/// The header naming the authenticated actor.
///
/// The spelling is fixed by parity with the graph's REST API, which accepts this name. Headers this
/// crate introduces carry no prefix.
const ACTOR_HEADER: &str = "X-Authenticated-User-Actor-Id";

/// Where a request's visibility comes from: the store, through the cache.
///
/// The resolution state behind every [`Visibility`].
///
/// One cache and one store handle serve the whole router, so concurrent requests for one scope
/// resolve once and a returning caller is answered from the held entry.
#[derive(Clone)]
pub(super) struct Authority {
    /// The store permission resolution reads through.
    pool: Arc<PostgresStorePool>,
    /// Resolved scopes, held for their reuse window.
    cache: Arc<VisibilityCache>,
}

impl Authority {
    /// Builds the resolution state over `pool`, holding resolved scopes under `limits`.
    pub(super) fn new(pool: Arc<PostgresStorePool>, limits: VisibilityLimits) -> Self {
        Self {
            pool,
            cache: Arc::new(VisibilityCache::new(limits)),
        }
    }
}

impl core::fmt::Debug for Authority {
    /// Names the cache without the store handle, which carries no [`Debug`].
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("Authority")
            .field("cache", &self.cache)
            .finish_non_exhaustive()
    }
}

/// One request's visibility: the proof its assembly masks by, and the census resolved with it.
#[derive(Debug, Clone)]
pub(super) struct Visibility {
    /// The rows the request may see.
    pub proof: Arc<VisibilityProof>,
    /// The corpus-wide census of what [`Self::proof`] admits.
    ///
    /// Resolved once per scope with the proof, so the root tile's global metadata costs no walk on
    /// the request that reads it.
    pub census: ViewCensus,
}

impl FromRequestParts<AppState> for Visibility {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let scope = authorization::admit(parts, state)?;

        resolve(state, *scope.actor, scope.filter.digest(), None).await
    }
}

impl OperationInput for Visibility {
    /// Documents the presented token as a required request header.
    ///
    /// Extraction admits the request before resolving anything, so a route taking this extractor
    /// answers nothing without a token.
    fn operation_input(_ctx: &mut GenContext, operation: &mut openapi::Operation) {
        operation
            .parameters
            .push(openapi::ReferenceOr::Item(headers::presented_authority(
                headers::Required::Yes,
            )));
    }
}

/// Resolves one scope's visibility through the store, held in the cache for its reuse window.
///
/// The manifest resolves in its handler body, after its generation and continuity judgments; the
/// data routes resolve through [`Visibility`]'s extraction. Both land here, so one scope holds one
/// entry wherever its resolution was asked for.
///
/// A filtered resolution compiles `document`, the filter's bytes as presented, into the proof. A
/// caller holding only the digest - a data route, whose scope travels sealed - reads the held
/// entry's copy, which is what lets the soft window revalidate a filtered scope without a client
/// round trip.
///
/// # Errors
///
/// The uniform `401` problem for a filtered scope with no document held anywhere - the client
/// re-presents the document at the manifest - and the `503` visibility problem when the store
/// cannot resolve the scope.
pub(super) async fn resolve(
    state: &AppState,
    actor: ActorEntityUuid,
    filter: Option<FilterDigest>,
    document: Option<Arc<[u8]>>,
) -> Result<Visibility, Problem<'static>> {
    let key = VisibilityKey {
        generation: state.atlas.generation(),
        actor,
        filter,
    };

    let document = match (filter, document) {
        (Some(_), None) => Some(
            state
                .authority
                .cache
                .get(&key)
                .await
                .and_then(|entry| entry.filter_document())
                .ok_or_else(unauthorized)?,
        ),
        (_, document) => document,
    };

    let pool = Arc::clone(&state.authority.pool);
    let atlas = Arc::clone(&state.atlas);
    let actor = AuthenticatedActor::Uuid(actor);

    let entry = state
        .authority
        .cache
        .resolve(key, Instant::now(), async move || {
            // A connection is held for the resolution alone, and only a miss reaches here: a
            // held scope answers without touching the pool.
            let store = pool
                .acquire(None)
                .await
                .map_err(|report| ProofError::Connect(report.change_context(StoreError)))?;

            // Filter protection is the deployment's own setting, read from the store the
            // resolution runs against, so a filtered resolution carries the protection that
            // store's own reads carry.
            let protection = Arc::clone(&store.settings);

            let filter = document
                .as_deref()
                .map(serde_json::from_slice::<Filter<'_, Entity>>)
                .transpose()
                .map_err(ProofError::Document)?;

            // The census rides the resolution, not the request: one pass over the base column
            // per scope, shared by every root tile it answers.
            let proof = visibility_proof(
                actor,
                filter.as_ref(),
                &protection.filter_protection,
                &store,
                &atlas,
            )
            .await?;

            Ok::<_, ProofError>(Resolution::of(&atlas, proof, document))
        })
        .await
        .map_err(|error| visibility_unavailable(&error))?;

    Ok(Visibility {
        proof: entry.proof,
        census: entry.census,
    })
}

/// The authenticated actor one request names, without resolving its scope.
///
/// The manifest's mint and continuity reading need the actor identity alone; [`Visibility`]
/// resolves the full scope where a handler assembles a response.
#[derive(Debug, Clone, Copy)]
pub(super) struct Actor(pub AuthenticatedActor);

impl FromRequestParts<AppState> for Actor {
    type Rejection = Problem<'static>;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        future::ready(actor(parts).map(Self))
    }
}

impl OperationInput for Actor {}

/// Reads the actor the gateway authenticated.
///
/// Absent, non-ASCII and unparsable headers answer one problem: the request is malformed, and the
/// detail names which of the three it was.
pub(super) fn actor(parts: &Parts) -> Result<AuthenticatedActor, Problem<'static>> {
    let header = parts
        .headers
        .get(ACTOR_HEADER)
        .ok_or_else(|| missing_actor(format!("`{ACTOR_HEADER}` is absent")))?;

    let value = header.to_str().map_err(|_error| {
        missing_actor(format!("`{ACTOR_HEADER}` is not a visible ASCII string"))
    })?;

    let uuid = Uuid::from_str(value)
        .map_err(|error| missing_actor(format!("`{ACTOR_HEADER}` is not a uuid: {error}")))?;

    Ok(AuthenticatedActor::Uuid(ActorEntityUuid::new(uuid)))
}
