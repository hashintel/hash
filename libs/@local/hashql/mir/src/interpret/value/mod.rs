// Value v2, now even better™

use alloc::rc::Rc;
use core::cmp;

use hashql_core::{
    intern::Interned,
    symbol::Symbol,
    value::{Float, Primitive, String},
};
use imbl::shared_ptr::RcK;

use crate::{
    body::constant::{Constant, Int},
    def::DefId,
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Value<'heap> {
    // Primitives
    Unit,
    Integer(Int), // boolean no longer exists, null is unit
    Number(Num),
    String(Str<'heap>),
    Pointer(Ptr),

    // Aggregates
    Opaque(Opaque<'heap>),
    Struct(Struct<'heap>),
    Tuple(Tuple<'heap>),

    // Collections
    List(List<'heap>),
    Dict(Dict<'heap>),
}

impl<'heap> From<Constant<'heap>> for Value<'heap> {
    fn from(value: Constant<'heap>) -> Self {
        match value {
            Constant::Int(int) => Value::Integer(int),
            Constant::Primitive(Primitive::Null) | Constant::Unit => Value::Unit,
            Constant::Primitive(Primitive::Boolean(bool)) => Value::Integer(Int::from(bool)),
            Constant::Primitive(Primitive::Integer(int)) => Value::Integer(Int::from(
                int.as_i128().expect("value should be in i128 range"),
            )),
            Constant::Primitive(Primitive::Float(float)) => Value::Number(Num::from(float)),
            Constant::Primitive(Primitive::String(string)) => Value::String(Str::from(string)),
            Constant::FnPtr(def_id) => Value::Pointer(Ptr::new(def_id)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct List<'heap> {
    inner: imbl::GenericVector<Value<'heap>, RcK>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Dict<'heap> {
    inner: imbl::GenericOrdMap<Value<'heap>, Value<'heap>, RcK>,
}

#[derive(Debug, Copy, Clone)]
struct Num {
    value: f64, // For now no arbitrary precision
}

impl<'heap> From<Float<'heap>> for Num {
    fn from(value: Float<'heap>) -> Self {
        Self {
            value: value.as_f64(),
        }
    }
}

impl PartialEq for Num {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for Num {}

impl PartialOrd for Num {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Num {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.value.total_cmp(&other.value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Ptr {
    value: DefId,
}

impl Ptr {
    fn new(value: DefId) -> Self {
        Self { value }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum StrInner<'heap> {
    Owned(Rc<str>),
    Borrowed(Symbol<'heap>),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Str<'heap> {
    inner: StrInner<'heap>,
}

impl<'heap> From<String<'heap>> for Str<'heap> {
    fn from(value: String<'heap>) -> Self {
        Self {
            inner: StrInner::Borrowed(value.as_symbol()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Struct<'heap> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap>]>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Tuple<'heap> {
    values: Rc<[Value<'heap>]>, // MUST BE NON-EMPTY, otherwise it's a Unit
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Opaque<'heap> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap>>,
}
