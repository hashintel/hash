use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::id::NodeId;

/// An argument passed to a function call.
///
/// Represents a positional argument in a function call expression, containing
/// the expression that produces the argument value.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["add", "x", ["+", "y", "1"]]
/// ```
///
/// For this function call, there are two `Argument` instances:
/// - One for the expression `x`
/// - One for the expression `+(y, 1)`
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Argument<'heap> {
    // TODO: we might be able to remove these
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
}

/// A labeled (named) argument passed to a function call.
///
/// Represents a keyword argument in a function call expression, combining
/// a label (parameter name) with an argument value. Labeled arguments allow
/// for more explicit parameter binding and can be passed in any order.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["add", {":x": 1, ":y": 2}, {":z": 3}]
/// ```
///
/// For this function call, there are three `LabeledArgument` instances:
/// - One for the label `:x` with the value `1`
/// - One for the label `:y` with the value `2`
/// - One for the label `:z` with the value `3`
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LabeledArgument<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub label: Ident,
    pub value: Argument<'heap>,
}

/// A function call expression in the HashQL Abstract Syntax Tree.
///
/// Represents an invocation of a function with both positional and labeled arguments.
/// The function to be called can be any expression that evaluates to a callable value,
/// including variable references, field accesses, or other complex expressions.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// // Positional arguments only
/// ["add", 1, 2]
///
/// // Labeled arguments only
/// ["add", {":name": "Alice"}, {":age": 30}]
///
/// // Mix of positional and labeled arguments
/// ["format", 42, {":width": 10}, {":precision": 2}]
///
/// // Advanced function call
/// ["let", "func", ["if", "condition", "fn1", "fn2"],
///     ["func", "value"]
/// ]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// add(1, 2)
/// add(alice: "Alice", age: 30)
/// format("Hello, {name}!", name: "Alice")
///
/// let func = if condition then fn1 else fn2 in
/// func(value)
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CallExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub function: heap::Box<'heap, Expr<'heap>>,

    pub arguments: heap::Vec<'heap, Argument<'heap>>,
    pub labeled_arguments: heap::Vec<'heap, LabeledArgument<'heap>>,
}
