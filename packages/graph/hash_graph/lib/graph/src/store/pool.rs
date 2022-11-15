use async_trait::async_trait;
use error_stack::Result;

use crate::store::Store;

/// Managed pool to keep track about [`Store`]s.
#[async_trait]
pub trait StorePool: Sync {
    /// The error returned when acquiring a [`Store`].
    type Error;

    /// The store returned when acquiring.
    type Store<'pool>: Store + Send;

    /// Retrieves a [`Store`] from the pool.
    async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error>;

    /// Retrieves an owned [`Store`] from the pool.
    ///
    /// Using an owned [`Store`] makes it easier to leak the connection pool. Therefore,
    /// [`StorePool::acquire`] (which stores a lifetime-bound reference to the `StorePool`) should
    /// be preferred whenever possible.
    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error>;
}
