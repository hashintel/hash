//! One request's visibility, resolved from the actor it names.
//!
//! Every corpus-bearing response is masked by a [`VisibilityProof`], and [`Visibility`] is that
//! proof for one request: the scope of the actor the request names, resolved through the store and
//! held in the visibility cache for its reuse window.
//!
//! The actor is named by the `X-Authenticated-User-Actor-Id` header, the trust boundary the graph's
//! REST API stands on: the gateway authenticates the session and states the actor, and this process
//! takes the header as that statement. A request carrying no such header is malformed and answers
//! 400; a request whose scope the store cannot resolve answers 503. Both refusals land before any
//! assembly reads the request.

use alloc::sync::Arc;
use core::str::FromStr as _;
use std::time::Instant;

use aide::OperationInput;
use axum::{extract::FromRequestParts, http::request::Parts};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::{PostgresStorePool, error::StoreError};
use hash_graph_store::pool::StorePool as _;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{
    AppState,
    problem::{Problem, missing_actor, visibility_unavailable},
};
use crate::serve::{
    ProofError, Resolution, ViewCensus, VisibilityCache, VisibilityKey, VisibilityLimits,
    VisibilityProof, visibility_proof,
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
        let actor = actor(parts)?;
        let key = VisibilityKey {
            generation: state.atlas.generation(),
            actor,
            filter: None,
        };

        let pool = Arc::clone(&state.authority.pool);
        let atlas = Arc::clone(&state.atlas);
        let entry = state
            .authority
            .cache
            .resolve(key, Instant::now(), move || async move {
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

                // The census rides the resolution, not the request: one pass over the base column
                // per scope, shared by every root tile it answers.
                let proof =
                    visibility_proof(actor, None, &protection.filter_protection, &store, &atlas)
                        .await?;

                Ok::<_, ProofError>(Resolution::of(&atlas, proof))
            })
            .await
            .map_err(|error| visibility_unavailable(&error))?;

        Ok(Self {
            proof: entry.proof,
            census: entry.census,
        })
    }
}

impl OperationInput for Visibility {}

/// Reads the actor the gateway authenticated.
///
/// Absent, non-ASCII and unparsable headers answer one problem: the request is malformed, and the
/// detail names which of the three it was.
fn actor(parts: &Parts) -> Result<AuthenticatedActor, Problem<'static>> {
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
