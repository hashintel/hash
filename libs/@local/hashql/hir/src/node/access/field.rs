use hashql_core::{intern::Interned, span::SpanId, symbol::Symbol};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FieldAccess<'heap> {
    pub span: SpanId,

    pub expr: Interned<'heap, Node<'heap>>,
    pub field: Symbol<'heap>,
}
