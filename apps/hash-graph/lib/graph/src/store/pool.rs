use std::future::Future;

use error_stack::Result;

use crate::store::Store;

/// Managed pool to keep track about [`Store`]s.
pub trait StorePool: Sync {
    /// The error returned when acquiring a [`Store`].
    type Error;

    /// The store returned when acquiring.
    type Store<'pool>: Store + Send;

    /// Retrieves a [`Store`] from the pool.
    fn acquire(&self) -> impl Future<Output = Result<Self::Store<'_>, Self::Error>> + Send;

    /// Retrieves an owned [`Store`] from the pool.
    ///
    /// Using an owned [`Store`] makes it easier to leak the connection pool. Therefore,
    /// [`StorePool::acquire`] (which stores a lifetime-bound reference to the `StorePool`) should
    /// be preferred whenever possible.
    fn acquire_owned(
        &self,
    ) -> impl Future<Output = Result<Self::Store<'static>, Self::Error>> + Send;
}
