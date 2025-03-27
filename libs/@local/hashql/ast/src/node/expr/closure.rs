use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{
    heap,
    node::{generic::Generics, id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureParam<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub r#type: heap::Box<'heap, Type<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureSig<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub generics: Generics<'heap>,

    pub inputs: heap::Box<'heap, [ClosureParam<'heap>]>,
    pub output: heap::Box<'heap, Type<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub sig: heap::Box<'heap, ClosureSig<'heap>>,
    pub body: heap::Box<'heap, Expr<'heap>>,
}
