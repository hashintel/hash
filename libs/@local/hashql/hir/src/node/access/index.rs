use hashql_core::{intern::Interned, span::SpanId};

use crate::node::{Node, NodeId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IndexAccess<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub expr: Interned<'heap, Node<'heap>>,
    pub index: Interned<'heap, Node<'heap>>,
}
