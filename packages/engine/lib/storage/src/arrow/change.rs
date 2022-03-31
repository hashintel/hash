use arrow::array::ArrayData;

use crate::arrow::flush::GrowableColumn;

/// When a mutable column is modified not in place, the change is recorded in this format.
pub struct ColumnChange {
    pub data: ArrayData,
    /// Index of column
    pub index: usize,
}

impl GrowableColumn<ArrayData> for ColumnChange {
    fn index(&self) -> usize {
        self.index
    }

    fn data(&self) -> &ArrayData {
        &self.data
    }
}
