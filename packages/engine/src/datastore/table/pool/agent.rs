use std::sync::Arc;

use parking_lot::RwLock;

use crate::{
    datastore::{batch::AgentBatch, table::pool::proxy::PoolWriteProxy, Result},
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

impl AgentPool {
    pub fn reserve(&mut self, additional: usize) {
        self.batches.reserve(additional);
    }

    pub fn push(&mut self, batch: AgentBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }
}

impl PoolWriteProxy<AgentBatch> {
    /// TODO: DOC
    pub fn modify_loaded_column(&mut self, column: StateColumn) -> Result<()> {
        let mut group_start = 0;
        for agent_group in self.batches_iter_mut() {
            let num_agents = agent_group.num_agents();
            let next_start = group_start + num_agents;
            let change = column.get_arrow_change(group_start..next_start)?;
            agent_group.batch.queue_change(change)?;
            group_start = next_start;
        }
        Ok(())
    }

    /// Calls [`Batch::flush_changes()`] on all batches in this proxy.
    pub fn flush_pending_columns(&mut self) -> Result<()> {
        for agent_group in self.batches_iter_mut() {
            agent_group.batch.flush_changes()?;
        }
        Ok(())
    }
}
