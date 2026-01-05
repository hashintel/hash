//! Runtime values for the MIR interpreter.
//!
//! This module defines the value representation used during interpretation of
//! MIR code. Values are the runtime counterparts to MIR constants and are
//! produced by evaluating expressions.
//!
//! # Value Types
//!
//! Values are organized into three categories:
//!
//! ## Primitives
//!
//! - [`Value::Unit`] - The unit value (also represents null)
//! - [`Value::Integer`] - Arbitrary-precision integers (also represents booleans)
//! - [`Value::Number`] - Floating-point numbers ([`Num`])
//! - [`Value::String`] - String values ([`Str`])
//! - [`Value::Pointer`] - Function pointers ([`Ptr`])
//!
//! ## Aggregates
//!
//! - [`Value::Struct`] - Named-field structs ([`Struct`])
//! - [`Value::Tuple`] - Positional tuples ([`Tuple`])
//! - [`Value::Opaque`] - Opaque/newtype wrappers ([`Opaque`])
//!
//! ## Collections
//!
//! - [`Value::List`] - Ordered lists ([`List`])
//! - [`Value::Dict`] - Ordered dictionaries ([`Dict`])
//!
//! # Construction
//!
//! Values can be constructed from MIR constants via the [`From<Constant>`]
//! implementation, or directly using each type's constructor methods.

mod dict;
mod list;
mod num;
mod opaque;
mod ptr;
mod str;
mod r#struct;
mod tuple;

use hashql_core::value::Primitive;

pub use self::{
    dict::Dict, list::List, num::Num, opaque::Opaque, ptr::Ptr, str::Str, r#struct::Struct,
    tuple::Tuple,
};
use crate::body::constant::{Constant, Int};

/// A runtime value in the MIR interpreter.
///
/// Represents all possible values that can be produced during interpretation.
/// Values are immutable and use structural sharing (via [`Rc`]) for efficient
/// cloning.
///
/// # Representation Notes
///
/// - Booleans are represented as [`Value::Integer`] (0 = false, 1 = true)
/// - Null is represented as [`Value::Unit`]
/// - Empty tuples should use [`Value::Unit`], not an empty [`Tuple`]
///
/// [`Rc`]: alloc::rc::Rc
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Value<'heap> {
    /// The unit value, also used for null.
    Unit,
    /// An integer value (also represents booleans).
    Integer(Int),
    /// A floating-point number.
    Number(Num),
    /// A string value.
    String(Str<'heap>),
    /// A function pointer.
    Pointer(Ptr),

    /// An opaque/newtype wrapper.
    Opaque(Opaque<'heap>),
    /// A named-field struct.
    Struct(Struct<'heap>),
    /// A positional tuple.
    Tuple(Tuple<'heap>),

    /// An ordered list.
    List(List<'heap>),
    /// An ordered dictionary.
    Dict(Dict<'heap>),
}

impl<'heap> From<Constant<'heap>> for Value<'heap> {
    fn from(value: Constant<'heap>) -> Self {
        match value {
            Constant::Int(int) => Self::Integer(int),
            Constant::Primitive(Primitive::Null) | Constant::Unit => Self::Unit,
            Constant::Primitive(Primitive::Boolean(bool)) => Self::Integer(Int::from(bool)),
            Constant::Primitive(Primitive::Integer(int)) => Self::Integer(Int::from(
                int.as_i128().expect("value should be in i128 range"),
            )),
            Constant::Primitive(Primitive::Float(float)) => Self::Number(Num::from(float)),
            Constant::Primitive(Primitive::String(string)) => Self::String(Str::from(string)),
            Constant::FnPtr(def_id) => Self::Pointer(Ptr::new(def_id)),
        }
    }
}
