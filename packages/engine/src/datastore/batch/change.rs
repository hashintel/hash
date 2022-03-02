use arrow::{array::ArrayData, buffer::Buffer};

use super::flush::{GrowableArrayData, GrowableColumn};

/// When a growable column is modified, the change is recorded in this format.
pub struct ArrayChange {
    pub array: ArrayData,
    /// Index of column
    pub index: usize,
}

impl ArrayChange {
    pub fn new(array: ArrayData, index: usize) -> ArrayChange {
        ArrayChange { array, index }
    }
}

impl GrowableColumn<ArrayData> for ArrayChange {
    fn get_column_index(&self) -> usize {
        self.index
    }

    fn get_data(&self) -> &ArrayData {
        &self.array
    }
}

impl GrowableArrayData for ArrayData {
    fn _len(&self) -> usize {
        self.len()
    }

    fn _null_count(&self) -> usize {
        self.null_count()
    }

    fn _null_buffer(&self) -> Option<&[u8]> {
        self.null_buffer().map(Buffer::as_slice)
    }

    fn _get_buffer(&self, index: usize) -> &[u8] {
        self.buffers()[index].as_slice()
    }

    fn _get_non_null_buffer_count(&self) -> usize {
        self.buffers().len()
    }

    fn _child_data(&self) -> &[Self] {
        self.child_data()
    }
}
