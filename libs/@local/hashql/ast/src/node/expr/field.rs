use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::id::NodeId;

/// A field access expression in the HashQL Abstract Syntax Tree.
///
/// Represents accessing a named field from a composite value such as a struct,
/// module, or other container with named fields. Field access expressions are
/// created from the special form syntax and provide direct access to named
/// members of container types.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// [".", "user", "name"]
/// ["user.name"]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// user.name
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FieldExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
    pub field: Ident,
}
