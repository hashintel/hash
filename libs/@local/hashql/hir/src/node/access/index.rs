use hashql_core::{intern::Interned, span::SpanId};

use crate::node::{Node, NodeId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IndexAccess<'heap> {
    id: NodeId,
    span: SpanId,

    expr: Interned<'heap, Node<'heap>>,
    index: Interned<'heap, Node<'heap>>,
}
