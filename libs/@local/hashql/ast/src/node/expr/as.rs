use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A type assertion expression in the HashQL Abstract Syntax Tree.
///
/// Represents an `as` expression that checks at compile time whether a value conforms to a
/// specified type. Type assertions help enforce type safety within the language
/// and can be used for type narrowing in pattern matching contexts.
///
/// The expression evaluates to a boolean value indicating whether the checked value
/// matches the specified type.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["as", "value", "String"]
/// ["as", ["get", "data", "field"], {"#type": {"name": "String", "age": "Int"}}]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// value as String
/// value as {name: String, age: Int}
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AsExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
    pub r#type: heap::Box<'heap, Type<'heap>>,
}
