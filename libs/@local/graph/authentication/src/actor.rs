//! Resolution of actors against the principal store.

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::{PrincipalStore, error::DetermineActorError};
use hash_graph_store::pool::StorePool;
use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};

use crate::request::AuthenticationError;

/// Resolves an [`ActorEntityUuid`] to the [`ActorId`] stored in the principal store.
///
/// Indirection over [`PrincipalStore::determine_actor`].
pub trait ResolveActor: Send + Sync {
    /// Returns the [`ActorId`] for the given actor entity UUID.
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
    ) -> impl Future<Output = Result<ActorId, Report<DetermineActorError>>> + Send;
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
    ) -> Result<ActorId, Report<DetermineActorError>> {
        self.pool
            .acquire(None)
            .await
            .change_context(DetermineActorError::StoreError)?
            .determine_actor(actor_entity_uuid)
            .await
    }
}

/// Resolves the actor against the principal store.
///
/// # Errors
///
/// - [`ActorNotFound`] if the actor does not exist
/// - [`StoreError`] if the underlying store returns an error
///
/// [`ActorNotFound`]: AuthenticationError::ActorNotFound
/// [`StoreError`]: AuthenticationError::StoreError
pub(crate) async fn resolve_actor<R>(
    actor_resolver: &R,
    actor_id: ActorEntityUuid,
) -> Result<ActorId, Report<AuthenticationError>>
where
    R: ResolveActor,
{
    actor_resolver
        .resolve_actor(actor_id)
        .await
        .map_err(|report| match report.current_context() {
            DetermineActorError::ActorNotFound { .. } => {
                report.change_context(AuthenticationError::ActorNotFound { actor_id })
            }
            DetermineActorError::StoreError => {
                report.change_context(AuthenticationError::StoreError)
            }
        })
}

/// Resolves the actor against the principal store and requires it to be a user actor.
///
/// # Errors
///
/// - [`NotAUser`] if the actor is not a user
/// - [`ActorNotFound`] if the actor does not exist
/// - [`StoreError`] if the underlying store returns an error
///
/// [`NotAUser`]: AuthenticationError::NotAUser
/// [`ActorNotFound`]: AuthenticationError::ActorNotFound
/// [`StoreError`]: AuthenticationError::StoreError
pub(crate) async fn resolve_user_actor<R>(
    actor_resolver: &R,
    actor_id: ActorEntityUuid,
) -> Result<UserId, Report<AuthenticationError>>
where
    R: ResolveActor,
{
    match resolve_actor(actor_resolver, actor_id).await? {
        ActorId::User(user_id) => Ok(user_id),
        ActorId::Machine(_) | ActorId::Ai(_) => {
            Err(Report::new(AuthenticationError::NotAUser { actor_id }))
        }
    }
}

#[cfg(any(test, feature = "test-utils"))]
pub mod tests {
    use std::collections::HashMap;

    use error_stack::Report;
    use hash_graph_authorization::policies::store::error::DetermineActorError;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::ResolveActor;

    /// Actor resolver serving a fixed set of actors.
    pub struct FixedActorResolver {
        actors: HashMap<ActorEntityUuid, ActorId>,
    }

    impl FixedActorResolver {
        #[must_use]
        pub const fn new(actors: HashMap<ActorEntityUuid, ActorId>) -> Self {
            Self { actors }
        }
    }

    impl ResolveActor for FixedActorResolver {
        fn resolve_actor(
            &self,
            actor_entity_uuid: ActorEntityUuid,
        ) -> impl Future<Output = Result<ActorId, Report<DetermineActorError>>> + Send {
            core::future::ready(self.actors.get(&actor_entity_uuid).copied().ok_or_else(|| {
                Report::new(DetermineActorError::ActorNotFound { actor_entity_uuid })
            }))
        }
    }

    #[must_use]
    pub fn random_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(Uuid::new_v4())
    }

    /// A resolver map holding the given actor as a user.
    #[must_use]
    pub fn known_user(actor_id: ActorEntityUuid) -> HashMap<ActorEntityUuid, ActorId> {
        HashMap::from([(actor_id, ActorId::User(UserId::new(actor_id)))])
    }
}
