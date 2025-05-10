use hashql_core::{intern::Interned, span::SpanId, symbol::Ident, r#type::TypeId};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Input<'heap> {
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub r#type: TypeId,
    pub default: Option<Interned<'heap, Node<'heap>>>,
}
