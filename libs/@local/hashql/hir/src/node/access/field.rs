use hashql_core::{intern::Interned, span::SpanId, symbol::Symbol};

use crate::node::{Node, NodeId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FieldAccess<'heap> {
    id: NodeId,
    span: SpanId,

    expr: Interned<'heap, Node<'heap>>,
    field: Symbol<'heap>,
}
