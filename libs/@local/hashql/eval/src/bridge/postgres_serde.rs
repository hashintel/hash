use alloc::{rc::Rc, vec};
use core::alloc::Allocator;

use hashql_core::{
    algorithms::co_sort,
    heap::{CollectIn as _, FromIn as _},
    r#type::{
        Type,
        environment::Environment,
        kind::{Apply, Generic, OpaqueType, PrimitiveType, StructType, TupleType, TypeKind},
    },
};
use hashql_mir::interpret::value::{self, Value};
use serde::{
    Serialize,
    ser::{SerializeMap as _, SerializeSeq as _},
};

#[derive(Debug)]
pub(crate) struct SerializeValue<'value, 'heap, A: Allocator>(&'value Value<'heap, A>);

impl<'value, 'heap, A: Allocator> SerializeValue<'value, 'heap, A> {
    pub(crate) const fn new(value: &'value Value<'heap, A>) -> Self {
        Self(value)
    }
}

impl<A: Allocator> Serialize for SerializeValue<'_, '_, A> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match &self.0 {
            Value::Unit => serializer.serialize_unit(),
            Value::Integer(int) => {
                if let Some(bool) = int.as_bool() {
                    serializer.serialize_bool(bool)
                } else {
                    serializer.serialize_i128(int.as_int())
                }
            }
            Value::Number(num) => serializer.serialize_f64(num.as_f64()),
            Value::String(str) => serializer.serialize_str(str.as_str()),
            Value::Pointer(_) => Err(serde::ser::Error::custom("pointer value not supported")),
            Value::Opaque(opaque) => Self(opaque.value()).serialize(serializer),
            Value::Struct(r#struct) => {
                let mut inner = serializer.serialize_map(Some(r#struct.len()))?;

                for (field, value) in r#struct.fields().iter().zip(r#struct.values()) {
                    inner.serialize_entry(&field.as_str(), &Self(value))?;
                }

                inner.end()
            }
            Value::Tuple(tuple) => {
                let mut inner = serializer.serialize_seq(Some(tuple.len().get()))?;

                for value in tuple.values() {
                    inner.serialize_element(&Self(value))?;
                }

                inner.end()
            }
            Value::List(list) => {
                let mut inner = serializer.serialize_seq(Some(list.len()))?;

                for value in list.iter() {
                    inner.serialize_element(&Self(value))?;
                }

                inner.end()
            }
            Value::Dict(dict) => {
                let mut inner = serializer.serialize_map(Some(dict.len()))?;

                for (key, value) in dict.iter() {
                    inner.serialize_entry(&Self(key), &Self(value))?;
                }

                inner.end()
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ValueRef<'value> {
    Null,
    Bool(bool),
    Number(&'value serde_json::Number),
    String(&'value str),
    Array(&'value [serde_json::Value]),
    Object(&'value serde_json::Map<String, serde_json::Value>),
}

impl<'value> From<&'value serde_json::Value> for ValueRef<'value> {
    fn from(value: &'value serde_json::Value) -> Self {
        match value {
            serde_json::Value::Null => ValueRef::Null,
            &serde_json::Value::Bool(value) => ValueRef::Bool(value),
            serde_json::Value::Number(number) => ValueRef::Number(number),
            serde_json::Value::String(string) => ValueRef::String(string.as_str()),
            serde_json::Value::Array(array) => ValueRef::Array(array),
            serde_json::Value::Object(object) => ValueRef::Object(object),
        }
    }
}

pub(crate) struct Deserializer<'env, 'heap, A> {
    env: &'env Environment<'heap>,
    interner: &'env hashql_mir::intern::Interner<'heap>,

    alloc: A,
}

impl<'env, 'heap, A: Allocator> Deserializer<'env, 'heap, A> {
    pub(super) const fn new(
        env: &'env Environment<'heap>,
        interner: &'env hashql_mir::intern::Interner<'heap>,
        alloc: A,
    ) -> Self {
        Self {
            env,
            interner,
            alloc,
        }
    }

    fn try_deserialize_unknown(&self, value: ValueRef<'_>) -> Option<Value<'heap, A>>
    where
        A: Clone,
    {
        match value {
            ValueRef::Null => Some(Value::Unit),
            ValueRef::Bool(value) => Some(Value::Integer(value::Int::from(value))),
            ValueRef::Number(number) => {
                if let Some(value) = number.as_i128() {
                    Some(Value::Integer(value::Int::from(value)))
                } else {
                    Some(Value::Number(value::Num::from(number.as_f64()?)))
                }
            }
            ValueRef::String(string) => {
                let value = value::Str::from(Rc::from_in(string, self.alloc.clone()));
                Some(Value::String(value))
            }
            ValueRef::Array(values) => {
                // We default in the output to **lists** not tuples. Very important distinction
                let mut output = value::List::new();

                for element in values {
                    output.push_back(self.try_deserialize_unknown(element.into())?);
                }

                Some(Value::List(output))
            }
            ValueRef::Object(map) => {
                if !map.keys().all(|key| {
                    // Mirrors the implementation of `BaseUrl` parse validation.
                    if key.len() < 2048
                        && let Ok(url) = url::Url::parse(key)
                        && matches!(url.scheme(), "http" | "https")
                        && !url.cannot_be_a_base()
                        && key.ends_with('/')
                    {
                        true
                    } else {
                        false
                    }
                }) {
                    let mut dict = value::Dict::new();

                    for (key, value) in map {
                        let key = self.try_deserialize_unknown(ValueRef::String(key))?;
                        let value = self.try_deserialize_unknown(value.into())?;

                        dict.insert(key, value);
                    }

                    return Some(Value::Dict(dict));
                }

                let mut fields = Vec::with_capacity_in(map.len(), self.alloc.clone());
                let mut values = Vec::with_capacity_in(map.len(), self.alloc.clone());

                for (key, value) in map {
                    let key = self.env.heap.intern_symbol(key);
                    let value = self.try_deserialize_unknown(value.into())?;

                    fields.push(key);
                    values.push(value);
                }

                co_sort(&mut fields, &mut values);
                let fields = self.interner.symbols.intern_slice(&fields);

                value::Struct::new(fields, values).map(Value::Struct)
            }
        }
    }

    pub(crate) fn try_deserialize(
        &self,
        r#type: Type<'heap>,
        value: ValueRef<'_>,
    ) -> Option<Value<'heap, A>>
    where
        A: Clone,
    {
        match r#type.kind {
            &TypeKind::Opaque(OpaqueType { name, repr }) => {
                let inner = self.env.r#type(repr);
                let value = self.try_deserialize(inner, value)?;

                Some(Value::Opaque(value::Opaque::new(
                    name,
                    Rc::new_in(value, self.alloc.clone()),
                )))
            }
            TypeKind::Primitive(primitive_type) => match (primitive_type, value) {
                (PrimitiveType::Number, ValueRef::Number(number)) => {
                    number.as_f64().map(From::from).map(Value::Number)
                }
                (PrimitiveType::Integer, ValueRef::Number(number))
                    if let Some(value) = number.as_i128() =>
                {
                    Some(Value::Integer(value::Int::from(value)))
                }
                (PrimitiveType::String, ValueRef::String(string)) => {
                    let value = value::Str::from(Rc::from_in(string, self.alloc.clone()));
                    Some(Value::String(value))
                }
                (PrimitiveType::Null, ValueRef::Null) => Some(Value::Unit),
                (PrimitiveType::Boolean, ValueRef::Bool(value)) => {
                    Some(Value::Integer(value::Int::from(value)))
                }
                (
                    PrimitiveType::Number,
                    ValueRef::Null
                    | ValueRef::Bool(_)
                    | ValueRef::String(_)
                    | ValueRef::Array(_)
                    | ValueRef::Object(_),
                )
                | (
                    PrimitiveType::Integer,
                    ValueRef::Null
                    | ValueRef::Bool(_)
                    | ValueRef::Number(_)
                    | ValueRef::String(_)
                    | ValueRef::Array(_)
                    | ValueRef::Object(_),
                )
                | (
                    PrimitiveType::String,
                    ValueRef::Null
                    | ValueRef::Bool(_)
                    | ValueRef::Number(_)
                    | ValueRef::Array(_)
                    | ValueRef::Object(_),
                )
                | (
                    PrimitiveType::Null,
                    ValueRef::Bool(_)
                    | ValueRef::Number(_)
                    | ValueRef::String(_)
                    | ValueRef::Array(_)
                    | ValueRef::Object(_),
                )
                | (
                    PrimitiveType::Boolean,
                    ValueRef::Null
                    | ValueRef::Number(_)
                    | ValueRef::String(_)
                    | ValueRef::Array(_)
                    | ValueRef::Object(_),
                ) => None,
            },
            TypeKind::Struct(StructType { fields }) => {
                let ValueRef::Object(object) = value else {
                    return None;
                };

                // To avoid allocations, check beforehand if the keys of the object constitute
                // valid identifiers
                for field in fields.iter() {
                    if !object.contains_key(field.name.as_str()) {
                        return None;
                    }
                }

                let names: Vec<_, A> = fields
                    .iter()
                    .map(|field| field.name)
                    .collect_in(self.alloc.clone());
                let names = self.interner.symbols.intern_slice(&names);
                let mut values = vec::from_elem_in(Value::Unit, object.len(), self.alloc.clone());

                // Due to the fact that we currently do not differentiate between closed and open
                // structs, we assume that the struct is closed.
                for (name, value) in object {
                    let field = fields
                        .iter()
                        .position(|field| field.name.as_str() == name)?;

                    values[field] =
                        self.try_deserialize(self.env.r#type(fields[field].value), value.into())?;
                }

                value::Struct::new(names, values).map(Value::Struct)
            }
            TypeKind::Tuple(TupleType { fields }) => {
                let ValueRef::Array(array) = value else {
                    return None;
                };

                if array.len() != fields.len() {
                    return None;
                }

                let mut values: Vec<_, A> = Vec::with_capacity_in(array.len(), self.alloc.clone());
                for (element, &field) in array.iter().zip(fields) {
                    values.push(self.try_deserialize(self.env.r#type(field), element.into())?);
                }

                value::Tuple::new(values).map(Value::Tuple)
            }

            TypeKind::Union(union_type) => {
                // Go through *each variant* and try to find the first one that matches
                for &variant in &union_type.variants {
                    if let Some(value) = self.try_deserialize(self.env.r#type(variant), value) {
                        return Some(value);
                    }
                }

                None
            }

            TypeKind::Intrinsic(hashql_core::r#type::kind::IntrinsicType::List(list)) => {
                let ValueRef::Array(array) = value else {
                    return None;
                };

                let mut output = value::List::new();

                for element in array {
                    output.push_back(
                        self.try_deserialize(self.env.r#type(list.element), element.into())?,
                    );
                }

                Some(Value::List(output))
            }
            TypeKind::Intrinsic(hashql_core::r#type::kind::IntrinsicType::Dict(dict)) => {
                let ValueRef::Object(object) = value else {
                    return None;
                };

                let mut output = value::Dict::new();

                for (key, value) in object {
                    output.insert(
                        self.try_deserialize(self.env.r#type(dict.key), ValueRef::String(key))?,
                        self.try_deserialize(self.env.r#type(dict.value), value.into())?,
                    );
                }

                Some(Value::Dict(output))
            }

            // How... does one even do that?
            TypeKind::Intersection(_) => todo!(
                "issue ICE, there are no intersection types that should be surviving until now \
                 (at least not in the current data model)"
            ),

            &TypeKind::Apply(Apply {
                base,
                substitutions: _,
            }) => self.try_deserialize(self.env.r#type(base), value),
            &TypeKind::Generic(Generic { base, arguments: _ }) => {
                self.try_deserialize(self.env.r#type(base), value)
            }

            TypeKind::Closure(_) => todo!("issue ICE; should be rejected by MIR"),
            TypeKind::Never => {
                todo!("issue ICE; tried to deserialize a never type; should be rejected by MIR")
            }

            // we're flying free here, issue a warning, and just try to deserialize using the old
            // tactics
            TypeKind::Param(_) | TypeKind::Infer(_) | TypeKind::Unknown => {
                self.try_deserialize_unknown(value)
            }
        }
    }
}
