pub mod field;
pub mod index;

use hashql_core::span::SpanId;

use self::{field::FieldAccess, index::IndexAccess};
use super::NodeId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AccessKind<'heap> {
    Field(FieldAccess<'heap>),
    Index(IndexAccess<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Access<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: AccessKind<'heap>,
}
