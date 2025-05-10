use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct List<'heap> {
    pub span: SpanId,

    pub elements: Interned<'heap, [Node<'heap>]>,
}
