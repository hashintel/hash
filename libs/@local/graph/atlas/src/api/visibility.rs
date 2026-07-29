//! The authority a request answers under, and the extractor that resolves it.
//!
//! Every corpus-bearing response is masked by a [`VisibilityProof`], and [`Visibility`] is where a
//! handler receives the one its request answers under: the scope of the actor the request names,
//! resolved from the store and held in the visibility cache for its reuse window. Every response is
//! somebody's scope.
//!
//! The actor comes from the `X-Authenticated-User-Actor-Id` header, the same trust boundary the
//! graph's REST API stands on: the gateway authenticates the session and states the actor, and this
//! process believes the header. A request that omits it under session authority is refused rather
//! than served anonymously - the missing-header case is a client defect here, exactly as it is
//! there, because no atlas surface is public.

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
    ProofError, VisibilityCache, VisibilityKey, VisibilityLimits, VisibilityProof, visibility_proof,
};

/// The header naming the authenticated actor, as the graph's REST API names it.
const ACTOR_HEADER: &str = "X-Authenticated-User-Actor-Id";

/// Where a request's visibility comes from: the store, through the cache.
///
/// The store a scope resolves against, and the scopes already resolved.
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

/// One request's visibility: the proof its assembly masks by.
#[derive(Debug, Clone)]
pub(super) struct Visibility {
    /// The rows the request may see.
    pub proof: Arc<VisibilityProof>,
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

                visibility_proof(actor, None, &protection.filter_protection, &store, &atlas).await
            })
            .await
            .map_err(|error| visibility_unavailable(&error))?;

        Ok(Self { proof: entry.proof })
    }
}

impl OperationInput for Visibility {}

/// Reads the actor the gateway authenticated.
///
/// Absent, non-ASCII, and unparsable answer alike: the header is the request's own defect, and its
/// content is echoed no further than the parse failure.
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
