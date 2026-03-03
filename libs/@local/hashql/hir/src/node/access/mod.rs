mod field;
mod index;

pub use self::{field::FieldAccess, index::IndexAccess};

/// An access operation node in the HashQL HIR.
///
/// Represents an operation that retrieves a component from a compound data structure,
/// such as accessing a field in a struct or an element in a list or tuple.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Access<'heap> {
    /// Access a named field of a struct or object.
    Field(FieldAccess<'heap>),
    /// Access an element by index in a collection.
    Index(IndexAccess<'heap>),
}
