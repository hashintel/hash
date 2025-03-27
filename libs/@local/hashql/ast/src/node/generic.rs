use hashql_core::{span::SpanId, symbol::Ident};

use super::{id::NodeId, r#type::Type};
use crate::heap;

// concrete argument / instantiation of a generic type
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GenericArg {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
}

// generic parameter
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GenericParam<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub bound: Option<heap::Box<'heap, Type<'heap>>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Generics<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub params: heap::Box<'heap, [GenericParam<'heap>]>,
}
