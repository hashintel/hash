pub mod agent;
pub mod message;
pub mod proxy;

use std::sync::Arc;

use parking_lot::RwLock;

use self::proxy::{PoolReadProxy, PoolWriteProxy};
use super::proxy::{BatchReadProxy, BatchWriteProxy};
use crate::datastore::{batch::Batch, prelude::Result};

/// A pool is an ordered collection of similar batches for each group within a simulation run.
pub trait BatchPool<K: Batch>: Send + Sync {
    fn batches(&self) -> &[Arc<RwLock<K>>];
    fn mut_batches(&mut self) -> &mut Vec<Arc<RwLock<K>>>;

    /// Replaces inner batches within self with the new ones provided by `other` at the specified
    /// `indices`.
    fn update<T: BatchPool<K>>(&mut self, other: &T, indices: &[usize]) {
        let own = self.mut_batches();
        let other = other.batches();
        for index in indices.iter() {
            own[*index] = other[*index].clone();
        }
    }

    /// Creates a [`PoolReadProxy`] for _all_ batches within the pool.
    fn read_proxy(&self) -> Result<PoolReadProxy<K>> {
        Ok(PoolReadProxy::from(
            self.batches()
                .iter()
                .map(|a| BatchReadProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    /// Creates a [`PoolReadProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    fn partial_read_proxy(&self, indices: &[usize]) -> Result<PoolReadProxy<K>> {
        Ok(PoolReadProxy::from(
            self.batches()
                .iter()
                .enumerate()
                .filter(|(index, _)| indices.contains(index))
                .map(|(_, a)| BatchReadProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    /// Creates a [`PoolWriteProxy`] for _all_ batches within the pool.
    fn write_proxy(&mut self) -> Result<PoolWriteProxy<K>> {
        Ok(PoolWriteProxy::from(
            self.batches()
                .iter()
                .map(|a| BatchWriteProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    /// Creates a [`PoolWriteProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    ///
    /// This can be used to create multiple mutable disjoint partitions of the pool.
    fn partial_write_proxy(&self, indices: &[usize]) -> Result<PoolWriteProxy<K>> {
        Ok(PoolWriteProxy::from(
            self.batches()
                .iter()
                .enumerate()
                .filter(|(index, _)| indices.contains(index))
                .map(|(_, a)| BatchWriteProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }
}
