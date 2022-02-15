pub mod agent;
pub mod message;
pub mod proxy;

use std::sync::Arc;

use parking_lot::RwLock;

use self::proxy::{PoolReadProxy, PoolWriteProxy};
use crate::datastore::{
    batch::Batch,
    prelude::Result,
    table::proxy::{BatchReadProxy, BatchWriteProxy},
};

/// Internal trait to implement `BatchPool` without leaking `Arc<RwLock<B>>`
trait Pool<B> {
    fn new(batches: Vec<Arc<RwLock<B>>>) -> Self;
    fn get_batches(&self) -> &[Arc<RwLock<B>>];
    fn get_batches_mut(&mut self) -> &mut Vec<Arc<RwLock<B>>>;
}

/// A pool is an ordered collection of batches, where each group of agents within a simulation run
/// is associated to a batch in the pool.
pub trait BatchPool<B: Batch>: Send + Sync {
    fn new(batches: Vec<Arc<RwLock<B>>>) -> Self;

    fn empty() -> Self
    where
        Self: Sized,
    {
        Self::new(Vec::new())
    }

    fn len(&self) -> usize;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn push(&mut self, batch: B);

    fn remove(&mut self, index: usize) -> String;

    fn swap_remove(&mut self, index: usize) -> String;

    /// Creates a [`PoolReadProxy`] for _all_ batches within the pool.
    fn read_proxies(&self) -> Result<PoolReadProxy<B>>;

    /// Creates a [`PoolReadProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    fn partial_read_proxies(&self, indices: &[usize]) -> Result<PoolReadProxy<B>>;

    /// Creates a [`PoolWriteProxy`] for _all_ batches within the pool.
    fn write_proxies(&mut self) -> Result<PoolWriteProxy<B>>;

    /// Creates a [`PoolWriteProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    ///
    /// This can be used to create multiple mutable disjoint partitions of the pool.
    fn partial_write_proxies(&mut self, indices: &[usize]) -> Result<PoolWriteProxy<B>>;
}

impl<P: Pool<B> + Send + Sync, B: Batch> BatchPool<B> for P {
    fn new(batches: Vec<Arc<RwLock<B>>>) -> Self {
        Pool::new(batches)
    }

    fn len(&self) -> usize {
        self.get_batches().len()
    }

    fn push(&mut self, batch: B) {
        self.get_batches_mut().push(Arc::new(RwLock::new(batch)))
    }

    fn remove(&mut self, index: usize) -> String {
        let mut batch_arc = self.get_batches_mut().remove(index);
        if let Some(rw_lock) = Arc::get_mut(&mut batch_arc) {
            // This can't deadlock as we just checked that the Arc owning this RwLock is unique
            let batch = rw_lock.write();
            batch.get_batch_id().to_string()
        } else {
            panic!("Failed to remove Batch at index {index}, other Arcs to the Batch existed")
        }
    }

    fn swap_remove(&mut self, index: usize) -> String {
        let mut batch_arc = self.get_batches_mut().swap_remove(index);
        if let Some(rw_lock) = Arc::get_mut(&mut batch_arc) {
            // This can't deadlock as we just checked that the Arc owning this RwLock is unique
            let batch = rw_lock.write();
            batch.get_batch_id().to_string()
        } else {
            panic!("Failed to swap remove Batch at index {index}, other Arcs to the Batch existed")
        }
    }

    fn read_proxies(&self) -> Result<PoolReadProxy<B>> {
        self.get_batches().iter().map(BatchReadProxy::new).collect()
    }

    fn partial_read_proxies(&self, indices: &[usize]) -> Result<PoolReadProxy<B>> {
        self.get_batches()
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchReadProxy::new(b))
            .collect()
    }

    fn write_proxies(&mut self) -> Result<PoolWriteProxy<B>> {
        self.get_batches()
            .iter()
            .map(BatchWriteProxy::new)
            .collect()
    }

    fn partial_write_proxies(&mut self, indices: &[usize]) -> Result<PoolWriteProxy<B>> {
        self.get_batches()
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchWriteProxy::new(b))
            .collect()
    }
}
