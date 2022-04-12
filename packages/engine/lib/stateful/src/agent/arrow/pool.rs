use std::sync::Arc;

use parking_lot::RwLock;

use crate::{
    agent::AgentBatch,
    proxy::{BatchPool, BatchReadProxy, BatchWriteProxy, PoolReadProxy, PoolWriteProxy},
    state::StateColumn,
    Result,
};

/// An ordered collection of similar [`AgentBatch`]es for each group within a simulation run.
///
/// All fields (except for messages) that agents' have are persisted in the Agent Pool.
#[derive(Clone)]
pub struct AgentPool {
    batches: Vec<Arc<RwLock<AgentBatch>>>,
}

impl AgentPool {
    /// Creates a new pool from [`AgentBatch`]es.
    ///
    /// Because of the way `BatchPools` are organized it's required that the [`Batch`]es are
    /// stored inside an [`RwLock`] behind an [`Arc`]. This is subject to change.
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

impl BatchPool for AgentPool {
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

// TODO: DOC
pub fn modify_loaded_column(
    agent_pool_proxy: &mut PoolWriteProxy<AgentBatch>,
    column: StateColumn,
) -> Result<()> {
    let mut batch_start = 0;
    for agent_batch in agent_pool_proxy.batches_iter_mut() {
        let num_agents = agent_batch.num_agents();
        let next_start = batch_start + num_agents;
        let change = column.get_arrow_change(batch_start..next_start)?;
        agent_batch.batch.queue_change(change)?;
        batch_start = next_start;
    }
    Ok(())
}

/// Calls [`flush_changes()`] on all batches in this proxy.
///
/// [`flush_changes()`]: memory::arrow::ArrowBatch::flush_changes
pub fn flush_pending_columns(agent_pool_proxy: &mut PoolWriteProxy<AgentBatch>) -> Result<()> {
    for agent_batch in agent_pool_proxy.batches_iter_mut() {
        agent_batch.batch.flush_changes()?;
    }
    Ok(())
}
