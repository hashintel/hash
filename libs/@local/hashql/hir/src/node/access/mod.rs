pub mod field;
pub mod index;

use hashql_core::span::SpanId;

use self::{field::FieldAccess, index::IndexAccess};

/// The different kinds of access operations in the HashQL HIR.
///
/// Represents the various ways to access components of compound data structures,
/// either by named field or by indexed position.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AccessKind<'heap> {
    /// Access a named field of a struct or object
    Field(FieldAccess<'heap>),
    /// Access an element by index in a collection
    Index(IndexAccess<'heap>),
}

/// An access operation node in the HashQL HIR.
///
/// Represents an operation that retrieves a component from a compound data structure,
/// such as accessing a field in a struct or an element in a list or tuple.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Access<'heap> {
    pub span: SpanId,

    pub kind: AccessKind<'heap>,
}
