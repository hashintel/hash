use hql_span::SpanId;

use super::Expr;
use crate::{Spanned, heap::P, node::ident::Ident};

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
    pub function: P<'heap, Expr<'heap>>,

    pub arguments: P<'heap, Vec<Argument<'heap>>>,
    pub labeled_arguments: P<'heap, Vec<LabeledArgument<'heap>>>,

    pub span: SpanId,
}

impl Spanned for CallExpr<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}
