use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::id::NodeId;

/// A conditional expression in the HashQL Abstract Syntax Tree.
///
/// Represents an if-then-else expression that evaluates a test condition
/// and selects between two alternative expressions based on the result.
/// If the condition evaluates to true, the "then" expression is evaluated;
/// otherwise, the "else" expression is evaluated if present.
///
/// The "else" branch is optional. When absent, the return value of the expression is wrapped in
/// `Option`, with the value being `None` if the condition is false.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["if", [">", "x", 0], "positive", "non_positive"]
/// ["if", "has_permission", ["perform_action"]]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// if x > 0
///     then positive
///     else non_positive
///
/// if has_permission
///     then perform_action()
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IfExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub test: heap::Box<'heap, Expr<'heap>>,

    pub then: heap::Box<'heap, Expr<'heap>>,
    pub r#else: Option<heap::Box<'heap, Expr<'heap>>>,
}
