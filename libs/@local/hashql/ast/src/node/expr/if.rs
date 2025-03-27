use hashql_core::span::SpanId;

use super::Expr;
use crate::{heap, node::id::NodeId};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IfExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub test: heap::Box<'heap, Expr<'heap>>,

    pub then: heap::Box<'heap, Expr<'heap>>,
    pub r#else: Option<heap::Box<'heap, Expr<'heap>>>,
}
