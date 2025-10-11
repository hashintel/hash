use hashql_core::{heap::Heap, id::IdVec};

use crate::body::{operand::Operand, place::FieldIndex};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AggregateKind {
    Tuple,
    Struct,

    List,

    /* a dict is still a set of key-value pairs, we just have [key1, value1, key2, value2, ...] */
    Dict,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Aggregate<'heap> {
    pub kind: AggregateKind,
    pub operands: IdVec<FieldIndex, Operand<'heap>, &'heap Heap>,
}
