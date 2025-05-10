use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Tuple<'heap> {
    pub span: SpanId,

    pub fields: Interned<'heap, [Node<'heap>]>,
}
