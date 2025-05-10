use hashql_core::{intern::Interned, span::SpanId, symbol::Ident};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalVariable<'heap> {
    pub span: SpanId,

    // Generic arguments(?) - should these be included?!
    pub name: Ident<'heap>,
    pub arguments: Interned<'heap, [Node<'heap>]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct QualifiedVariable<'heap> {
    pub span: SpanId,

    pub path: Interned<'heap, [Ident<'heap>]>,
    pub arguments: Interned<'heap, [Node<'heap>]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum VariableKind<'heap> {
    Local(LocalVariable<'heap>),
    Qualified(QualifiedVariable<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Variable<'heap> {
    pub span: SpanId,

    pub kind: VariableKind<'heap>,
}
