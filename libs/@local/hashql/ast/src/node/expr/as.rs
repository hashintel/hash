use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A type assertion expression in the HashQL Abstract Syntax Tree.
///
/// Represents an `as` expression that performs type ascription, asserting at compile time that a
/// value can be widened to a specified type. Unlike type guards which would validate at runtime,
/// type ascription helps enforce static type safety within the language.
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
