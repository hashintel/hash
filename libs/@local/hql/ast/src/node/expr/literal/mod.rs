pub mod float;
pub mod integer;
pub mod string;

use hql_core::span::SpanId;

pub use self::{float::FloatLiteral, integer::IntegerLiteral, string::StringLiteral};
use crate::{
    heap::P,
    node::{id::NodeId, r#type::Type},
};

/// Represents the different kinds of literal values in the language.
///
/// Each variant represents a specific type of literal that can appear in expressions.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum LiteralKind {
    /// Represents a null value.
    Null,
    /// Represents a boolean value (true or false).
    Boolean(bool),
    /// Represents a float literal.
    Float(FloatLiteral),
    /// Represents an integer literal.
    Integer(IntegerLiteral),
    /// Represents a string literal.
    String(StringLiteral),
}

/// Represents a literal expression in the concrete syntax tree.
///
/// A literal is a direct representation of a value in the source code, such as
/// numbers, strings, booleans, etc. Each literal has a specific kind and a
/// span that tracks its location in the source code.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LiteralExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: LiteralKind,
    pub r#type: P<'heap, Type<'heap>>,
}
