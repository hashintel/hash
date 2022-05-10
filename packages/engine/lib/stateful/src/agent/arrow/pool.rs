use std::sync::Arc;

use parking_lot::RwLock;

use crate::{
    agent::AgentBatch,
    proxy::{BatchPool, BatchReadProxy, BatchWriteProxy, PoolReadProxy, PoolWriteProxy},
    Result,
};

/// An ordered collection of similar [`AgentBatch`]es for each group within a simulation run.
///
/// All fields (except for messages) that agents' have are persisted in the Agent Pool.
#[derive(Clone)]
pub struct AgentBatchPool {
    batches: Vec<Arc<RwLock<AgentBatch>>>,
}

impl AgentBatchPool {
    /// Creates a new pool from [`AgentBatch`]es.
    ///
    /// Because of the way `BatchPools` are organized it's required that the [`AgentBatch`]es are
    /// stored inside an [`RwLock`] behind an [`Arc`].
    pub fn new(batches: Vec<Arc<RwLock<AgentBatch>>>) -> Self {
        Self { batches }
    }

    /// Creates a new empty pool.
    pub fn empty() -> Self
    where
        Self: Sized,
    {
        Self::new(Vec::new())
    }

    pub fn reserve(&mut self, additional: usize) {
        self.batches.reserve(additional);
    }

    pub fn push(&mut self, batch: AgentBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }
}

impl BatchPool for AgentBatchPool {
    type Batch = AgentBatch;

    fn len(&self) -> usize {
        self.batches.len()
    }

    fn push(&mut self, batch: Self::Batch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }

    fn remove(&mut self, index: usize) -> Self::Batch {
        let batch_arc = self.batches.remove(index);
        if let Ok(rw_lock) = Arc::try_unwrap(batch_arc) {
            rw_lock.into_inner()
        } else {
            panic!("Failed to remove Batch at index {index}, other Arcs to the Batch existed")
        }
    }

    fn swap_remove(&mut self, index: usize) -> Self::Batch {
        let batch_arc = self.batches.swap_remove(index);
        if let Ok(rw_lock) = Arc::try_unwrap(batch_arc) {
            rw_lock.into_inner()
        } else {
            panic!("Failed to swap remove Batch at index {index}, other Arcs to the Batch existed")
        }
    }

    fn read_proxies(&self) -> Result<PoolReadProxy<Self::Batch>> {
        self.batches.iter().map(BatchReadProxy::new).collect()
    }

    fn partial_read_proxies(&self, indices: &[usize]) -> Result<PoolReadProxy<Self::Batch>> {
        indices
            .iter()
            .map(|i| BatchReadProxy::new(&self.batches[*i]))
            .collect()
    }

    fn write_proxies(&mut self) -> Result<PoolWriteProxy<Self::Batch>> {
        self.batches.iter().map(BatchWriteProxy::new).collect()
    }

    fn partial_write_proxies(&mut self, indices: &[usize]) -> Result<PoolWriteProxy<Self::Batch>> {
        indices
            .iter()
            .map(|i| BatchWriteProxy::new(&self.batches[*i]))
            .collect()
    }
}
