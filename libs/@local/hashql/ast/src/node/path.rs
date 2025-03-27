use hashql_core::{span::SpanId, symbol::Ident};

use super::{generic::GenericArg, id::NodeId};
use crate::heap;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PathSegment<'heap> {
    pub id: NodeId,

    pub ident: Ident,
    // Type parameters attached to this path
    pub arguments: heap::Box<'heap, [GenericArg]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Path<'heap> {
    pub span: SpanId,

    pub segments: heap::Box<'heap, [PathSegment<'heap>]>,
}
