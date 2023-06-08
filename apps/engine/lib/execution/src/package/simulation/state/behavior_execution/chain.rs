use arrow2::array::{
    FixedSizeListArray, ListArray, MutableArray, MutablePrimitiveArray, Utf8Array,
};
use memory::arrow::{
    column_with_name_from_record_batch, new_buffer, new_offsets_buffer, record_batch::RecordBatch,
    ColumnChange, IntoArrowChange,
};
use stateful::{agent::AgentBatch, state::StateColumn};

use crate::{
    package::simulation::state::behavior_execution::{
        config::BehaviorId, BehaviorIdInnerDataType, BehaviorIds, BEHAVIOR_INDEX_INNER_COUNT,
    },
    Error, Result,
};

pub fn gather_behavior_chains(
    agent_batches: &[&AgentBatch],
    behavior_ids: &BehaviorIds,
    data_types: [arrow2::datatypes::DataType; 3],
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

pub fn pool_behavior_list_bytes_iter<'a>(
    agent_pool: &'a [&AgentBatch],
) -> Result<impl Iterator<Item = Vec<&'a [u8]>>> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    for agent_batch in agent_pool {
        let iterable = behavior_list_bytes_iter(agent_batch.batch.record_batch()?)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn behavior_list_bytes_iter(
    agent_batch: &RecordBatch,
) -> Result<impl Iterator<Item = Vec<&[u8]>>> {
    let column_name = "behaviors";
    let row_count = agent_batch.num_rows();
    let column = column_with_name_from_record_batch(agent_batch, column_name)?
        .as_any()
        .downcast_ref::<ListArray<i32>>()
        .unwrap();

    // SAFETY: This column has data type `List<String>`. The first buffer of this type of column is
    //         an offset buffer and offsets (not `LargeList` offsets) have type `i32`. The first
    //         buffer of the child data is the same as the first buffer of a `String` column, which
    //         is also an offset buffer.
    let list_indices = column.offsets().as_slice();
    let string_array = column
        .values()
        .as_any()
        .downcast_ref::<Utf8Array<i32>>()
        .unwrap();
    let string_indices = string_array.offsets().as_slice();
    let utf_8 = string_array.values();

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
    data_types: [arrow2::datatypes::DataType; 3],
}

impl IntoArrowChange for ChainList {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> memory::Result<ColumnChange> {
        debug_assert!(self.inner.len() >= range.end);
        let num_agents = range.end - range.start;
        let chains = &self.inner[range.start..range.end];
        let mut offsets: Vec<i32> = new_offsets_buffer(num_agents);

        for i in 0..num_agents {
            let len = chains[i].inner.len() as i32;
            offsets[i + 1] = offsets[i] + len;
        }

        let num_behavior_ids = offsets[num_agents] as usize;
        let num_indices = num_behavior_ids * BEHAVIOR_INDEX_INNER_COUNT;

        let mut data = new_buffer::<BehaviorIdInnerDataType>(num_indices);

        let mut next_index = 0;
        for chain in chains.iter().take(num_agents) {
            for indices in &chain.inner {
                data[next_index] = indices.lang_index();
                data[next_index + 1] = indices.lang_behavior_index();
                next_index += 2;
            }
        }

        // Indices
        let mut child_data = MutablePrimitiveArray::<u16>::from_vec(data);

        debug_assert_eq!(child_data.len(), num_indices);

        // Fixed-length lists
        let child_data =
            FixedSizeListArray::new(self.data_types[1].clone(), child_data.as_box(), None);

        debug_assert_eq!(child_data.len(), num_behavior_ids);

        // Variable-length lists
        let data = ListArray::from_data(
            self.data_types[0].clone(),
            offsets.into(),
            child_data.boxed(),
            None,
        )
        .boxed();

        debug_assert_eq!(data.len(), num_agents);

        Ok(ColumnChange {
            data,
            index: self.behavior_ids_col_index,
        })
    }
}
