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
    pub(crate) fn new(pool: Arc<PostgresStorePool>, limits: VisibilityLimits) -> Self {
        Self {
            pool,
            cache: VisibilityCache::new(limits),
        }
    }

    /// Resolves the requested scope using the observation's admission time.
    ///
    /// Returns [`None`] when a filtered scope has no supplied or cached document, or when the
    /// requested lifetime has no reusable entry and is no longer present. An already-admitted
    /// resolution may finish after promotion.
    ///
    /// # Errors
    ///
    /// Returns [`VisibilityProofError`] when store resolution or schedule construction fails.
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
            )
            .await
    }
}
