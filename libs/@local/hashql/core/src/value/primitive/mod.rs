//! Literal value representations for the HashQL language.
//!
//! This module provides representations for all literal types that can appear in
//! HashQL source code. Each literal type preserves its original textual representation
//! to maintain precision and avoid data loss during parsing and manipulation.
//!
//! The literals in this module adhere to the JSON specification (RFC 8259) for
//! their string representation and provide convenient conversion methods to standard
//! Rust types when needed.
//!
//! # Design
//!
//! All literal types in this module:
//! - Preserve the exact textual representation from the source
//! - Store their values as interned symbols
//! - Provide conversion methods to standard Rust primitive types
//! - Handle potential precision and overflow concerns
//!
//! # Examples
//!
//! Using integer literals:
//! ```
//! # use hashql_core::{heap::Heap, value::Integer};
//! # let heap = Heap::new();
//! let int_literal = Integer::new_unchecked(heap.intern_symbol("42"));
//!
//! assert_eq!(int_literal.as_i32(), Some(42));
//! assert_eq!(int_literal.as_f64(), 42.0);
//! ```
//!
//! Using float literals:
//! ```
//! # use hashql_core::{heap::Heap, value::Float};
//! # let heap = Heap::new();
//! let float_literal = Float::new_unchecked(heap.intern_symbol("3.14159"));
//!
//! assert!((float_literal.as_f64() - 3.14159).abs() < f64::EPSILON);
//! ```
//!
//! # Provided Types
//!
//! - [`Primitive`]: An enum representing all possible primitive kinds
//! - [`Integer`]: Representation of integer literals
//! - [`Float`]: Representation of floating-point literals
//! - [`String`]: Representation of string literals
use core::{fmt, fmt::Display};

pub use self::{float::Float, integer::Integer, string::String};

mod float;
mod integer;
mod string;

/// Represents the different kinds of literal values in the language.
///
/// Each variant represents a specific type of literal that can appear in expressions.
/// Literals are constant values that are directly expressed in the source code
/// rather than being computed at runtime.
#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub enum Primitive<'heap> {
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
    Float(Float<'heap>),

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
    Integer(Integer<'heap>),

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
    String(String<'heap>),
}

impl Display for Primitive<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Primitive::Null => fmt.write_str("null"),
            Primitive::Boolean(true) => fmt.write_str("true"),
            Primitive::Boolean(false) => fmt.write_str("false"),
            Primitive::Float(float) => {
                fmt.write_str("\"")?;
                Display::fmt(&float.as_symbol(), fmt)?;
                fmt.write_str("\"")
            }
            Primitive::Integer(integer) => Display::fmt(&integer.as_symbol(), fmt),
            Primitive::String(string) => Display::fmt(&string.as_symbol(), fmt),
        }
    }
}
