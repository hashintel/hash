use std::sync::Arc;

use arrow::{array, buffer::Buffer as ArrowBuffer};

use super::flush::{GrowableArrayData, GrowableColumn};

/// When a growable column is modified, the change
/// is recorded in this format
pub struct ArrayChange {
    pub array: Arc<array::ArrayData>,
    /// Index of column
    pub index: usize,
}

impl ArrayChange {
    #[tracing::instrument(skip_all)]
    pub fn new(array: Arc<array::ArrayData>, index: usize) -> ArrayChange {
        ArrayChange { array, index }
    }
}

impl GrowableColumn<Arc<array::ArrayData>> for ArrayChange {
    #[tracing::instrument(skip_all)]
    fn get_column_index(&self) -> usize {
        self.index
    }

    #[tracing::instrument(skip_all)]
    fn get_data(&self) -> &Arc<array::ArrayData> {
        &self.array
    }
}

impl GrowableArrayData for Arc<array::ArrayData> {
    #[tracing::instrument(skip_all)]
    fn _len(&self) -> usize {
        self.len()
    }

    #[tracing::instrument(skip_all)]
    fn _null_count(&self) -> usize {
        self.null_count()
    }

    #[tracing::instrument(skip_all)]
    fn _null_buffer(&self) -> Option<&[u8]> {
        self.null_buffer().map(ArrowBuffer::data)
    }

    #[tracing::instrument(skip_all)]
    fn _get_buffer(&self, index: usize) -> &[u8] {
        self.buffers()[index].data()
    }

    #[tracing::instrument(skip_all)]
    fn _child_data(&self) -> &[Self] {
        self.child_data()
    }

    #[tracing::instrument(skip_all)]
    fn _get_non_null_buffer_count(&self) -> usize {
        self.buffers().len()
    }
}
