pub mod call;
pub mod closure;
pub mod dict;
pub mod field;
pub mod r#if;
pub mod index;
pub mod input;
pub mod r#let;
pub mod list;
pub mod literal;
pub mod r#struct;
pub mod tuple;
pub mod r#use;

use hashql_core::span::SpanId;

pub use self::{
    call::CallExpr, dict::DictExpr, list::ListExpr, literal::LiteralExpr, r#struct::StructExpr,
    tuple::TupleExpr,
};
use self::{
    closure::ClosureExpr, field::FieldExpr, r#if::IfExpr, index::IndexExpr, input::InputExpr,
    r#let::LetExpr, r#use::UseExpr,
};
use super::{id::NodeId, path::Path};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ExprKind<'heap> {
    /// A function call expression.
    ///
    /// Represents an expression that invokes a function with arguments.
    ///
    /// # Examples
    ///
    /// ```json
    /// ["function", "arg1", "arg2", {":arg3": "arg3"}, {":arg4": "arg4"}]
    /// ```
    Call(CallExpr<'heap>),
    /// A struct instantiation expression.
    ///
    /// Creates a new anonymous struct instance with the specified fields.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#struct": {"field1": "value1", "field2": "value2"}}
    /// ```
    Struct(StructExpr<'heap>),
    /// A dictionary expression.
    ///
    /// Creates a dictionary with key-value pairs.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#dict": {"key1": "value1", "key2": "value2"}}
    /// ```
    Dict(DictExpr<'heap>),
    /// A tuple expression.
    ///
    /// Creates a tuple with multiple values.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#tuple": ["value1", "value2", "value3"]}
    /// ```
    Tuple(TupleExpr<'heap>),
    /// A list expression.
    ///
    /// Creates a list containing multiple elements.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#list": ["value1", "value2", "value3"]}
    /// ```
    List(ListExpr<'heap>),
    /// A literal expression.
    ///
    /// Represents a constant value like a number, string, or boolean.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#literal": 123}
    /// {"#literal": "hello"}
    /// {"#literal": true}
    /// {"#literal": null}
    /// ```
    Literal(LiteralExpr<'heap>),
    /// A variable reference expression.
    ///
    /// References a variable or qualified path in the scope.
    ///
    /// # Examples
    ///
    /// ```json
    /// "graph::user::name"
    /// ```
    Path(Path<'heap>),

    // Special Forms (expanded from normal function calls
    Let(LetExpr<'heap>),
    Use(UseExpr<'heap>),
    Input(InputExpr<'heap>),
    Closure(ClosureExpr<'heap>),
    If(IfExpr<'heap>),
    Field(FieldExpr<'heap>),
    Index(IndexExpr<'heap>),
    // potentially relevant in the future: Ignore (for destructuring assignment, e.g. `_`)
}

/// An expression node in the CST.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Expr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: ExprKind<'heap>,
}
