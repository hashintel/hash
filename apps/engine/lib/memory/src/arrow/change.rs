use arrow2::array::Array;

use crate::{arrow::flush::GrowableColumn, Result};

/// When a mutable column is modified (but not in-place) we record the change using this struct.
pub struct ColumnChange {
    pub data: Box<dyn Array>,
    /// Index of column
    pub index: usize,
}

impl GrowableColumn<Box<dyn Array>> for ColumnChange {
    fn index(&self) -> usize {
        self.index
    }

    fn data(&self) -> &Box<dyn Array> {
        &self.data
    }
}

pub trait IntoArrowChange {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange>;
}
