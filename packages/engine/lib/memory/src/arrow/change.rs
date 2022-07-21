use arrow::array::ArrayRef;

use crate::{arrow::flush::GrowableColumn, Result};

/// When a mutable column is modified (but not in-place) we record the change using this struct.
pub struct ColumnChange {
    pub data: ArrayRef,
    /// Index of column
    pub index: usize,
}

impl GrowableColumn<ArrayRef> for ColumnChange {
    fn index(&self) -> usize {
        self.index
    }

    fn data(&self) -> &ArrayRef {
        &self.data
    }
}

pub trait IntoArrowChange {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange>;
}
