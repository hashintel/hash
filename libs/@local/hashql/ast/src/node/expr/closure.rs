use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{generic::Generics, id::NodeId, r#type::Type};

/// A parameter declaration for a closure.
///
/// Represents a named parameter with an associated type in a closure's signature.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureParam<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub bound: heap::Box<'heap, Type<'heap>>,
}

/// The signature of a closure.
///
/// Defines the interface of a closure function, including its generic type parameters,
/// input parameters, and return type. The signature provides all type information
/// necessary for type checking and validation of the closure.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureSignature<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub generics: Generics<'heap>,

    pub inputs: heap::Vec<'heap, ClosureParam<'heap>>,
    pub output: heap::Box<'heap, Type<'heap>>,
}

/// A closure expression in the HashQL Abstract Syntax Tree.
///
/// Represents an anonymous function with a signature and a body expression.
/// Closures in HashQL can capture variables from their surrounding scope and
/// may include generic type parameters.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["fn", [], {"#struct", {"x": "Int", "->": "Int"}}, ["*", "x", 2]]
///
/// ["fn", {"#tuple": ["T"]}, {"#struct": {"x": "T", "y": "T", "->": "T"}, ["*", "x", "y"]}]
/// ["fn", {"#struct": {"T": "Int"}}, {"#struct": {"x": "T", "y": "T", "->": "_"}}, ["*", "x", "y"]]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// fn(x: Int): Int => *(x, 2)
///
/// fn<T>(x: T, y: T): T => *(x, y)
/// fn<T: Int>(x: T, y: T): T => *(x, y)
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub signature: heap::Box<'heap, ClosureSignature<'heap>>,
    pub body: heap::Box<'heap, Expr<'heap>>,
}
