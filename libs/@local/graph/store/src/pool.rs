use alloc::sync::Arc;
use core::error::Error;

use error_stack::Report;
use hash_temporal_client::TemporalClient;

use crate::{
    account::AccountStore, data_type::DataTypeStore, entity::EntityStore,
    entity_type::EntityTypeStore, property_type::PropertyTypeStore,
};

/// Managed pool to keep track about [`Store`]s.
///
/// [`Store`]: Self::Store
pub trait StorePool {
    /// The error returned when acquiring a [`Store`].
    ///
    /// [`Store`]: Self::Store
    type Error: Error + Send + Sync + 'static;

    /// The store returned when acquiring.
    type Store<'pool>: AccountStore
        + DataTypeStore
        + PropertyTypeStore
        + EntityTypeStore
        + EntityStore
        + Send
        + Sync;

    /// Retrieves a [`Store`] from the pool.
    ///
    /// [`Store`]: Self::Store
    fn acquire(
        &self,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> impl Future<Output = Result<Self::Store<'_>, Report<Self::Error>>> + Send;

    /// Retrieves an owned [`Store`] from the pool.
    ///
    /// Using an owned [`Store`] makes it easier to leak the connection pool and it's not possible
    /// to reuse that connection. Therefore, [`acquire`] (which stores a lifetime-bound reference to
    /// the `StorePool`) should be preferred whenever possible.
    ///
    /// [`Store`]: Self::Store
    /// [`acquire`]: Self::acquire
    fn acquire_owned(
        &self,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> impl Future<Output = Result<Self::Store<'static>, Report<Self::Error>>> + Send;
}
