use arrow::datatypes::DataType;

use super::*;
use crate::datastore::arrow::batch_conversion::new_buffer;

#[tracing::instrument(skip_all)]
pub fn reset_index_col(behavior_index_col_index: usize) -> Result<StateColumn> {
    Ok(StateColumn::new(Box::new(ResetIndexCol {
        behavior_index_col_index,
    })))
}

pub struct ResetIndexCol {
    behavior_index_col_index: usize,
}

impl IntoArrowChange for ResetIndexCol {
    #[tracing::instrument(skip_all)]
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ArrayChange> {
        let num_agents = range.end - range.start;

        // new_buffer delegates to a method that zeroes the memory so we don't need to initialize
        let data = new_buffer::<BehaviorIndexInnerDataType>(num_agents);

        // Indices
        let builder = arrow::array::ArrayDataBuilder::new(DataType::Float64);
        let data = builder
            .len(num_agents)
            .null_count(0)
            .buffers(vec![data.freeze()])
            .build();

        Ok(ArrayChange::new(data, self.behavior_index_col_index))
    }
}
