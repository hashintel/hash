use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{generic::GenericConstraint, id::NodeId, r#type::Type};

/// A type alias definition expression in the HashQL Abstract Syntax Tree.
///
/// Represents a `type` declaration that creates a named alias for an existing type.
///
/// Unlike newtypes, type aliases are completely interchangeable with their
/// underlying types in the type system - they are just alternative names for
/// the same type.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["type", "UserId", "String", <body>]
/// ["type", "Point", {"#type": {"x": "Float", "y": "Float"}}, <body>]
/// ["type", "Point<T>", {"#type": {"x": "T", "y": "T"}}, <body>]
/// ["type", "Point<T: Number>", {"#type": {"x": "T", "y": "T"}}, <body>]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// type UserId = String in <body>
/// type Point = {x: Float, y: Float} in <body>
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TypeExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub constraints: heap::Vec<'heap, GenericConstraint<'heap>>,

    pub value: heap::Box<'heap, Type<'heap>>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
