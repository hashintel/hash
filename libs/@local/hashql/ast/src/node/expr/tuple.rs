use hashql_core::span::SpanId;

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleElement<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub elements: heap::Box<'heap, [TupleElement<'heap>]>,
    pub r#type: heap::Box<'heap, Type<'heap>>,
}
