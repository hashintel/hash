use hashql_core::span::SpanId;

use super::Expr;
use crate::{heap, node::id::NodeId};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IndexExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
    pub index: heap::Box<'heap, Expr<'heap>>,
}
