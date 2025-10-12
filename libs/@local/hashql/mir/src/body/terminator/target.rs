use hashql_core::intern::Interned;

use crate::body::{basic_block::BasicBlockId, operand::Operand};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Target<'heap> {
    pub block: BasicBlockId,
    pub args: Interned<'heap, [Operand<'heap>]>,
}
