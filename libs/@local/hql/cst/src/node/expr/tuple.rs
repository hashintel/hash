use hql_span::SpanId;

use super::Expr;
use crate::{heap::P, node::r#type::Type};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleElement<'heap> {
    pub span: SpanId,

    pub value: P<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleExpr<'heap> {
    pub span: SpanId,

    pub elements: P<'heap, [TupleElement<'heap>]>,
    pub r#type: P<'heap, Type<'heap>>,
}
