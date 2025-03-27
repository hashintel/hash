use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{heap, node::id::NodeId};

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

    pub value: heap::Box<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CallExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub function: heap::Box<'heap, Expr<'heap>>,

    pub arguments: heap::Box<'heap, Vec<Argument<'heap>>>,
    pub labeled_arguments: heap::Box<'heap, Vec<LabeledArgument<'heap>>>,
}
