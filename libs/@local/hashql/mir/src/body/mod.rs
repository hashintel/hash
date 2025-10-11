use hashql_core::heap::Heap;

use self::basic_block::{BasicBlock, BasicBlockId, BasicBlockVec};

pub mod basic_block;
pub mod constant;
pub mod local;
pub mod operand;
pub mod place;
pub mod rvalue;
pub mod statement;
pub mod terminator;

pub struct Body<'heap> {
    pub basic_blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    pub entry_block: BasicBlockId,
}
