use hashql_core::{span::SpanId, symbol::Ident};

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, path::Path},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UseBinding {
    pub id: NodeId,
    pub span: SpanId,

    pub ident: Ident,
    pub alias: Option<Ident>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Glob {
    pub id: NodeId,
    pub span: SpanId,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum UseKind<'heap> {
    Named(heap::Box<'heap, [UseBinding]>),
    Glob(Glob),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UseExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub path: Path<'heap>,
    pub kind: UseKind<'heap>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
