use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// An element in a tuple expression.
///
/// Represents a single value in a tuple, containing the expression that
/// produces the element value.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleElement<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
}

/// A tuple expression in the HashQL Abstract Syntax Tree.
///
/// Represents a fixed-size heterogeneous collection of values that can be accessed
/// by position. Tuples in HashQL can contain elements of different types and
/// support indexed access.
///
/// Unlike lists, tuples have a fixed number of elements known at compile time,
/// and each position can have a distinct type.
///
/// The type is used to optionally assign/assert a specific type to the tuple, but only if the tuple
/// is compatible with the specified type.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#tuple": []}
/// {"#tuple": ["value1", "value2", "value3"]}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// ()
/// (value1, value2, value3)
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub elements: heap::Vec<'heap, TupleElement<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
