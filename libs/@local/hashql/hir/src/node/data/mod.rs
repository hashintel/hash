pub mod dict;
pub mod list;
pub mod literal;
pub mod r#struct;
pub mod tuple;

use hashql_core::span::SpanId;

pub use self::{dict::Dict, list::List, literal::Literal, r#struct::Struct, tuple::Tuple};

/// The different kinds of data values in the HashQL HIR.
///
/// This enum represents the various types of concrete data that can exist in the HIR.
/// These are fundamental building blocks that represent structured data and literal values.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataKind<'heap> {
    /// A struct value with named fields
    Struct(Struct<'heap>),
    /// A dictionary with dynamically computed keys
    Dict(Dict<'heap>, !),
    /// A tuple with positionally-accessed elements
    Tuple(Tuple<'heap>),
    /// A homogeneous list of elements
    List(List<'heap>, !),
    /// A primitive literal value
    Literal(Literal<'heap>),
}

/// A data value node in the HashQL HIR.
///
/// Represents concrete data values in the program, such as literals, collections,
/// and structured data. Data nodes are immutable after construction and form
/// the basic building blocks for more complex expressions.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Data<'heap> {
    pub span: SpanId,

    pub kind: DataKind<'heap>,
}
