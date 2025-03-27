//! Expression nodes for the HashQL Abstract Syntax Tree.
//!
//! This module defines all expression types used in HashQL, a side-effect free, purely
//! functional programming language for querying bi-temporal graphs. The expressions are
//! organized into a hierarchy, with [`Expr`] at the root containing various specific
//! expression kinds represented by the [`ExprKind`] enum.
//!
//! # Special Forms
//!
//! Several expression kinds (`Let`, `Use`, `Input`, `Closure`, `If`, `Field`, `Index`) are
//! implemented as "special forms". Initially, these are parsed as ordinary function calls into the
//! AST. During a subsequent AST transformation phase, these function calls are recognized by their
//! names and expanded into their corresponding specialized AST nodes. For example, a `let`
//! function call is transformed into a dedicated [`LetExpr`] structure in the AST after parsing.
//!
//! # Memory Management
//!
//! The AST is designed to work with arena allocation through the `'heap` lifetime,
//! which references the memory region where nodes are allocated. This approach
//! improves performance by minimizing allocations and deallocations during parsing
//! and evaluation.
//!
//! Unlike other steps, in which the AST is interned in a "real" arena allocator, the AST is using
//! `Box` to manage memory instead. This is important as some of the steps in the AST require that
//! we do not deduplicate nodes yet. This makes each node in the tree larger, but also has the
//! side-effect of easier access of the tree.
//!
//! # Node Identification and Source Location
//!
//! Each expression node has a unique identifier (`id`) that can be used to track the node through
//! various processing stages. Additionally, nodes carry a span identifier (`span`) that points to
//! the location of the expression in the source code, facilitating error reporting and debugging.
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
    call::CallExpr, closure::ClosureExpr, dict::DictExpr, field::FieldExpr, r#if::IfExpr,
    index::IndexExpr, input::InputExpr, r#let::LetExpr, list::ListExpr, literal::LiteralExpr,
    r#struct::StructExpr, tuple::TupleExpr, r#use::UseExpr,
};
use super::{id::NodeId, path::Path};

/// Represents the different kinds of expressions in HashQL.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ExprKind<'heap> {
    /// A function call expression.
    ///
    /// Represents an expression that invokes a function with arguments.
    ///
    /// # Examples
    ///
    /// ```json
    /// ["function", ...<args>, ...<kwargs>]
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
    /// "graph::user::<A, B>"
    /// ```
    Path(Path<'heap>),

    /// A `let` binding expression (special form).
    ///
    /// Binds a value to a name within a scope. This is expanded from a function call
    /// during AST transformation.
    ///
    /// # Examples
    ///
    /// ```json
    /// ["let", <name>, <value>, <body>] // let name = value in body
    /// ```
    Let(LetExpr<'heap>),

    /// A module import expression (special form).
    ///
    /// Imports symbols from another module into the current scope. This is expanded
    /// from a function call during AST transformation.
    ///
    /// ```json
    /// ["use", <path>, {"#struct": {"alice": "bob"}}] // use <path>::{alice as bob}
    /// ```
    Use(UseExpr<'heap>),

    /// An input parameter declaration (special form).
    ///
    /// Declares an input parameter for a function or query. This is expanded
    /// from a function call during AST transformation.
    ///
    /// In effectful languages these are often called the context or requirement of a parameter.
    ///
    /// ## Examples
    ///
    /// ```json
    /// ["input", <name>, <type>, <default>] // input name: type = default
    /// ```
    Input(InputExpr<'heap>),

    /// A closure expression (special form).
    ///
    /// Defines an anonymous function. This is expanded from a function call
    /// during AST transformation.
    ///
    /// ## Examples
    ///
    /// ```json
    /// ["fn", <generics>, <params>, <body>] // fn<generics>(params) => body
    /// ```
    Closure(ClosureExpr<'heap>),

    /// A conditional expression (special form).
    ///
    /// Evaluates a condition and returns one of two expressions based on the result.
    /// This is expanded from a function call during AST transformation.
    ///
    /// ## Examples
    ///
    /// ```json
    /// ["if", <condition>, <then>, <else>] // if condition => then else
    /// ```
    If(IfExpr<'heap>),

    /// A field access expression (special form).
    ///
    /// Accesses a field of a struct or object. This is expanded from a function call
    /// during AST transformation.
    ///
    /// ## Examples
    ///
    /// ```json
    /// "object.field"
    /// [".", <value>, <field>]
    /// ```
    Field(FieldExpr<'heap>),

    /// An indexing expression (special form).
    ///
    /// Accesses an element of a collection by index. This is expanded from a function call
    /// during AST transformation.
    ///
    /// ## Examples
    ///
    /// ```json
    /// "array[index]"
    /// ["[]", <value>, <index>]
    /// ```
    Index(IndexExpr<'heap>),
    // potentially relevant in the future: Ignore (for destructuring assignment, e.g. `_`)
}

/// An expression node in the HashQL Abstract Syntax Tree.
///
/// The `Expr` struct is the fundamental building block of the HashQL AST.
/// It represents any kind of expression in the language and can be composed
/// to form complex expressions. Every expression is allocated on a heap
/// referenced by the `'heap` lifetime.
///
/// Each expression has a unique identifier and a span that points to its
/// location in the source code, which are crucial for error reporting,
/// debugging, and tracking nodes through transformation phases.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Expr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: ExprKind<'heap>,
}
