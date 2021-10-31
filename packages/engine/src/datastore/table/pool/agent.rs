use parking_lot::RwLock;
use rayon::iter::{IndexedParallelIterator, ParallelIterator};

use crate::{datastore::prelude::*, simulation::packages::state::StateColumn};

use std::{
    ops::{Deref, DerefMut},
    sync::Arc,
};

use super::BatchPool;

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
    // Clone the arcs
    pub fn cloned_batch_pool(&self) -> Vec<Arc<RwLock<AgentBatch>>> {
        self.batches.clone()
    }

    pub fn read_batches(&self) -> Result<Vec<&AgentBatch>> {
        self.batches()
            .iter()
            .map(|a| {
                a.try_read()
                    .map(|read| read.deref())
                    .ok_or_else(|e| Error::from(e))
            })
            .collect::<Result<_>>()
    }

    pub fn write_batches(&mut self) -> Result<Vec<&mut AgentBatch>> {
        self.batches()
            .iter()
            .map(|a| {
                a.try_write()
                    .map(|mut read| read.deref_mut())
                    .ok_or_else(|e| Error::from(e))
            })
            .collect::<Result<_>>()
    }

    pub fn mut_batches(&mut self) -> &mut Vec<Arc<RwLock<AgentBatch>>> {
        &mut self.batches.inner
    }

    pub fn len(&self) -> usize {
        self.batches().len()
    }

    pub fn get_batch_at_index(&self, index: usize) -> Result<Option<&AgentBatch>> {
        let batch = self
            .batches
            .get(index)
            .map(|batch| batch.try_write().map(|b| b.deref()))
            .transpose()?;
        Ok(batch)
    }

    pub fn set_pending_column(&mut self, column: StateColumn) -> Result<()> {
        let write = self.write_batches()?;
        let mut index = 0;
        for batch in write {
            let num_agents = batch.num_agents();
            let next_index = index + num_agents;
            let change = column.get_arrow_change(index..next_index)?;
            batch.push_change(change)?;
            index = next_index;
        }
        Ok(())
    }

    pub fn flush_pending_columns(&mut self) -> Result<()> {
        let write = self.write_batches()?;
        for batch in write {
            batch.flush_changes()?;
        }
        Ok(())
    }
}

// TODO OS[35] - RUNTIME BLOCK - cloned_batch_pool isn't implemented for AgentPool
impl BatchPool<AgentBatch> for AgentPool {
    fn batches(&self) -> &[Arc<RwLock<AgentBatch>>] {
        &self.batches
    }

    fn cloned_batch_pool(&self) -> Vec<Arc<RwLock<AgentBatch>>> {
        todo!()
    }
}
