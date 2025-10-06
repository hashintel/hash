use hashql_core::intern::Interned;

use crate::node::Node;

/// A list expression in the HashQL HIR.
///
/// Represents a homogeneous collection of values that can be accessed by index.
/// Lists in HashQL contain elements of a uniform type and support indexed access.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct List<'heap> {
    pub elements: Interned<'heap, [Node<'heap>]>,
}
