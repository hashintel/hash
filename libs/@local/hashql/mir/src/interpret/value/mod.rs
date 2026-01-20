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
//! - [`Value::Number`] - Floating-point numbers
//! - [`Value::String`] - String values
//! - [`Value::Pointer`] - Function pointers
//!
//! ## Aggregates
//!
//! - [`Value::Struct`] - Named-field structs
//! - [`Value::Tuple`] - Positional tuples
//! - [`Value::Opaque`] - Opaque/newtype wrappers
//!
//! ## Collections
//!
//! - [`Value::List`] - Ordered lists
//! - [`Value::Dict`] - Ordered dictionaries

mod dict;
mod int;
mod list;
mod num;
mod opaque;
mod ptr;
mod str;
mod r#struct;
mod tuple;

use alloc::{alloc::Global, borrow::Cow};
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
};

use hashql_core::{symbol::Symbol, value::Primitive};

pub use self::{
    dict::Dict,
    int::{Int, TryFromIntegerError, TryFromPrimitiveError},
    list::List,
    num::{Num, Numeric},
    opaque::Opaque,
    ptr::Ptr,
    str::Str,
    r#struct::Struct,
    tuple::Tuple,
};
use super::error::{RuntimeError, TypeName};
use crate::body::{constant::Constant, place::FieldIndex};

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
/// Values are immutable and use structural sharing.
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

    pub(crate) fn type_name(&self) -> ValueTypeName<'_, 'heap, A> {
        ValueTypeName::from(self)
    }

    const fn type_name_terse(&self) -> &'static str {
        match self {
            Value::Unit => "()",
            Value::Integer(_) => "Integer",
            Value::Number(_) => "Number",
            Value::String(_) => "String",
            Value::Pointer(_) => "Pointer",
            Value::Opaque(_) => "Opaque",
            Value::Struct(_) => "Struct",
            Value::Tuple(_) => "Tuple",
            Value::List(_) => "List",
            Value::Dict(_) => "Dict",
        }
    }

    /// Indexes into this value using another value as the index.
    ///
    /// For lists, the index must be an integer. For dicts, any value can be used as a key.
    /// Returns [`Value::Unit`] if the index is not found.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not subscriptable (not a list or dict),
    /// or if the index type is invalid for the collection type.
    pub fn subscript<'this, 'index>(
        &'this self,
        index: &'index Self,
    ) -> Result<&'this Self, RuntimeError<'heap, A>> {
        match self {
            Self::List(list) if let &Self::Integer(value) = index => {
                Ok(list.get(value).unwrap_or(&Self::UNIT))
            }
            Self::List(_) => Err(RuntimeError::InvalidIndexType {
                base: self.type_name().into(),
                index: index.type_name().into(),
            }),
            Self::Dict(dict) => Ok(dict.get(index).unwrap_or(&Self::UNIT)),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::Struct(_)
            | Self::Tuple(_) => Err(RuntimeError::InvalidSubscriptType {
                base: self.type_name().into(),
            }),
        }
    }

    /// Mutably indexes into this value using another value as the index.
    ///
    /// For lists, returns an error if the index is out of bounds.
    /// For dicts, inserts [`Value::Unit`] if the key is not present.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not subscriptable, if the index type
    /// is invalid, or if a list index is out of bounds.
    pub fn subscript_mut<'this>(
        &'this mut self,
        index: Self,
    ) -> Result<&'this mut Self, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        let terse_name = self.type_name_terse();
        match self {
            Self::List(list) if let Self::Integer(value) = index => {
                let len = list.len();

                list.get_mut(value).ok_or(RuntimeError::OutOfRange {
                    length: len,
                    index: value,
                })
            }
            Self::List(_) => Err(RuntimeError::InvalidIndexType {
                base: TypeName::terse(terse_name),
                index: index.type_name().into(),
            }),
            Self::Dict(dict) => Ok(dict.get_mut(index)),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::Struct(_)
            | Self::Tuple(_) => Err(RuntimeError::InvalidSubscriptType {
                base: TypeName::terse(terse_name),
            }),
        }
    }

    /// Projects a field from this value by index.
    ///
    /// Works on structs and tuples.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not projectable or the field index is invalid.
    pub fn project<'this>(
        &'this self,
        index: FieldIndex,
    ) -> Result<&'this Self, RuntimeError<'heap, A>> {
        match self {
            Self::Struct(r#struct) => {
                r#struct
                    .get_by_index(index)
                    .ok_or_else(|| RuntimeError::UnknownField {
                        base: self.type_name().into(),
                        field: index,
                    })
            }
            Self::Tuple(tuple) => tuple.get(index).ok_or_else(|| RuntimeError::UnknownField {
                base: self.type_name().into(),
                field: index,
            }),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::List(_)
            | Self::Dict(_) => Err(RuntimeError::InvalidProjectionType {
                base: self.type_name().into(),
            }),
        }
    }

    /// Mutably projects a field from this value by index.
    ///
    /// Works on structs and tuples.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not projectable or the field index is invalid.
    pub fn project_mut<'this>(
        &'this mut self,
        index: FieldIndex,
    ) -> Result<&'this mut Self, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        let terse_name = self.type_name_terse();

        match self {
            Self::Struct(r#struct) => {
                r#struct
                    .get_by_index_mut(index)
                    .ok_or_else(|| RuntimeError::UnknownField {
                        base: TypeName::terse(terse_name),
                        field: index,
                    })
            }
            Self::Tuple(tuple) => tuple
                .get_mut(index)
                .ok_or_else(|| RuntimeError::UnknownField {
                    base: TypeName::terse(terse_name),
                    field: index,
                }),
            Self::Unit
            | Self::Integer(_)
            | Self::Number(_)
            | Self::String(_)
            | Self::Pointer(_)
            | Self::Opaque(_)
            | Self::List(_)
            | Self::Dict(_) => Err(RuntimeError::InvalidProjectionType {
                base: self.type_name().into(),
            }),
        }
    }

    /// Projects a field from this value by name.
    ///
    /// Only works on structs.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not a struct or the field name is not found.
    pub fn project_by_name<'this>(
        &'this self,
        index: Symbol<'heap>,
    ) -> Result<&'this Self, RuntimeError<'heap, A>> {
        let Self::Struct(r#struct) = self else {
            return Err(RuntimeError::InvalidProjectionByNameType {
                base: self.type_name().into(),
            });
        };

        r#struct
            .get_by_name(index)
            .ok_or_else(|| RuntimeError::UnknownFieldByName {
                base: self.type_name().into(),
                field: index,
            })
    }

    /// Mutably projects a field from this value by name.
    ///
    /// Only works on structs.
    ///
    /// # Errors
    ///
    /// Returns an error if this value is not a struct or the field name is not found.
    pub fn project_by_name_mut<'this>(
        &'this mut self,
        index: Symbol<'heap>,
    ) -> Result<&'this mut Self, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        let terse_name = self.type_name_terse();
        let Self::Struct(r#struct) = self else {
            return Err(RuntimeError::InvalidProjectionByNameType {
                base: self.type_name().into(),
            });
        };

        if let Some(value) = r#struct.get_by_name_mut(index) {
            return Ok(value);
        }

        Err(RuntimeError::UnknownFieldByName {
            base: TypeName::terse(terse_name),
            field: index,
        })
    }
}

impl<'heap, A: Allocator> From<Constant<'heap>> for Value<'heap, A> {
    fn from(value: Constant<'heap>) -> Self {
        match value {
            Constant::Int(int) => Self::Integer(int),
            Constant::Primitive(Primitive::Null) | Constant::Unit => Self::Unit,
            Constant::Primitive(Primitive::Boolean(bool)) => Self::Integer(Int::from(bool)),
            Constant::Primitive(Primitive::Integer(int)) => int
                .as_i128()
                .map(Int::from)
                .map_or_else(|| Self::Number(Num::from(int.as_f64())), Self::Integer),
            Constant::Primitive(Primitive::Float(float)) => Self::Number(Num::from(float)),
            Constant::Primitive(Primitive::String(string)) => Self::String(Str::from(string)),
            Constant::FnPtr(def_id) => Self::Pointer(Ptr::new(def_id)),
        }
    }
}

impl<A: Allocator> From<Numeric> for Value<'_, A> {
    fn from(value: Numeric) -> Self {
        match value {
            Numeric::Int(int) => Self::Integer(int),
            Numeric::Num(num) => Self::Number(num),
        }
    }
}

impl<A: Allocator> PartialEq for Value<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Integer(this), Self::Integer(other)) => this == other,
            (Self::Number(this), Self::Number(other)) => this == other,

            (Self::Integer(this), Self::Number(other)) => this == other,
            (Self::Number(this), Self::Integer(other)) => this == other,

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

            (Value::Integer(this), Value::Number(other)) => other.cmp_int(this).reverse(),
            (Value::Number(this), Value::Integer(other)) => this.cmp_int(other),

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

impl<A: Allocator> ValueTypeName<'_, '_, A> {
    pub(super) fn into_type_name(self) -> TypeName {
        match self.0 {
            ValueTypeNameInner::Const(value) => TypeName::Static(Cow::Borrowed(value)),
            ValueTypeNameInner::Pointer(ptr) => TypeName::Pointer(ptr),
            ValueTypeNameInner::Opaque(_)
            | ValueTypeNameInner::Struct(_)
            | ValueTypeNameInner::Tuple(_) => TypeName::Static(Cow::Owned(self.to_string())),
        }
    }
}

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
