//! Store-backed visibility resolution for a request's captured generations.
//!
//! A shared [`VisibilityCache`] reuses retained scopes while new resolutions use the present
//! [`World`](crate::serve::world::World) and its paired
//! [`Epoch`].

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_graph_store::{filter::Filter, pool::StorePool as _};
use serde_json::value::RawValue;
use type_system::{knowledge::Entity, principal::actor::ActorId};

use super::cache::{
    CacheEntry, CacheKey, FilterDigest, PendingCacheEntry, VisibilityCache, VisibilityLimits,
};
use crate::serve::{
    delta::epoch::Epoch,
    hydrate::visibility::{VisibilityProofError, visibility_proof},
    runtime::registry::Observation,
};

#[cfg(test)]
mod tests;

/// One process's visibility cache and permission store.
pub(crate) struct ScopeResolver {
    pool: Arc<PostgresStorePool>,
    cache: VisibilityCache,
}

impl ScopeResolver {
    /// Builds a resolver over `pool`, retaining resolved scopes within `limits`.
    ///
    /// # Panics
    ///
    /// Panics when [`VisibilityLimits::hard`] exceeds 31,536,000,000 seconds (1,000 times 365
    /// days), including by a fractional second.
    pub(crate) fn new(pool: Arc<PostgresStorePool>, limits: VisibilityLimits) -> Self {
        Self {
            pool,
            cache: VisibilityCache::new(limits),
        }
    }

    /// Resolves the requested scope using the observation's admission time.
    ///
    /// `filter` is the caller-validated cache identity. A supplied `document` must come from the
    /// same submitted representation as that digest. This method neither validates the pairing nor
    /// recomputes the digest. [`RawValue`] may omit surrounding whitespace that the digest
    /// includes. `document` must be absent when `filter` is absent. Without a document, a filtered
    /// request can proceed only while its keyed cache entry still retains one.
    ///
    /// Returns [`None`] when a filtered scope has no supplied or cached document, or when the
    /// requested [delta lifetime](crate::serve::delta::DeltaId) has no reusable entry and is not
    /// the observation's present lifetime. Registry retention alone does not guarantee that a
    /// retired generation remains resolvable after its visibility entry reaches the maximum cache
    /// age. A resolution admitted while a lifetime is present may finish after promotion and
    /// remains keyed to the originally observed lifetime.
    ///
    /// # Errors
    ///
    /// Returns [`VisibilityProofError`] when the retained filter document does not parse,
    /// store-backed visibility resolution fails, or schedule construction fails.
    ///
    /// # Panics
    ///
    /// Panics if a stale matching entry claims a refresh unless the caller has entered a
    /// [`Runtime`](tokio::runtime::Runtime).
    pub(crate) async fn resolve(
        &self,
        observation: &Observation,
        actor: ActorId,
        filter: Option<FilterDigest>,
        document: Option<Arc<RawValue>>,
    ) -> Result<Option<Arc<CacheEntry>>, Report<VisibilityProofError>> {
        let key = CacheKey::new(observation.requested().epoch(), actor, filter);
        let document = match (filter, document) {
            (Some(_), None) => {
                let Some(document) = self.cache.filter_document(&key).await else {
                    return Ok(None);
                };
                Some(document)
            }
            (_, document) => document,
        };

        let pool = Arc::clone(&self.pool);
        let world = Arc::clone(observation.present().world());
        self.cache
            .resolve(
                observation.present().epoch(),
                key,
                observation.admitted_at(),
                async move |epoch: &Epoch| {
                    let store = pool
                        .acquire(None)
                        .await
                        .change_context(VisibilityProofError::Connect)?;

                    let filter = document
                        .as_deref()
                        .map(|document| serde_json::from_str::<Filter<'_, Entity>>(document.get()))
                        .transpose()
                        .change_context(VisibilityProofError::Document)?;

                    let mask = visibility_proof(
                        &world,
                        epoch,
                        actor,
                        filter.as_ref(),
                        &store.settings.filter_protection,
                        &store,
                    )
                    .await?;
                    drop(store);

                    PendingCacheEntry::new(world, epoch, mask, document)
                        .await
                        .change_context(VisibilityProofError::ComputeView)
                },
                |error: Report<VisibilityProofError>| {
                    tracing::warn!(?error, "failed to refresh the cached visibility scope");
                },
            )
            .await
    }
}
