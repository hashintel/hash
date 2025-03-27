use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LetExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub value: heap::Box<'heap, Expr<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
