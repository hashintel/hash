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

use core::{
    borrow::Borrow,
    fmt::{self, Display},
    ops::Index,
};

use hashql_core::{symbol::Symbol, value::Primitive};

pub use self::{
    dict::Dict, list::List, num::Num, opaque::Opaque, ptr::Ptr, str::Str, r#struct::Struct,
    tuple::Tuple,
};
use self::{opaque::OpaqueRef, str::StrRef};
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

impl<'heap> Borrow<ValueRef<'_, 'heap>> for Value<'heap> {
    fn borrow(&self) -> &ValueRef<'_, 'heap> {
        todo!()
    }
}

impl<'heap> Value<'heap> {
    pub const fn as_ref(&self) -> ValueRef<'_, 'heap> {
        match self {
            Value::Unit => ValueRef::Unit,
            &Value::Integer(int) => ValueRef::Integer(int),
            &Value::Number(num) => ValueRef::Number(num),
            Value::String(str) => ValueRef::String(str.as_ref()),
            &Value::Pointer(ptr) => ValueRef::Pointer(ptr),
            Value::Opaque(opaque) => ValueRef::Opaque(opaque.as_ref()),
            Value::Struct(r#struct) => ValueRef::Struct(r#struct),
            Value::Tuple(tuple) => ValueRef::Tuple(tuple),
            Value::List(list) => ValueRef::List(list),
            Value::Dict(dict) => ValueRef::Dict(dict),
        }
    }

    fn type_name(&self) -> ValueTypeName<'_, 'heap> {
        ValueTypeName::from(self)
    }

    // pub fn subscript<'this>(&'this self, index: ValueRef<'_, 'heap>) -> ValueRef<'_, 'heap> {
    //     match self {
    //         Self::List(list) => match index {
    //             ValueRef::Integer(int) => list
    //                 .get(int)
    //                 .map_or_else(|| Cow::Owned(Self::Unit), Cow::Borrowed),
    //             _ => todo!("diagnostic: cannot index list with non-integer index"),
    //         },
    //         Self::Dict(dict) => dict
    //             .get(index)
    //             .map_or_else(|| Cow::Owned(Self::Unit), Cow::Borrowed),
    //         _ => todo!("diagnostic: cannot index non-list/dict value"),
    //     }
    // }
}

impl<'heap> Index<Symbol<'heap>> for Value<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: Symbol<'heap>) -> &Self::Output {
        let Self::Struct(r#struct) = self else {
            todo!("diagnostic: cannot index non-struct value");
        };

        &r#struct[index]
    }
}

impl<'heap> Index<FieldIndex> for Value<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: FieldIndex) -> &Self::Output {
        match self {
            Self::Struct(r#struct) => &r#struct[index],
            Self::Tuple(tuple) => &tuple[index],
            _ => todo!("diagnostic: cannot index non-struct or non-tuple value"),
        }
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ValueRef<'value, 'heap> {
    /// The unit value.
    Unit,
    /// An integer value (also represents booleans).
    Integer(Int),
    /// A floating-point number.
    Number(Num),
    /// A string value.
    String(StrRef<'value, 'heap>),
    /// A function pointer.
    Pointer(Ptr),

    /// An opaque/newtype wrapper.
    Opaque(OpaqueRef<'value, 'heap>),
    /// A named-field struct.
    Struct(&'value Struct<'heap>),
    /// A positional tuple.
    Tuple(&'value Tuple<'heap>),

    /// An ordered list.
    List(&'value List<'heap>),
    /// An ordered dictionary.
    Dict(&'value Dict<'heap>),
}

impl<'value, 'heap> ValueRef<'value, 'heap> {
    fn type_name(&self) -> ValueTypeName<'value, 'heap> {
        ValueTypeName::from(self)
    }
}

impl<'value, 'heap> ValueRef<'value, 'heap> {
    pub fn into_owned(self) -> Value<'heap> {
        match self {
            ValueRef::Unit => Value::Unit,
            ValueRef::Integer(int) => Value::Integer(int),
            ValueRef::Number(num) => Value::Number(num),
            ValueRef::String(str) => Value::String(str.into_owned()),
            ValueRef::Pointer(ptr) => Value::Pointer(ptr),
            ValueRef::Opaque(opaque) => Value::Opaque(opaque.into_owned()),
            ValueRef::Struct(r#struct) => Value::Struct(r#struct.clone()),
            ValueRef::Tuple(tuple) => Value::Tuple(tuple.clone()),
            ValueRef::List(list) => Value::List(list.clone()),
            ValueRef::Dict(dict) => Value::Dict(dict.clone()),
        }
    }

    pub fn subscript(&self, index: &Self) -> Result<Self, RuntimeError<'value, 'heap>> {
        match self {
            ValueRef::List(list) if let &Self::Integer(value) = index => {
                Ok(list.get(value).unwrap_or(Self::Unit))
            }
            ValueRef::List(_) => Err(RuntimeError::InvalidIndexType(
                self.type_name(),
                index.type_name(),
            )),
            ValueRef::Dict(dict) => Ok(dict.get(index).unwrap_or(Self::Unit)),
            ValueRef::Unit
            | ValueRef::Integer(_)
            | ValueRef::Number(_)
            | ValueRef::String(_)
            | ValueRef::Pointer(_)
            | ValueRef::Opaque(_)
            | ValueRef::Struct(_)
            | ValueRef::Tuple(_) => Err(RuntimeError::InvalidSubscriptType(self.type_name())),
        }
    }
}

#[derive(Debug, Copy, Clone)]
enum ValueTypeNameInner<'value, 'heap> {
    Const(&'static str),
    Pointer(Ptr),
    Opaque(OpaqueRef<'value, 'heap>),
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

impl<'value, 'heap> From<&ValueRef<'value, 'heap>> for ValueTypeName<'value, 'heap> {
    fn from(value: &ValueRef<'value, 'heap>) -> Self {
        match value {
            ValueRef::Unit => Self(ValueTypeNameInner::Const("()")),
            ValueRef::Integer(_) => Self(ValueTypeNameInner::Const("Integer")),
            ValueRef::Number(_) => Self(ValueTypeNameInner::Const("Number")),
            ValueRef::String(_) => Self(ValueTypeNameInner::Const("String")),
            &ValueRef::Pointer(ptr) => Self(ValueTypeNameInner::Pointer(ptr)),
            &ValueRef::Opaque(opaque) => Self(ValueTypeNameInner::Opaque(opaque)),
            ValueRef::Struct(r#struct) => Self(ValueTypeNameInner::Struct(r#struct)),
            ValueRef::Tuple(tuple) => Self(ValueTypeNameInner::Tuple(tuple)),
            ValueRef::List(_) => Self(ValueTypeNameInner::Const("List")),
            ValueRef::Dict(_) => Self(ValueTypeNameInner::Const("Dict")),
        }
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
            Value::Opaque(opaque) => Self(ValueTypeNameInner::Opaque(opaque.as_ref())),
            Value::Struct(r#struct) => Self(ValueTypeNameInner::Struct(r#struct)),
            Value::Tuple(tuple) => Self(ValueTypeNameInner::Tuple(tuple)),
            Value::List(_) => Self(ValueTypeNameInner::Const("List")),
            Value::Dict(_) => Self(ValueTypeNameInner::Const("Dict")),
        }
    }
}
