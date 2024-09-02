use alloc::sync::Arc;

use authorization::AuthorizationApi;
use error_stack::{Context, Result};
use temporal_client::TemporalClient;

use crate::store::Store;

/// Managed pool to keep track about [`Store`]s.
pub trait StorePool {
    /// The error returned when acquiring a [`Store`].
    type Error: Context;

    /// The store returned when acquiring.
    type Store<'pool, A: AuthorizationApi>: Store + Send + Sync;

    /// Retrieves a [`Store`] from the pool.
    fn acquire<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> impl Future<Output = Result<Self::Store<'_, A>, Self::Error>> + Send;

    /// Retrieves an owned [`Store`] from the pool.
    ///
    /// Using an owned [`Store`] makes it easier to leak the connection pool and it's not possible
    /// to reuse that connection. Therefore, [`acquire`] (which stores a lifetime-bound reference to
    /// the `StorePool`) should be preferred whenever possible.
    ///
    /// [`acquire`]: Self::acquire
    fn acquire_owned<A: AuthorizationApi>(
        &self,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> impl Future<Output = Result<Self::Store<'static, A>, Self::Error>> + Send;
}
