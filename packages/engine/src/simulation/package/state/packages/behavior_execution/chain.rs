use std::ops::Deref;

use arrow::array::ArrayData;

use super::*;
use crate::{
    datastore::arrow::batch_conversion::{new_buffer, new_offsets_buffer},
    simulation::package::state::packages::behavior_execution::config::BehaviorId,
};

pub fn gather_behavior_chains<B: Deref<Target = AgentBatch>>(
    agent_batches: &[B],
    behavior_ids: &BehaviorIds,
    data_types: [arrow::datatypes::DataType; 3],
    behavior_ids_col_index: usize,
) -> Result<StateColumn> {
    let inner = pool_behavior_list_bytes_iter(agent_batches)?
        .map(|v| Chain::from_behaviors(&v, behavior_ids))
        .collect::<Result<Vec<_>>>()?;
    Ok(StateColumn::new(Box::new(ChainList {
        inner,
        behavior_ids_col_index,
        data_types,
    })))
}

pub fn pool_behavior_list_bytes_iter<'a, B: Deref<Target = AgentBatch>>(
    agent_pool: &'a [B],
) -> Result<impl Iterator<Item = Vec<&[u8]>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    for agent_batch in agent_pool {
        let iterable = behavior_list_bytes_iter(agent_batch.record_batch()?)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn behavior_list_bytes_iter(
    agent_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Vec<&[u8]>>> {
    let column_name = "behaviors";
    let row_count = agent_batch.num_rows();
    let (column_id, _) = agent_batch
        .schema()
        .column_with_name(column_name)
        .ok_or_else(|| crate::datastore::Error::ColumnNotFound(column_name.into()))?;
    let column = agent_batch.column(column_id);
    let col_data = column.data_ref();

    let list_indices = unsafe { col_data.buffers()[0].typed_data::<i32>() };
    let string_indices = unsafe { col_data.child_data()[0].buffers()[0].typed_data::<i32>() };
    let utf_8 = col_data.child_data()[0].buffers()[1].as_slice();

    Ok((0..row_count).map(move |i| {
        let list_from = list_indices[i] as usize;
        let list_to = list_indices[i + 1] as usize;
        let indices = &string_indices[list_from..=list_to];
        let mut next_index = indices[0] as usize;
        (0..list_to - list_from)
            .map(|j| {
                let new_index = indices[j + 1] as usize;
                let slice = &utf_8[next_index..new_index];
                next_index = new_index;
                slice
            })
            .collect()
    }))
}

pub struct Chain {
    inner: Vec<BehaviorId>,
}

impl Chain {
    pub fn from_behaviors(behaviors: &[&[u8]], behavior_ids: &BehaviorIds) -> Result<Self> {
        Ok(Chain {
            inner: behaviors
                .iter()
                .map(|bytes| {
                    let index = behavior_ids.get_index(bytes).ok_or_else(|| {
                        match std::str::from_utf8(bytes) {
                            Ok(res) => {
                                Error::from(format!("Could not find behavior with name {}", res))
                            }
                            Err(_e) => Error::from(format!(
                                "Could not parse behavior name. Bytes: {:?}",
                                bytes[0..bytes.len().min(100)].to_vec()
                            )),
                        }
                    })?;
                    Ok(*index)
                })
                .collect::<Result<_>>()?,
        })
    }
}

pub struct ChainList {
    inner: Vec<Chain>,
    behavior_ids_col_index: usize,
    data_types: [arrow::datatypes::DataType; 3],
}

impl IntoArrowChange for ChainList {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ColumnChange> {
        debug_assert!(self.inner.len() >= range.end);
        let num_agents = range.end - range.start;
        let chains = &self.inner[range.start..range.end];
        let mut offsets = new_offsets_buffer(num_agents);
        // SAFETY: `new_offsets_buffer` is returning a buffer of `i32`
        let mut_offsets = unsafe { offsets.typed_data_mut::<i32>() };
        for i in 0..num_agents {
            let len = chains[i].inner.len() as i32;
            mut_offsets[i + 1] = mut_offsets[i] + len;
        }

        let num_behavior_ids = mut_offsets[num_agents] as usize;
        let num_indices = num_behavior_ids * BEHAVIOR_INDEX_INNER_COUNT;

        let mut data = new_buffer::<BehaviorIdInnerDataType>(num_indices);
        // SAFETY: `new_buffer` is returning a buffer of `BehaviorIdInnerDataType`
        let mut_data = unsafe { data.typed_data_mut::<BehaviorIdInnerDataType>() };
        let mut next_index = 0;
        for chain in chains.iter().take(num_agents) {
            for indices in &chain.inner {
                mut_data[next_index] = indices.lang_index();
                mut_data[next_index + 1] = indices.lang_behavior_index();
                next_index += 2;
            }
        }

        // Indices
        let child_data = ArrayData::builder(self.data_types[2].clone())
            .len(num_indices)
            .add_buffer(data.into())
            .build()?;

        // Fixed-length lists
        let child_data = ArrayData::builder(self.data_types[1].clone())
            .len(num_behavior_ids)
            .add_child_data(child_data)
            .build()?;

        // Variable-length lists
        let data = ArrayData::builder(self.data_types[0].clone())
            .len(num_agents)
            .add_buffer(offsets.into())
            .add_child_data(child_data)
            .build()?;

        Ok(ColumnChange::new(data, self.behavior_ids_col_index))
    }
}
