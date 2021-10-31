use std::{
    collections::{HashMap, HashSet},
    ops::Deref,
};

use bimap::BiHashMap;

use super::{AgentIndex, BatchIndex, ChainIndex, Error, Result, WorkerIndex};

use crate::datastore::{batch::agent::Batch as AgentBatch, UUID_V4_LEN};

#[derive(Debug, Clone)]
pub struct BaseBatch {
    /// Index of the batch in the dynamic pool
    index: BatchIndex,
    /// Current Worker index
    worker: WorkerIndex,
    remove_indices: Vec<AgentIndex>,
    /// Number of agents in the batch (before any changes)
    num_agents: usize,
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
    pub fn new(old_batch: Option<BaseBatch>, num_agents: usize) -> PendingBatch {
        PendingBatch {
            base: old_batch,
            num_inbound: 0,
            num_agents,
        }
    }

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

        let old_batch = BaseBatch {
            index: batch_index,
            worker: batch.affinity,
            remove_indices,
            num_agents: batch.num_agents(),
        };

        Ok(PendingBatch {
            base: Some(old_batch),
            num_inbound: 0,
            num_agents: batch.num_agents() - remove_indices.len(),
        })
    }

    pub fn add_inbound_count(&mut self, count: usize) {
        self.num_inbound += count;
        self.increment_num_agents(count);
    }

    fn increment_num_agents(&mut self, value: usize) {
        self.num_agents += value;
    }

    pub fn num_agents(&self) -> usize {
        self.num_agents
    }

    pub fn num_inbound(&self) -> usize {
        self.num_inbound
    }

    pub fn old_num_agents_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().num_agents
    }

    pub fn num_delete_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().remove_indices.len()
    }

    pub fn get_remove_actions(&self) -> &[AgentIndex] {
        self.base
            .as_ref()
            .map(|b| b.remove_indices.deref())
            .unwrap_or(&[])
    }

    pub fn old_worker_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().worker
    }

    pub fn old_batch_index_unchecked(&self) -> usize {
        self.base.as_ref().unwrap().index
    }

    pub fn old_batch_index(&self) -> Option<usize> {
        self.base.map(|b| b.index)
    }

    pub fn wraps_batch(&self) -> bool {
        self.base.is_some()
    }
}

fn get_behavior_string_vec(
    chain_index: ChainIndex,
    bimap: &BiHashMap<Vec<u16>, usize>,
    index_behavior_map: &HashMap<u16, Vec<u8>>,
) -> Result<Vec<String>> {
    if let Some(values) = bimap.get_by_right(&chain_index) {
        values
            .iter()
            .map(|x| {
                index_behavior_map
                    .get(x)
                    .expect("Cannot fail as values are sourced from `index_behavior_map`")
            })
            .map(|a| String::from_utf8(a.clone()).map_err(Error::from))
            .collect::<Result<_>>()
    } else {
        Err(Error::from("Invalid chain index"))
    }
}
