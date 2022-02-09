use std::sync::Arc;

use parking_lot::RwLock;

use super::BatchPool;
use crate::{
    datastore::{
        batch::DynamicBatch,
        prelude::*,
        table::{
            pool::proxy::{PoolReadProxy, PoolWriteProxy},
            proxy::{BatchReadProxy, BatchWriteProxy},
        },
    },
    simulation::package::state::StateColumn,
};

/// An ordered collection of similar [`AgentBatch`]es for each group within a simulation run.
#[derive(Clone)]
pub struct AgentPool {
    batches: Vec<Arc<RwLock<AgentBatch>>>,
}

impl AgentPool {
    pub fn empty() -> AgentPool {
        AgentPool { batches: vec![] }
    }

    pub fn new(batches: Vec<Arc<RwLock<AgentBatch>>>) -> AgentPool {
        AgentPool { batches }
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn push(&mut self, batch: AgentBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }

    pub fn remove(&mut self, index: usize) -> Result<BatchReadProxy<AgentBatch>> {
        BatchReadProxy::new(&self.batches.remove(index))
    }

    pub fn swap_remove(&mut self, index: usize) -> Result<BatchReadProxy<AgentBatch>> {
        BatchReadProxy::new(&self.batches.swap_remove(index))
    }
}

impl Extend<AgentBatch> for AgentPool {
    fn extend<T: IntoIterator<Item = AgentBatch>>(&mut self, iter: T) {
        self.batches
            .extend(iter.into_iter().map(|batch| Arc::new(RwLock::new(batch))))
    }
}

impl BatchPool<AgentBatch> for AgentPool {
    fn read_proxy(&self) -> Result<PoolReadProxy<AgentBatch>> {
        self.batches.iter().map(BatchReadProxy::new).collect()
    }

    fn partial_read_proxy(&self, indices: &[usize]) -> Result<PoolReadProxy<AgentBatch>> {
        self.batches
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchReadProxy::new(b))
            .collect()
    }

    fn write_proxy(&mut self) -> Result<PoolWriteProxy<AgentBatch>> {
        self.batches.iter().map(BatchWriteProxy::new).collect()
    }

    fn partial_write_proxy(&self, indices: &[usize]) -> Result<PoolWriteProxy<AgentBatch>> {
        self.batches
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchWriteProxy::new(b))
            .collect()
    }
}

impl PoolWriteProxy<AgentBatch> {
    pub fn set_pending_column(&mut self, column: StateColumn) -> Result<()> {
        let mut index = 0;
        for batch in self.batches_iter_mut() {
            let num_agents = batch.num_agents();
            let next_index = index + num_agents;
            let change = column.get_arrow_change(index..next_index)?;
            batch.push_change(change)?;
            index = next_index;
        }
        Ok(())
    }

    pub fn flush_pending_columns(&mut self) -> Result<()> {
        for batch in self.batches_iter_mut() {
            batch.flush_changes()?;
        }
        Ok(())
    }
}
