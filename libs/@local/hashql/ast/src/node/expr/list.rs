use hashql_core::span::SpanId;

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListElement<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub elements: heap::Box<'heap, [ListElement<'heap>]>,
    pub r#type: heap::Box<'heap, Type<'heap>>,
}
