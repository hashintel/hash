use hashql_core::{
    heap::Heap,
    id::{self, IdVec},
};

use crate::body::operand::Operand;

id::newtype!(
    pub struct ArgIndex(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Apply<'heap> {
    pub function: Operand<'heap>,
    pub arguments: IdVec<ArgIndex, Operand<'heap>, &'heap Heap>,
}
