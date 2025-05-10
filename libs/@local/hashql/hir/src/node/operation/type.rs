use hashql_core::{intern::Interned, span::SpanId, r#type::TypeId};

use crate::node::Node;

// There's a fundamental difference between a type assertion and type constructor, a type
// constructor is a function, while a type assertion is just that - an assertion about the
// compatability of a type, you can always narrow the type, but if you force than the type is
// automatically set to that type.

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeAssertion<'heap> {
    pub span: SpanId,

    pub value: Interned<'heap, Node<'heap>>,
    pub r#type: TypeId,

    pub force: bool,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeConstructor<'heap> {
    pub span: SpanId,

    pub value: Interned<'heap, Node<'heap>>,
    pub r#type: TypeId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeOperationKind<'heap> {
    Assertion(TypeAssertion<'heap>),
    Constructor(TypeConstructor<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeOperation<'heap> {
    pub span: SpanId,

    pub kind: TypeOperationKind<'heap>,
}
