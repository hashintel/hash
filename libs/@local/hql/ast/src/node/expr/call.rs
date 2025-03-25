use hql_span::SpanId;
use hql_symbol::Ident;

use super::Expr;
use crate::heap::P;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LabeledArgument<'heap> {
    pub label: Ident,
    pub value: Argument<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Argument<'heap> {
    pub value: P<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CallExpr<'heap> {
    pub span: SpanId,

    pub function: P<'heap, Expr<'heap>>,

    pub arguments: P<'heap, Vec<Argument<'heap>>>,
    pub labeled_arguments: P<'heap, Vec<LabeledArgument<'heap>>>,
}
