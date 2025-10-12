use hashql_core::heap;

use crate::body::operand::Operand;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Return<'heap> {
    pub values: heap::Box<'heap, [Operand<'heap>]>,
}
