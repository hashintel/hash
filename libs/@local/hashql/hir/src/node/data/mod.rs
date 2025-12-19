mod dict;
mod list;
mod r#struct;
mod tuple;

use hashql_core::value::Primitive;

pub use self::{
    dict::{Dict, DictField},
    list::List,
    r#struct::{Struct, StructField},
    tuple::Tuple,
};

/// A data value node in the HashQL HIR.
///
/// Represents concrete data values in the program, such as literals, collections,
/// and structured data. Data nodes are immutable after construction and form
/// the basic building blocks for more complex expressions.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Data<'heap> {
    /// A struct value with named fields.
    Struct(Struct<'heap>),
    /// A dictionary with dynamically computed keys.
    Dict(Dict<'heap>),
    /// A tuple with positionally-accessed elements.
    Tuple(Tuple<'heap>),
    /// A homogeneous list of elements.
    List(List<'heap>),
    /// A primitive literal value.
    Primitive(Primitive<'heap>),
}
