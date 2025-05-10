use hashql_core::{intern::Interned, span::SpanId, symbol::Ident};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub name: Ident<'heap>,
    pub value: Interned<'heap, Node<'heap>>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Struct<'heap> {
    pub span: SpanId,

    pub fields: Interned<'heap, [StructField<'heap>]>,
}
