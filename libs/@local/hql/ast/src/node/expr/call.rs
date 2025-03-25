use hql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{heap::P, node::id::NodeId};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LabeledArgument<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub label: Ident,
    pub value: Argument<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Argument<'heap> {
    // TODO: we might be able to remove these
    pub id: NodeId,
    pub span: SpanId,

    pub value: P<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CallExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub function: P<'heap, Expr<'heap>>,

    pub arguments: P<'heap, Vec<Argument<'heap>>>,
    pub labeled_arguments: P<'heap, Vec<LabeledArgument<'heap>>>,
}
