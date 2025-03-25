use hql_core::span::SpanId;

use super::Expr;
use crate::{
    heap::P,
    node::{id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListElement<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: P<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub elements: P<'heap, [ListElement<'heap>]>,
    pub r#type: P<'heap, Type<'heap>>,
}
