use memory::arrow::{ColumnChange, IntoArrowChange};

use crate::{agent::AgentBatch, proxy::PoolWriteProxy, Result};

/// Encapsulates the functionality of writing a specific column within the state batches.
///
/// Wrapping the logic within this struct allows any type implementing [`IntoArrowChange`] to
/// write the [`ColumnChange`] to an [`AgentBatchPool`].
///
/// [`AgentBatchPool`]: crate::agent::AgentBatchPool
pub struct StateColumn {
    inner: Box<dyn IntoArrowChange + Send + Sync>,
}

impl StateColumn {
    pub fn new(inner: Box<dyn IntoArrowChange + Send + Sync>) -> StateColumn {
        StateColumn { inner }
    }

    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange> {
        Ok(self.inner.get_arrow_change(range)?)
    }

    // TODO: DOC
    pub fn apply_to(&self, agent_pool_proxy: &mut PoolWriteProxy<AgentBatch>) -> Result<()> {
        let mut batch_start = 0;
        for agent_batch in agent_pool_proxy.batches_iter_mut() {
            let num_agents = agent_batch.num_agents();
            let next_start = batch_start + num_agents;
            let change = self.get_arrow_change(batch_start..next_start)?;
            agent_batch.batch.queue_change(change)?;
            batch_start = next_start;
        }
        Ok(())
    }
}
