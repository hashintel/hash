use alloc::{collections::BTreeMap, sync::Arc};
use core::{alloc::Allocator, num::FpCategory};

use hashql_core::id::Id as _;
use hashql_mir::interpret::value::{Int, Num, Ptr, Value};
use serde::Serialize as _;

fn serialize_int<S: serde::Serializer>(int: &Int, serializer: S) -> Result<S::Ok, S::Error> {
    int.as_int().serialize(serializer)
}

#[expect(clippy::trivially_copy_pass_by_ref)]
fn serialize_num<S: serde::Serializer>(num: &Num, serializer: S) -> Result<S::Ok, S::Error> {
    let value = num.as_f64();
    match value.classify() {
        FpCategory::Infinite if value.is_sign_negative() => "-inf".serialize(serializer),
        FpCategory::Infinite => "inf".serialize(serializer),
        FpCategory::Nan => "nan".serialize(serializer),
        FpCategory::Zero | FpCategory::Subnormal | FpCategory::Normal => {
            value.serialize(serializer)
        }
    }
}

#[expect(clippy::trivially_copy_pass_by_ref)]
fn serialize_ptr<S: serde::Serializer>(ptr: &Ptr, serializer: S) -> Result<S::Ok, S::Error> {
    ptr.def().as_u32().serialize(serializer)
}

fn serialize_dict<S: serde::Serializer>(
    dict: &BTreeMap<OwnedValue, OwnedValue>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_seq(dict)
}

// This is only here until https://linear.app/hash/issue/BE-540/hashql-register-based-bytecode-vm
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
pub(crate) enum OwnedValue {
    /// The unit value.
    Unit,
    /// An integer value (also represents booleans).
    Integer(#[serde(serialize_with = "serialize_int")] Int),
    /// A floating-point number.
    Number(#[serde(serialize_with = "serialize_num")] Num),
    /// A string value.
    String(Arc<str>),
    /// A function pointer.
    Pointer(#[serde(serialize_with = "serialize_ptr")] Ptr),

    /// An opaque/newtype wrapper.
    Opaque(Arc<str>, Box<Self>),
    /// A named-field struct.
    Struct(Vec<(Arc<str>, Self)>),
    /// A positional tuple.
    Tuple(Vec<Self>),
    /// An ordered list.
    List(Vec<Self>),
    /// An ordered dictionary.
    Dict(#[serde(serialize_with = "serialize_dict")] BTreeMap<Self, Self>),
}

impl<'heap, A: Allocator + Clone> From<Value<'heap, A>> for OwnedValue {
    fn from(value: Value<'heap, A>) -> Self {
        match value {
            Value::Unit => Self::Unit,
            Value::Integer(int) => Self::Integer(int),
            Value::Number(num) => Self::Number(num),
            Value::String(str) => Self::String(Arc::from(str.as_str())),
            Value::Pointer(ptr) => Self::Pointer(ptr),
            Value::Opaque(opaque) => Self::Opaque(
                Arc::from(opaque.name().as_str()),
                Box::new(opaque.into_value().into()),
            ),
            Value::Struct(r#struct) => {
                debug_assert_eq!(r#struct.fields().len(), r#struct.values().len());

                Self::Struct(
                    r#struct
                        .fields()
                        .iter()
                        .zip(r#struct.values())
                        .map(|(field, value)| {
                            (Arc::from(field.as_str()), Self::from(value.clone()))
                        })
                        .collect(),
                )
            }
            Value::Tuple(tuple) => Self::Tuple(
                tuple
                    .values()
                    .iter()
                    .map(|value| Self::from(value.clone()))
                    .collect(),
            ),
            Value::List(list) => {
                Self::List(list.iter().map(|value| Self::from(value.clone())).collect())
            }
            Value::Dict(dict) => Self::Dict(
                dict.iter()
                    .map(|(key, value)| (Self::from(key.clone()), Self::from(value.clone())))
                    .collect(),
            ),
        }
    }
}

fn is_string(value: &OwnedValue) -> bool {
    match value {
        OwnedValue::String(_) => true,
        OwnedValue::Opaque(_, opaque) => is_string(opaque),
        OwnedValue::Unit
        | OwnedValue::Integer(_)
        | OwnedValue::Number(_)
        | OwnedValue::Pointer(_)
        | OwnedValue::Struct(_)
        | OwnedValue::Tuple(_)
        | OwnedValue::List(_)
        | OwnedValue::Dict(_) => false,
    }
}

#[derive(Copy, Clone)]
pub(crate) struct JsonValueSerialize<'value>(pub &'value OwnedValue);

impl serde::Serialize for JsonValueSerialize<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self.0 {
            OwnedValue::Unit => serializer.serialize_unit(),
            OwnedValue::Integer(int) => serialize_int(int, serializer),
            OwnedValue::Number(num) => serialize_num(num, serializer),
            OwnedValue::String(str) => serde::Serialize::serialize(str.as_ref(), serializer),
            OwnedValue::Pointer(ptr) => serialize_ptr(ptr, serializer),
            OwnedValue::Opaque(_, owned_value) => {
                serde::Serialize::serialize(&Self(owned_value), serializer)
            }
            OwnedValue::Struct(items) => {
                serializer.collect_map(items.iter().map(|(key, value)| (key, Self(value))))
            }
            OwnedValue::Tuple(owned_values) => {
                serializer.collect_seq(owned_values.iter().map(Self))
            }
            OwnedValue::List(owned_values) => serializer.collect_seq(owned_values.iter().map(Self)),
            OwnedValue::Dict(btree_map) => {
                let iter = btree_map
                    .iter()
                    .map(|(key, value)| (Self(key), Self(value)));

                // If all the keys are strings we can collect a map, otherwise we must fallback
                // to collecting as a sequence
                if btree_map.keys().all(is_string) {
                    serializer.collect_map(iter)
                } else {
                    serializer.collect_seq(iter)
                }
            }
        }
    }
}
