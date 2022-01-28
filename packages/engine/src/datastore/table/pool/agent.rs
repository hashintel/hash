use std::sync::Arc;

use parking_lot::{RwLock, RwLockReadGuard, RwLockWriteGuard};

use super::BatchPool;
use crate::{
    datastore::{batch::DynamicBatch, prelude::*},
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
    
    // TODO, why do we have these methods, when we have proxies. Clearly they're needed because 
    //  we're actually seeing the errors, but this should be fixed
    /// Attempts to acquire read-locks on all batches within the pool.
    pub fn try_read_batches(&self) -> Result<Vec<RwLockReadGuard<'_, AgentBatch>>> {
        self.batches()
            .iter()
            .map(|a| {
                a.try_read()
                    .ok_or_else(|| Error::from("failed to acquire read locks on batches in pool"))
            })
            .collect::<Result<_>>()
    }

    /// Attempts to acquire write-locks on all batches within the pool.
    pub fn try_write_batches(&mut self) -> Result<Vec<RwLockWriteGuard<'_, AgentBatch>>> {
        self.batches()
            .iter()
            .map(|a| {
                a.try_write()
                    .ok_or_else(|| Error::from("failed to acquire write locks on batches in pool"))
            })
            .collect::<Result<_>>()
    }

    pub fn len(&self) -> usize {
        self.batches().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn get_batch_at_index(
        &self,
        index: usize,
    ) -> Result<Option<RwLockWriteGuard<'_, AgentBatch>>> {
        let batch = self
            .batches
            .get(index)
            .map(|batch| batch.try_write())
            .ok_or_else(|| {
                Error::from(format!(
                    "failed to get write lock for batch at index: {}",
                    index
                ))
            })?;
        Ok(batch)
    }

    pub fn set_pending_column(&mut self, column: StateColumn) -> Result<()> {
        let write = self.try_write_batches()?;
        let mut index = 0;
        for mut batch in write {
            let num_agents = batch.num_agents();
            let next_index = index + num_agents;
            let change = column.get_arrow_change(index..next_index)?;
            batch.push_change(change)?;
            index = next_index;
        }
        Ok(())
    }

    pub fn flush_pending_columns(&mut self) -> Result<()> {
        let write = self.try_write_batches()?;
        for mut batch in write {
            batch.flush_changes()?;
        }
        Ok(())
    }
}

impl BatchPool<AgentBatch> for AgentPool {
    fn batches(&self) -> &[Arc<RwLock<AgentBatch>>] {
        &self.batches
    }

    fn mut_batches(&mut self) -> &mut Vec<Arc<RwLock<AgentBatch>>> {
        &mut self.batches
    }
}
