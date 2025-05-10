use hashql_core::{intern::Interned, span::SpanId, symbol::Symbol};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Let<'heap> {
    pub span: SpanId,

    pub name: Symbol<'heap>,
    pub value: Interned<'heap, Node<'heap>>,

    pub body: Interned<'heap, Node<'heap>>,
}
