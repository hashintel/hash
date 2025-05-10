use hashql_core::{intern::Interned, span::SpanId, symbol::Symbol};

use crate::node::Node;

/// A field access operation in the HashQL HIR.
///
/// Represents accessing a named field from a composite value such as a struct or tuple.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FieldAccess<'heap> {
    pub span: SpanId,

    pub expr: Interned<'heap, Node<'heap>>,
    pub field: Symbol<'heap>,
}
