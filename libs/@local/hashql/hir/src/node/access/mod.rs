pub mod field;
pub mod index;

use hashql_core::span::SpanId;

use self::{field::FieldAccess, index::IndexAccess};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AccessKind<'heap> {
    Field(FieldAccess<'heap>),
    Index(IndexAccess<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Access<'heap> {
    pub span: SpanId,

    pub kind: AccessKind<'heap>,
}
