use hashql_core::{heap::Heap, id::IdVec, symbol::Symbol};

use crate::{
    body::{operand::Operand, place::FieldIndex},
    def::DefId,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AggregateKind<'heap> {
    Tuple,
    Struct,

    List,
    /* a dict is still a set of key-value pairs, we just have [key1, value1, key2, value2, ...] */
    Dict,

    Opaque(Symbol<'heap>), /* `Symbol` is the name of the opaque, operands is of length `1` and
                            * refers to the inner data. */
    Closure(DefId), /* operands is of length `1` and refers to the variable that captures the
                     * environment */
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Aggregate<'heap> {
    pub kind: AggregateKind<'heap>,
    pub operands: IdVec<FieldIndex, Operand<'heap>, &'heap Heap>,
}
