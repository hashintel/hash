use hashql_core::{heap, id, intern::Interned};

use super::{local::Local, statement::Statement, terminator::Terminator};

id::newtype!(
    /// A unique identifier for a basic block in the HashQL MIR.
    ///
    /// The value space is restricted to `0..=0xFFFF_FF00`, reserving the last 256 for niches.
    pub struct BasicBlockId(u32 is 0..=0xFFFF_FF00)
);

id::newtype_collections!(pub type BasicBlock* from BasicBlockId);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BasicBlock<'heap> {
    pub params: Interned<'heap, [Local]>,

    pub statements: heap::Vec<'heap, Statement<'heap>>,
    pub terminator: Terminator<'heap>,
}
