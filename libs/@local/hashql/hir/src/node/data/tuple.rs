use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

/// A tuple expression in the HashQL HIR.
///
/// Represents a fixed-size heterogeneous collection of values that can be accessed
/// by position. Tuples in HashQL can contain elements of different types and
/// support indexed access.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Tuple<'heap> {
    pub span: SpanId,

    pub fields: Interned<'heap, [Node<'heap>]>,
}
