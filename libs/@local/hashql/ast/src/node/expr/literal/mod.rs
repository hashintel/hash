pub mod float;
pub mod integer;
pub mod string;

use hashql_core::{heap, span::SpanId};

pub use self::{float::FloatLiteral, integer::IntegerLiteral, string::StringLiteral};
use crate::node::{id::NodeId, r#type::Type};

/// Represents the different kinds of literal values in the language.
///
/// Each variant represents a specific type of literal that can appear in expressions.
/// Literals are constant values that are directly expressed in the source code
/// rather than being computed at runtime.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum LiteralKind {
    /// Represents a null value.
    ///
    /// The null literal represents the absence of a value or an undefined state.
    ///
    /// ## Examples
    ///
    /// ### J-Expr
    ///
    /// ```json
    /// {"#literal": null}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// null
    /// ```
    Null,

    /// Represents a boolean value (true or false).
    ///
    /// Boolean literals are the fundamental values of logical expressions.
    ///
    /// ## Examples
    ///
    /// ### J-Expr
    ///
    /// ```json
    /// {"#literal": true}
    /// {"#literal": false}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// true
    /// false
    /// ```
    Boolean(bool),

    /// Represents a floating-point number literal.
    ///
    /// Float literals represent numbers with decimal points or in scientific notation.
    /// The literal's value is preserved as a string to maintain floating-point precision.
    ///
    /// ## Examples
    ///
    /// ### J-Expr
    ///
    /// ```json
    /// {"#literal": 3.14}
    /// {"#literal": 1e-3}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// 3.14
    /// 1e-3
    /// ```
    Float(FloatLiteral),

    /// Represents an integer literal.
    ///
    /// Integer literals represent whole numbers without a decimal point.
    /// The literal's value is preserved as a string to maintain integer precision.
    ///
    /// ## Examples
    ///
    /// ### J-Expr
    ///
    /// ```json
    /// {"#literal": 123}
    /// {"#literal": -456}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// 123
    /// -456
    /// ```
    Integer(IntegerLiteral),

    /// Represents a string literal.
    ///
    /// String literals represent sequences of characters enclosed in quotation marks.
    ///
    /// ## Examples
    ///
    /// ### J-Expr
    ///
    /// ```json
    /// {"#literal": "hello"}
    /// {"#literal": "world"}
    /// ```
    ///
    /// ## Documentation Format
    ///
    /// ```text
    /// "hello"
    /// "world"
    /// ```
    String(StringLiteral),
}

/// A literal expression in the HashQL Abstract Syntax Tree.
///
/// Represents a constant value directly expressed in the source code.
/// Literals are the most basic form of expressions and produce a value
/// without any computation.
///
/// Each literal has a type that describes its data type in the type system,
/// which is used for type checking and inference.
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
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LiteralExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: LiteralKind,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
