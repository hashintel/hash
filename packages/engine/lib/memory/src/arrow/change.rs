use arrow2::array::Array;

use crate::Result;

/// When a mutable column is modified (but not in-place) we record the change using this struct.
#[derive(Debug)]
pub struct ColumnChange {
    pub data: Box<dyn Array>,
    /// Index of column
    pub index: usize,
}

impl ColumnChange {
    pub fn data<'a>(&'a self) -> &'a Box<dyn Array> {
        &self.data
    }
}

pub trait IntoArrowChange {
    fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange>;
}
