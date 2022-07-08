//! Utilities. In many cases these act as a sort-of "compatibility" layer to support
//! our migration from `arrow` to `arrow2`.

pub mod msg;

use arrow::array::ArrayRef;

// todo: extract into file
pub struct StringBuilder {}

impl StringBuilder {
    pub fn new(capacity: usize) -> StringBuilder {
        todo!()
    }

    pub fn append_value(&mut self, _string: &str) -> crate::Result<()> {
        todo!()
    }

    pub fn finish(&self) -> ArrayRef {
        todo!()
    }
}
