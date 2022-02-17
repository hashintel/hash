use arrow::datatypes::DataType;

use super::*;
use crate::datastore::arrow::batch_conversion::new_buffer;

pub fn reset_index_col(behavior_index_col_index: usize) -> Result<StateColumn> {
    Ok(StateColumn::new(Box::new(ResetIndexCol {
        behavior_index_col_index,
    })))
}

pub struct ResetIndexCol {
    behavior_index_col_index: usize,
}

impl IntoArrowChange for ResetIndexCol {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ArrayChange> {
        let num_agents = range.end - range.start;

        // new_buffer delegates to a method that zeroes the memory so we don't need to initialize
        let data = new_buffer::<BehaviorIndexInnerDataType>(num_agents);

        // Indices
        let builder = arrow::array::ArrayDataBuilder::new(DataType::Float64);
        let data = builder.len(num_agents).buffers(vec![data.into()]).build();

        Ok(ArrayChange::new(data, self.behavior_index_col_index))
    }
}
