use hashql_core::heap;

use crate::body::{basic_block::BasicBlockId, operand::Operand, place::Place};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Call<'heap> {
    pub func: Operand<'heap>,
    pub args: heap::Box<'heap, [Operand<'heap>]>,
    pub destination: Place<'heap>,
    pub target: BasicBlockId,
}
