use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, r#type::Type},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct InputExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
    pub default: Option<heap::Box<'heap, Expr<'heap>>>,
}
