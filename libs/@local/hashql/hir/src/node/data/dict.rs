use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictField<'heap> {
    pub key: Interned<'heap, Node<'heap>>,
    pub value: Interned<'heap, Node<'heap>>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Dict<'heap> {
    pub span: SpanId,

    pub fields: Interned<'heap, [DictField<'heap>]>,
}
