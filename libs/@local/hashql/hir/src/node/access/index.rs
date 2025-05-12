use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

/// An indexing operation in the HashQL HIR.
///
/// Represents accessing an element from a collection by its index or key.
/// Indexing works with various collection types such as lists and dictionaries.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IndexAccess<'heap> {
    pub span: SpanId,

    pub expr: Interned<'heap, Node<'heap>>,
    pub index: Interned<'heap, Node<'heap>>,
}
