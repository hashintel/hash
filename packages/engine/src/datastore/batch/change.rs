use arrow::{array::ArrayData, buffer::Buffer};

use crate::datastore::batch::flush::{GrowableArrayData, GrowableColumn};

/// When a mutable column is modified not in place, the change is
/// recorded in this format
pub struct ColumnChange {
    pub data: ArrayData,
    /// Index of column
    pub index: usize,
}

impl GrowableColumn<ArrayData> for ColumnChange {
    fn column_index(&self) -> usize {
        self.index
    }

    fn data(&self) -> &ArrayData {
        &self.data
    }
}

impl GrowableArrayData for ArrayData {
    fn len(&self) -> usize {
        ArrayData::len(self)
    }

    fn null_count(&self) -> usize {
        ArrayData::null_count(self)
    }

    fn null_buffer(&self) -> Option<&[u8]> {
        ArrayData::null_buffer(self).map(Buffer::as_slice)
    }

    fn buffer(&self, index: usize) -> &[u8] {
        self.buffers()[index].as_slice()
    }

    fn num_buffers_except_null_buffer(&self) -> usize {
        self.buffers().len()
    }

    fn child_data(&self) -> &[Self] {
        ArrayData::child_data(self)
    }
}
