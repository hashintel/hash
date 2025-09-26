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
//!
//! # Frontend
//!
//! While the AST itself is frontend-independent, the examples shown in this documentation use
//! `JExpr`, which is a JSON-based syntax for HashQL. Other frontends may be added in the future,
//! all mapping to this same core AST structure.
pub mod r#as;
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
pub mod newtype;
pub mod r#struct;
pub mod tuple;
pub mod r#type;
pub mod r#use;

use hashql_core::span::SpanId;

pub use self::{
    r#as::AsExpr, call::CallExpr, closure::ClosureExpr, dict::DictExpr, field::FieldExpr,
    r#if::IfExpr, index::IndexExpr, input::InputExpr, r#let::LetExpr, list::ListExpr,
    literal::LiteralExpr, newtype::NewTypeExpr, r#struct::StructExpr, tuple::TupleExpr,
    r#type::TypeExpr, r#use::UseExpr,
};
use super::{id::NodeId, path::Path};

/// Represents the different kinds of expressions in HashQL.
///
/// This enum defines all the various expression types that can appear in a HashQL program.
/// Each variant corresponds to a specific language construct and contains the detailed
/// representation of that construct in the AST.
///
/// The examples below demonstrate the `JExpr` syntax (JSON-based frontend), as well as a fictional
/// "documentation syntax" (used for readability) for each expression kind. Remember that these are
/// just frontend representations - the AST itself is independent of any particular syntax.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ExprKind<'heap> {
    /// A function call expression.
    ///
    /// Represents an expression that invokes a function with arguments.
    /// Arguments can be positional or labeled (keyword arguments).
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
    Call(CallExpr<'heap>),

    /// A struct instantiation expression.
    ///
    /// Creates a new anonymous struct instance with the specified fields.
    /// In HashQL, structs are heterogeneous collections of named fields with associated values.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// {"#struct": {"field1": "value1", "field2": "value2"}}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// (field1: value1, field2: value2)
    /// ```
    Struct(StructExpr<'heap>),

    /// A dictionary expression.
    ///
    /// Creates a dictionary (map) with key-value pairs. Unlike structs,
    /// dictionaries have dynamically computed keys and support lookups,
    /// but their values must be of a homogeneous type.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// {"#dict": {"key1": "value1", "key2": "value2"}}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// {"key1": value1, "key2": value2}
    /// ```
    Dict(DictExpr<'heap>),

    /// A tuple expression.
    ///
    /// Creates a tuple with multiple values. Tuples in HashQL are
    /// fixed-size heterogeneous collections accessed by position.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// {"#tuple": ["value1", "value2", "value3"]}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// (value1, value2, value3)
    /// ```
    Tuple(TupleExpr<'heap>),

    /// A list expression.
    ///
    /// Creates a list containing multiple elements. Lists in HashQL are
    /// homogeneous collections of values that can be accessed by index.
    ///
    /// # Examples
    ///
    /// ```json
    /// {"#list": ["value1", "value2", "value3"]}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// [value1, value2, value3]
    /// ```
    List(ListExpr<'heap>),

    /// A literal expression.
    ///
    /// Represents a constant value like a number, string, boolean, or null.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// {"#literal": 123}
    /// {"#literal": "hello"}
    /// {"#literal": true}
    /// {"#literal": null}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// 123
    /// "hello"
    /// true
    /// null
    /// ```
    Literal(LiteralExpr<'heap>),

    /// A variable reference expression.
    ///
    /// References a variable or qualified path.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// "variable_name"
    /// "graph::user::name"
    /// "graph::user<A, B>"
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// variable_name
    /// graph::user::name
    /// graph::user<A, B>
    /// ```
    Path(Path<'heap>),

    /// A `let` binding expression (special form).
    ///
    /// Binds a value to a name within a scope. This is expanded from a function call
    /// during AST transformation. In HashQL, `let` expressions create lexically
    /// scoped bindings visible within the body expression.
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
    Let(LetExpr<'heap>),

    /// A type definition expression (special form).
    ///
    /// Defines a type alias within a scope. This is expanded from a function call
    /// during AST transformation. In HashQL, type expressions allow creating named
    /// references to complex types.
    /// These types use structural typing, meaning two types are considered equivalent
    /// if they have the same structure, regardless of their names.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["type", "UserId", "String", <body>]
    /// ["type", "Point", {"#type": {"x": "Float", "y": "Float"}}, <body>]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// type UserId = String in <body>
    /// type Point = {x: Float, y: Float} in <body>
    /// ```
    Type(TypeExpr<'heap>),

    /// A new type definition expression (special form).
    ///
    /// Creates a new distinct type based on an existing type. This is expanded
    /// from a function call during AST transformation. Unlike type aliases (created with
    /// the `type` expression), new types are not interchangeable with their underlying
    /// type.
    ///
    /// When defining a new type, a constructor function of the same name is generated automatically
    /// and brought into scope.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["newtype", "UserId", "String", <body>]
    /// ["newtype", "Coordinates", {"#type": {"lat": "Float", "lng": "Float"}}, <body>]
    ///
    /// ["newtype", "AccountId", "String"
    ///     ["AccountId", {"#literal": "1234"}]
    /// ]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// newtype UserId = String in <body>
    /// newtype Coordinates = {lat: Float, lng: Float} in <body>
    ///
    /// newtype AccountId = String in
    ///     AccountId("1234")
    /// ```
    NewType(NewTypeExpr<'heap>),

    /// A module import expression (special form).
    ///
    /// Imports symbols from another module into the current scope. This is expanded
    /// from a function call during AST transformation. HashQL supports selective
    /// imports with optional renaming.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["use", "path::to::module", {"#struct": {"item1": "_", "original": "renamed"}}, <body>]
    /// ["use", "path::to::module", {"#tuple": ["item1", "original"]}, <body>]
    /// ["use", "path::to::module", "*", <body>]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// use path::to::module::{item1, original as renamed} in <body>
    /// use path::to::module::{item1, original} in <body>
    /// use path::to::module::* in <body>
    /// ```
    Use(UseExpr<'heap>),

    /// An input parameter declaration (special form).
    ///
    /// Declares an input parameter for a function or query. This is expanded
    /// from a function call during AST transformation. In HashQL, inputs
    /// represent the external values that can be provided to a query.
    ///
    /// In effectful languages these are often called the context or requirements.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["input", "limit", "Int"]
    /// ["input", "limit", "Int", 10]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// input(limit, Int)
    /// input(limit, Int, 10)
    /// ```
    Input(InputExpr<'heap>),

    /// A closure expression (special form).
    ///
    /// Defines an anonymous function. This is expanded from a function call
    /// during AST transformation. In HashQL, closures can capture variables
    /// from their surrounding scope.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["fn", [], {"#struct": {"x": "Int"}}, "Int", ["*", "x", 2]]
    ///
    /// ["fn", {"#tuple": ["T"]}, {"#struct": {"x": "T", "y": "T"}}, "T", ["*", "x", "y"]]
    /// ["fn", {"#struct": {"T": "Int"}}, {"#struct": {"x": "T", "y": "T"}}, "_", ["*", "x", "y"]]
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
    Closure(ClosureExpr<'heap>),

    /// A conditional expression (special form).
    ///
    /// Evaluates a condition and returns one of two expressions based on the result.
    /// This is expanded from a function call during AST transformation.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["if", [">", "x", 0], "positive", "non_positive"]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// if x > 0
    ///     then positive
    ///     else non_positive
    /// ```
    If(IfExpr<'heap>),

    /// A field access expression (special form).
    ///
    /// Accesses a field of a struct or tuple. This is expanded from a function call
    /// during AST transformation.
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
    Field(FieldExpr<'heap>),

    /// An indexing expression (special form).
    ///
    /// Accesses an element of a collection by index. This is expanded from a function call
    /// during AST transformation. Indexing works with lists, tuples, structs, dictionaries and
    /// other indexed collections in HashQL.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// ["[]", "items", 0]
    /// ["items[0]"]
    /// ["matrix[i][j]"]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// items[0]
    /// matrix[i][j]
    /// ```
    Index(IndexExpr<'heap>),

    /// A type assertion expression (special form).
    ///
    /// Checks at compile time whether a value conforms to a specified type.
    /// This is useful for type narrowing and ensuring type safety in patterns
    /// where the compiler needs additional type information.
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
    /// get(data, field) as {name: String, age: Int}
    /// ```
    As(AsExpr<'heap>),

    /// The underscore expression, used as a placeholder in various contexts.
    ///
    /// In HashQL, the underscore serves as a context-dependent placeholder that can indicate
    /// type inference, function generic bounds, or same-name imports.
    ///
    /// # Examples
    ///
    /// ## J-Expr
    ///
    /// ```json
    /// // Type inference in function return type
    /// ["fn", {"#tuple": []}, {"#struct": {"name": "String"}}, "_", ["body"]]
    ///
    /// // No bounds for a generic
    /// ["fn", {"#struct": {"A": "_"}}, {"#struct": {"name": "A"}}, "Integer", ["body"]]
    ///
    /// // Same-name import in struct pattern
    /// ["use", "module", {"#struct": {"name": "_"}}, "body"]
    ///
    /// // Same-name import in tuple pattern
    /// ["use", "module", {"#tuple": ["name"]}, "body"]
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// fn(): _ => body
    /// use module::{name: _} in body
    /// use module::{name} in body
    /// ```
    Underscore,

    /// A placeholder expression used exclusively during AST transformation phases.
    ///
    /// The `Dummy` variant serves as a temporary placeholder during the lowering process when an
    /// expression's `ExprKind` needs to be extracted or replaced. It allows the lowering pass to
    /// safely move out the contents of an expression without immediately providing a replacement.
    ///
    /// # Implementation Note
    ///
    /// This variant should never appear in a fully processed AST, as it's intended only as an
    /// intermediate state during transformation. Any `Dummy` nodes still present after lowering
    /// indicates an error in the transformation process, and will produce a compilation error on
    /// lowering into the HIR.
    Dummy,
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

impl Expr<'_> {
    pub(crate) const fn dummy() -> Self {
        Self {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind: ExprKind::Dummy,
        }
    }
}
