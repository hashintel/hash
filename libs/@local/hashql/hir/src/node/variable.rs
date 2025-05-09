use hashql_core::{intern::Interned, span::SpanId, symbol::Ident};

use super::{Node, NodeId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalVariable<'heap> {
    id: NodeId,
    span: SpanId,

    // Generic arguments(?) - should these be included?!
    name: Ident<'heap>,
    arguments: Interned<'heap, [Node<'heap>]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GlobalVariable<'heap> {
    id: NodeId,
    span: SpanId,

    path: Interned<'heap, [Ident<'heap>]>,
    arguments: Interned<'heap, [Node<'heap>]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum VariableKind<'heap> {
    Local(LocalVariable<'heap>),
    Global(GlobalVariable<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Variable<'heap> {
    id: NodeId,
    span: SpanId,

    kind: VariableKind<'heap>,
}
