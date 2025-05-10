use hashql_core::{intern::Interned, span::SpanId, symbol::Ident, r#type::TypeId};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureSignature<'heap> {
    pub span: SpanId,

    // Always a `ClosureType`
    pub r#type: TypeId,
    // The names of the different parameters, always the same length as the `ClosureType` params
    pub params: Interned<'heap, [Ident<'heap>]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Closure<'heap> {
    pub span: SpanId,

    pub signature: ClosureSignature<'heap>,
    pub body: Interned<'heap, Node<'heap>>,
}
