use std::{collections::HashSet, ops::Deref};

use super::{AgentIndex, BatchIndex, Result, WorkerIndex};
use crate::datastore::{batch::agent::Batch as AgentBatch, UUID_V4_LEN};

#[derive(Debug, Clone)]
pub struct BaseBatch {
    /// Index of the batch in the dynamic pool
    index: BatchIndex,
    /// Current Worker index
    worker: WorkerIndex,
    remove_indices: Vec<AgentIndex>,
    /// Number of agents in the batch (before any changes)
    _num_agents: usize, // TODO: unused, delete?
}

/// Represents a batch of agents from the dynamic pool
/// which have pending actions
#[derive(Debug, Clone)]
pub struct PendingBatch {
    /// `Some` if this `PendingBatch` describes actions on an existing batch
    /// `None` if this `PendingBatch` will be created from scratch
    base: Option<BaseBatch>,
    /// To-be-added agents
    num_inbound: usize,
    /// Total count that will be after commiting changes
    num_agents: usize,
}

impl PendingBatch {
    #[tracing::instrument(skip_all)]
    pub fn new(old_batch: Option<BaseBatch>, num_agents: usize) -> PendingBatch {
        PendingBatch {
            base: old_batch,
            num_inbound: 0,
            num_agents,
        }
    }

    #[tracing::instrument(skip_all)]
    pub fn from_batch(
        batch_index: usize,
        batch: &AgentBatch,
        remove_ids: &mut HashSet<[u8; UUID_V4_LEN]>,
    ) -> Result<PendingBatch> {
        let mut remove_indices = vec![];
        batch
            .agent_id_iter()?
            .enumerate()
            .try_for_each::<_, Result<()>>(|(row_index, id)| {
                if remove_ids.remove(id) {
                    remove_indices.push(AgentIndex { val: row_index })
                };
                Ok(())
            })?;
        let remove_indices_len = remove_indices.len();
        let old_batch = BaseBatch {
            index: batch_index,
            worker: batch.affinity,
            remove_indices,
            _num_agents: batch.num_agents(),
        };

        Ok(PendingBatch {
            base: Some(old_batch),
            num_inbound: 0,
            num_agents: batch.num_agents() - remove_indices_len,
        })
    }

    #[tracing::instrument(skip_all)]
    pub fn add_inbound_count(&mut self, count: usize) {
        self.num_inbound += count;
        self.increment_num_agents(count);
    }

    #[tracing::instrument(skip_all)]
    fn increment_num_agents(&mut self, value: usize) {
        self.num_agents += value;
    }

    #[tracing::instrument(skip_all)]
    pub fn num_agents(&self) -> usize {
        self.num_agents
    }

    #[tracing::instrument(skip_all)]
    pub fn num_inbound(&self) -> usize {
        self.num_inbound
    }

    #[tracing::instrument(skip_all)]
    pub fn num_delete_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().remove_indices.len()
    }

    #[tracing::instrument(skip_all)]
    pub fn get_remove_actions(&self) -> &[AgentIndex] {
        self.base
            .as_ref()
            .map(|b| b.remove_indices.deref())
            .unwrap_or(&[])
    }

    #[tracing::instrument(skip_all)]
    pub fn old_worker_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().worker
    }

    #[tracing::instrument(skip_all)]
    pub fn old_batch_index_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().index
    }

    #[tracing::instrument(skip_all)]
    pub fn old_batch_index(&self) -> Option<usize> {
        self.base.as_ref().map(|b| b.index)
    }

    #[tracing::instrument(skip_all)]
    pub fn wraps_batch(&self) -> bool {
        self.base.is_some()
    }
}
