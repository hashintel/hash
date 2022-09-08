use arrow2::array::PrimitiveArray;
use memory::arrow::{new_buffer, ColumnChange, IntoArrowChange};
use stateful::state::StateColumn;

use crate::{package::simulation::state::behavior_execution::BehaviorIndexInnerDataType, Result};

pub fn reset_index_col(behavior_index_col_index: usize) -> Result<StateColumn> {
    Ok(StateColumn::new(Box::new(ResetIndexCol {
        behavior_index_col_index,
    })))
}

/// This struct resets the value of the behavior index column to the first behavior in the behavior
/// list.
pub struct ResetIndexCol {
    behavior_index_col_index: usize,
}

impl IntoArrowChange for ResetIndexCol {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> memory::Result<ColumnChange> {
        let num_agents = range.end - range.start;

        // new_buffer delegates to a method that zeroes the memory so we don't need to initialize
        let data = new_buffer::<BehaviorIndexInnerDataType>(num_agents);

        // Indices
        let data = PrimitiveArray::<BehaviorIndexInnerDataType>::from_vec(data).boxed();

        Ok(ColumnChange {
            data,
            index: self.behavior_index_col_index,
        })
    }
}
