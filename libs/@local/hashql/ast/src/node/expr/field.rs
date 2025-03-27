use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{heap, node::id::NodeId};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FieldExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
    pub field: Ident,
}
