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

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
};

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

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum ValueDiscriminant {
    Unit,
    Integer,
    Number,
    String,
    List,
    Dict,
    Pointer,
    Opaque,
    Struct,
    Tuple,
}

impl ValueDiscriminant {
    #[inline]
    const fn new<A: Allocator>(value: &Value<'_, A>) -> Self {
        match value {
            Value::Unit => Self::Unit,
            Value::Integer(_) => Self::Integer,
            Value::Number(_) => Self::Number,
            Value::String(_) => Self::String,
            Value::List(_) => Self::List,
            Value::Dict(_) => Self::Dict,
            Value::Pointer(_) => Self::Pointer,
            Value::Opaque(_) => Self::Opaque,
            Value::Struct(_) => Self::Struct,
            Value::Tuple(_) => Self::Tuple,
        }
    }
}

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
#[derive(Debug, Clone)]
pub enum Value<'heap, A: Allocator = Global> {
    /// The unit value.
    Unit,
    /// An integer value (also represents booleans).
    Integer(Int),
    /// A floating-point number.
    Number(Num),
    /// A string value.
    String(Str<'heap, A>),
    /// A function pointer.
    Pointer(Ptr),

    /// An opaque/newtype wrapper.
    Opaque(Opaque<'heap, A>),
    /// A named-field struct.
    Struct(Struct<'heap, A>),
    /// A positional tuple.
    Tuple(Tuple<'heap, A>),

    /// An ordered list.
    List(List<'heap, A>),
    /// An ordered dictionary.
    Dict(Dict<'heap, A>),
}

impl<'heap, A: Allocator> Value<'heap, A> {
    const UNIT: Self = Self::Unit;

    fn type_name(&self) -> ValueTypeName<'_, 'heap, A> {
        ValueTypeName::from(self)
    }

    pub fn subscript<'this, 'index>(
        &'this self,
        index: &'index Self,
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap, A>> {
        match self {
            Self::List(list) if let &Self::Integer(value) = index => {
                Ok(list.get(value).unwrap_or(&Self::UNIT))
            }
            Self::List(_) => Err(RuntimeError::InvalidIndexType(
                self.type_name(),
                index.type_name(),
            )),
            Self::Dict(dict) => Ok(dict.get(index).unwrap_or(&Self::UNIT)),
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
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap, A>> {
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
    ) -> Result<&'this Self, RuntimeError<'this, 'index, 'heap, A>> {
        let Self::Struct(r#struct) = self else {
            return Err(RuntimeError::InvalidProjectionType(self.type_name()));
        };

        r#struct
            .get_by_name(index)
            .ok_or_else(|| RuntimeError::UnknownFieldByName(self.type_name(), index))
    }
}

impl<'heap, A: Allocator> From<Constant<'heap>> for Value<'heap, A> {
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

impl<A: Allocator> PartialEq for Value<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Integer(this), Self::Integer(other)) => this == other,
            (Self::Number(this), Self::Number(other)) => this == other,
            (Self::String(this), Self::String(other)) => this == other,
            (Self::Pointer(this), Self::Pointer(other)) => this == other,
            (Self::Opaque(this), Self::Opaque(other)) => this == other,
            (Self::Struct(this), Self::Struct(other)) => this == other,
            (Self::Tuple(this), Self::Tuple(other)) => this == other,
            (Self::List(this), Self::List(other)) => this == other,
            (Self::Dict(this), Self::Dict(other)) => this == other,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

impl<A: Allocator> Eq for Value<'_, A> {}

impl<A: Allocator> PartialOrd for Value<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Value<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let self_discr = ValueDiscriminant::new(self);
        let other_discr = ValueDiscriminant::new(other);

        match (self, other) {
            (Value::Integer(this), Value::Integer(other)) => this.cmp(other),
            (Value::Number(this), Value::Number(other)) => this.cmp(other),
            (Value::String(this), Value::String(other)) => this.cmp(other),
            (Value::Pointer(this), Value::Pointer(other)) => this.cmp(other),
            (Value::Opaque(this), Value::Opaque(other)) => this.cmp(other),
            (Value::Struct(this), Value::Struct(other)) => this.cmp(other),
            (Value::Tuple(this), Value::Tuple(other)) => this.cmp(other),
            (Value::List(this), Value::List(other)) => this.cmp(other),
            (Value::Dict(this), Value::Dict(other)) => this.cmp(other),
            _ => self_discr.cmp(&other_discr),
        }
    }
}

#[derive(Debug, Copy, Clone)]
enum ValueTypeNameInner<'value, 'heap, A: Allocator> {
    Const(&'static str),
    Pointer(Ptr),
    Opaque(&'value Opaque<'heap, A>),
    Struct(&'value Struct<'heap, A>),
    Tuple(&'value Tuple<'heap, A>),
}

impl<A: Allocator> Display for ValueTypeNameInner<'_, '_, A> {
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
pub struct ValueTypeName<'value, 'heap, A: Allocator>(ValueTypeNameInner<'value, 'heap, A>);

impl<A: Allocator> Display for ValueTypeName<'_, '_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(fmt)
    }
}

impl<'value, 'heap, A: Allocator> From<&'value Value<'heap, A>>
    for ValueTypeName<'value, 'heap, A>
{
    fn from(value: &'value Value<'heap, A>) -> Self {
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
