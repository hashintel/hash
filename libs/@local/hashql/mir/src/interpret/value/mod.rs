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

use core::fmt::{self, Display};

use hashql_core::{symbol::Symbol, value::Primitive};

pub(crate) use self::{
    dict::Dict, list::List, num::Num, opaque::Opaque, ptr::Ptr, str::Str, r#struct::Struct,
    tuple::Tuple,
};
use super::error::RuntimeError;
use crate::body::{
    constant::{Constant, Int},
    place::FieldIndex,
};

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
    /// The unit value.
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

const UNIT_REF: &Value<'_> = &Value::Unit;

impl<'heap> Value<'heap> {
    fn type_name(&self) -> ValueTypeName<'_, 'heap> {
        ValueTypeName::from(self)
    }

    pub fn subscript<'this, 'index>(
        &'this self,
        index: &'index Self,
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap>> {
        match self {
            Self::List(list) if let &Self::Integer(value) = index => {
                Ok(list.get(value).unwrap_or(UNIT_REF))
            }
            Self::List(_) => Err(RuntimeError::InvalidIndexType(
                self.type_name(),
                index.type_name(),
            )),
            Self::Dict(dict) => Ok(dict.get(index).unwrap_or(UNIT_REF)),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::Struct(_)
            | Self::Tuple(_) => Err(RuntimeError::InvalidSubscriptType(self.type_name())),
        }
    }

    pub fn project<'this, 'index>(
        &'this self,
        index: FieldIndex,
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap>> {
        match self {
            Self::Struct(r#struct) => r#struct
                .get_by_index(index)
                .ok_or_else(|| RuntimeError::UnknownField(self.type_name(), index)),
            Self::Tuple(tuple) => tuple
                .get(index)
                .ok_or_else(|| RuntimeError::UnknownField(self.type_name(), index)),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::List(_)
            | Self::Dict(_) => Err(RuntimeError::InvalidProjectionType(self.type_name())),
        }
    }

    pub fn project_by_name<'this, 'index>(
        &'this self,
        index: Symbol<'heap>,
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap>> {
        let Self::Struct(r#struct) = self else {
            return Err(RuntimeError::InvalidProjectionType(self.type_name()));
        };

        r#struct
            .get_by_name(index)
            .ok_or_else(|| RuntimeError::UnknownFieldByName(self.type_name(), index))
    }
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

#[derive(Debug, Copy, Clone)]
enum ValueTypeNameInner<'value, 'heap> {
    Const(&'static str),
    Pointer(Ptr),
    Opaque(&'value Opaque<'heap>),
    Struct(&'value Struct<'heap>),
    Tuple(&'value Tuple<'heap>),
}

impl Display for ValueTypeNameInner<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Const(value) => fmt.write_str(value),
            Self::Pointer(ptr) => write!(fmt, "*{}", ptr.def()),
            Self::Opaque(opaque) => Display::fmt(&opaque.type_name(), fmt),
            Self::Struct(r#struct) => Display::fmt(&r#struct.type_name(), fmt),
            Self::Tuple(tuple) => Display::fmt(&tuple.type_name(), fmt),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub struct ValueTypeName<'value, 'heap>(ValueTypeNameInner<'value, 'heap>);

impl Display for ValueTypeName<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(fmt)
    }
}

impl<'value, 'heap> From<&'value Value<'heap>> for ValueTypeName<'value, 'heap> {
    fn from(value: &'value Value<'heap>) -> Self {
        match value {
            Value::Unit => Self(ValueTypeNameInner::Const("()")),
            Value::Integer(_) => Self(ValueTypeNameInner::Const("Integer")),
            Value::Number(_) => Self(ValueTypeNameInner::Const("Number")),
            Value::String(_) => Self(ValueTypeNameInner::Const("String")),
            &Value::Pointer(ptr) => Self(ValueTypeNameInner::Pointer(ptr)),
            Value::Opaque(opaque) => Self(ValueTypeNameInner::Opaque(opaque)),
            Value::Struct(r#struct) => Self(ValueTypeNameInner::Struct(r#struct)),
            Value::Tuple(tuple) => Self(ValueTypeNameInner::Tuple(tuple)),
            Value::List(_) => Self(ValueTypeNameInner::Const("List")),
            Value::Dict(_) => Self(ValueTypeNameInner::Const("Dict")),
        }
    }
}
