use arrow::{array::ArrayData, datatypes::DataType};
use memory::arrow::{new_buffer, ColumnChange};

use crate::simulation::package::state::packages::behavior_execution::{
    BehaviorIndexInnerDataType, DatastoreResult, IntoArrowChange, Result, StateColumn,
};

pub fn reset_index_col(behavior_index_col_index: usize) -> Result<StateColumn> {
    Ok(StateColumn::new(Box::new(ResetIndexCol {
        behavior_index_col_index,
    })))
}

pub struct ResetIndexCol {
    behavior_index_col_index: usize,
}

impl IntoArrowChange for ResetIndexCol {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> DatastoreResult<ColumnChange> {
        let num_agents = range.end - range.start;

        // new_buffer delegates to a method that zeroes the memory so we don't need to initialize
        let data = new_buffer::<BehaviorIndexInnerDataType>(num_agents);

        // Indices
        let data = ArrayData::builder(DataType::Float64)
            .len(num_agents)
            .add_buffer(data.into())
            .build()?;

        Ok(ColumnChange {
            data,
            index: self.behavior_index_col_index,
        })
    }
}
