use crate::datastore::arrow::batch_conversion::{new_buffer, new_offsets_buffer};
use crate::datastore::batch::iterators;
use crate::simulation::package::state::packages::behavior_execution::config::BehaviorIndex;

use super::*;

pub fn gather_behavior_chains(
    state: &ExState,
    config: &BehaviorConfig,
    data_types: [arrow::datatypes::DataType; 3],
    index_column_index: usize,
) -> Result<StateColumn> {
    let batches = state.agent_pool().read_batches()?;

    let inner = iterators::agent::behavior_list_bytes_iter(&batches)?
        .map(|v| Chain::from_behaviors(&v, config))
        .collect::<Result<Vec<_>>>()?;
    Ok(StateColumn::new(Box::new(ChainList {
        inner,
        index_column_index,
        data_types,
    })))
}

pub struct Chain {
    inner: Vec<BehaviorIndex>,
}

impl Chain {
    pub fn from_behaviors(behaviors: &[&[u8]], config: &BehaviorConfig) -> Result<Self> {
        Ok(Chain {
            inner: behaviors
                .iter()
                .map(|bytes| {
                    let index =
                        config.get_index_from_name(bytes).ok_or_else(
                            || match std::str::from_utf8(bytes) {
                                Ok(res) => Error::from(format!(
                                    "Could not find behavior with name {}",
                                    res
                                )),
                                Err(_e) => Error::from(format!(
                                    "Could not parse behavior name. Bytes: {:?}",
                                    bytes[0..bytes.len().min(100)].to_vec()
                                )),
                            },
                        )?;
                    Ok(index.clone())
                })
                .collect::<Result<_>>()?,
        })
    }
}

pub struct ChainList {
    inner: Vec<Chain>,
    index_column_index: usize,
    data_types: [arrow::datatypes::DataType; 3],
}

impl IntoArrowChange for ChainList {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ArrayChange> {
        debug_assert!(self.inner.len() >= range.end);
        let num_agents = range.end - range.start;
        let chains = &self.inner[range.start..range.end];
        let mut offsets = new_offsets_buffer(num_agents);
        let mut_offsets = offsets.typed_data_mut::<i32>();
        for i in 0..num_agents {
            let len = chains[i].inner.len() as i32;
            mut_offsets[i + 1] = mut_offsets[i] + len;
        }

        let num_behavior_indices = mut_offsets[num_agents] as usize;
        let num_indices = num_behavior_indices * BEHAVIOR_INDEX_INNER_COUNT;

        let mut data = new_buffer::<BehaviorIndexInnerDataType>(num_indices);
        let mut_data = data.typed_data_mut::<BehaviorIndexInnerDataType>();
        let mut next_index = 0;
        for i in 0..num_agents {
            let chain = &chains[i];
            for indices in &chain.inner {
                mut_data[next_index] = indices.lang_index();
                mut_data[next_index + 1] = indices.lang_behavior_index();
                next_index += 2;
            }
        }

        // Indices
        let builder = arrow::array::ArrayDataBuilder::new(self.data_types[2].clone());
        let child_data = builder
            .len(num_indices)
            .null_count(0)
            .buffers(vec![data.freeze()])
            .build();

        // Fixed-length lists
        let builder = arrow::array::ArrayDataBuilder::new(self.data_types[1].clone());
        let child_data = builder
            .len(num_behavior_indices)
            .null_count(0)
            .child_data(vec![child_data])
            .build();

        // Variable-length lists
        let builder = arrow::array::ArrayDataBuilder::new(self.data_types[0].clone());
        let data = builder
            .len(num_agents)
            .null_count(0)
            .buffers(vec![offsets.freeze()])
            .add_child_data(child_data)
            .build();

        let column_index = todo!();
        Ok(ArrayChange::new(data, column_index))
    }
}
