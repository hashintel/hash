use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A variable binding expression in the HashQL Abstract Syntax Tree.
///
/// Represents a `let` expression that binds a value to a name within a lexical scope.
/// The binding is only visible within the body expression and creates a new variable
/// that can be referenced by name.
///
/// Variable bindings can optionally include a type annotation. When provided, the type
/// is used for type checking to ensure the bound value is compatible with the specified type.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["let", "x", 42, <body>]
/// ["let", "x", "Int", 42, <body>]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// let x = 42 in <body>
/// let x: Int = 42 in <body>
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LetExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub value: heap::Box<'heap, Expr<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
