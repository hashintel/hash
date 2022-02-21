use std::sync::Arc;

use parking_lot::RwLock;

use crate::{
    datastore::{
        batch::{AgentBatch, DynamicBatch},
        table::pool::proxy::PoolWriteProxy,
        Result,
    },
    simulation::package::state::StateColumn,
};

/// An ordered collection of similar [`AgentBatch`]es for each group within a simulation run.
///
/// All fields (except for messages) that agents' have are persisted in the Agent Pool.
#[derive(Clone)]
pub struct AgentPool {
    batches: Vec<Arc<RwLock<AgentBatch>>>,
}

impl super::Pool<AgentBatch> for AgentPool {
    fn new(batches: Vec<Arc<RwLock<AgentBatch>>>) -> Self {
        Self { batches }
    }

    fn get_batches(&self) -> &[Arc<RwLock<AgentBatch>>] {
        &self.batches
    }

    fn get_batches_mut(&mut self) -> &mut Vec<Arc<RwLock<AgentBatch>>> {
        &mut self.batches
    }
}

impl Extend<AgentBatch> for AgentPool {
    fn extend<T: IntoIterator<Item = AgentBatch>>(&mut self, iter: T) {
        self.batches
            .extend(iter.into_iter().map(|batch| Arc::new(RwLock::new(batch))))
    }
}

impl PoolWriteProxy<AgentBatch> {
    /// TODO: DOC
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

    /// Calls [`Batch::flush_changes()`] on all batches in this proxy.
    pub fn flush_pending_columns(&mut self) -> Result<()> {
        for batch in self.batches_iter_mut() {
            batch.flush_changes()?;
        }
        Ok(())
    }
}
