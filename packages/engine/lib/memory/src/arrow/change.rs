use arrow::array::Array;

use crate::Result;

/// When a mutable column is modified not in place, the change is recorded in this format.
pub struct ColumnChange {
    // todo: this is probably not the right data format
    pub data: Box<dyn Array>,
    /// Index of column
    pub index: usize,
}

pub trait IntoArrowChange {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange>;
}
