pub mod agent;
pub mod message;
pub mod proxy;

use self::proxy::{PoolReadProxy, PoolWriteProxy};
use crate::datastore::{batch::Batch, prelude::Result};

/// A pool is an ordered collection of similar batches for each group within a simulation run.
pub trait BatchPool<K: Batch>: Send + Sync {
    /// Creates a [`PoolReadProxy`] for _all_ batches within the pool.
    fn read_proxy(&self) -> Result<PoolReadProxy<K>>;

    /// Creates a [`PoolReadProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    fn partial_read_proxy(&self, indices: &[usize]) -> Result<PoolReadProxy<K>>;

    /// Creates a [`PoolWriteProxy`] for _all_ batches within the pool.
    fn write_proxy(&mut self) -> Result<PoolWriteProxy<K>>;

    /// Creates a [`PoolWriteProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    ///
    /// This can be used to create multiple mutable disjoint partitions of the pool.
    fn partial_write_proxy(&self, indices: &[usize]) -> Result<PoolWriteProxy<K>>;
}
