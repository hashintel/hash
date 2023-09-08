use std::future::Future;

use futures::Stream;
use graph_types::{account::AccountId, knowledge::entity::EntityId};

use crate::{
    backend::CheckError,
    zanzibar::{Consistency, Zookie},
};

pub trait AuthorizationApi {
    async fn view_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<(bool, Zookie<'static>), CheckError>;

    fn view_entities(
        &self,
        actor: AccountId,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<
            (
                impl Stream<Item = Result<(EntityId, bool), CheckError>> + Send,
                Zookie<'static>,
            ),
            CheckError,
        >,
    > + Send;
}

/// Managed pool to keep track about [`AuthorizationApi`]s.
pub trait AuthorizationApiPool: Sync {
    /// The error returned when acquiring an [`AuthorizationApi`].
    type Error;

    /// The [`AuthorizationApi`] returned when acquiring.
    type Api<'pool>: AuthorizationApi + Send;

    /// Retrieves an [`AuthorizationApi`] from the pool.
    async fn acquire(&self) -> Result<Self::Api<'_>, Self::Error>;

    /// Retrieves an owned [`AuthorizationApi`] from the pool.
    ///
    /// Using an owned [`AuthorizationApi`] makes it easier to leak the connection pool and it's not
    /// possible to reuse that connection. Therefore, [`acquire`] (which stores a
    /// lifetime-bound reference to the `StorePool`) should be preferred whenever possible.
    ///
    /// [`acquire`]: Self::acquire
    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error>;
}
