//! Resolution of actors against the principal store.

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::{PrincipalStore, error::DetermineActorError};
use hash_graph_store::pool::StorePool;
use type_system::principal::actor::{ActorEntityUuid, ActorId};

/// Resolves an [`ActorEntityUuid`] to the [`ActorId`] stored in the principal store.
///
/// Indirection over [`PrincipalStore::determine_actor`].
pub trait ResolveActor: Send + Sync {
    /// Returns the [`ActorId`] for the given actor entity UUID, or `None` for the public actor.
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the actor does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`ActorNotFound`]: DetermineActorError::ActorNotFound
    /// [`StoreError`]: DetermineActorError::StoreError
    fn resolve_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> impl Future<Output = Result<Option<ActorId>, Report<DetermineActorError>>> + Send;
}

/// [`ResolveActor`] implementation backed by a [`StorePool`].
pub struct StorePoolActorResolver<S> {
    pool: Arc<S>,
}

impl<S> StorePoolActorResolver<S> {
    #[must_use]
    pub const fn new(pool: Arc<S>) -> Self {
        Self { pool }
    }
}

impl<S> ResolveActor for StorePoolActorResolver<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    async fn resolve_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> Result<Option<ActorId>, Report<DetermineActorError>> {
        self.pool
            .acquire(None)
            .await
            .change_context(DetermineActorError::StoreError)?
            .determine_actor(actor_entity_uuid)
            .await
    }
}
