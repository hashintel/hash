use alloc::{rc::Rc, vec};
use core::alloc::Allocator;

use hashql_core::{
    algorithms::co_sort,
    heap::{CollectIn as _, FromIn as _},
    r#type::{
        TypeId,
        environment::Environment,
        kind::{Apply, Generic, OpaqueType, PrimitiveType, StructType, TupleType, TypeKind},
    },
};
use hashql_mir::interpret::value::{self, Value};

use super::{JsonValueKind, JsonValueRef};
use crate::{
    orchestrator::{
        Indexed,
        error::{BridgeError, DecodeError},
    },
    postgres::ColumnDescriptor,
};

#[cfg(test)]
mod tests;

/// Type-directed JSON deserializer that converts column values into interpreter
/// [`Value`]s.
///
/// Walks the HashQL type tree to determine how each JSON node should be
/// interpreted: primitives map directly, structs expect JSON objects with
/// matching keys, tuples expect arrays of the correct length, unions try each
/// variant in order, and opaque types wrap their inner representation.
///
/// When the type is unknown ([`Param`], [`Infer`], [`Unknown`]), falls back to
/// [`decode_unknown`](Self::decode_unknown), which uses JSON structure alone
/// (objects become structs or dicts, arrays become lists, etc.).
///
/// [`Value`]: hashql_mir::interpret::value::Value
/// [`Param`]: hashql_core::type_::kind::TypeKind::Param
/// [`Infer`]: hashql_core::type_::kind::TypeKind::Infer
/// [`Unknown`]: hashql_core::type_::kind::TypeKind::Unknown
pub(crate) struct Decoder<'env, 'heap, A> {
    env: &'env Environment<'heap>,
    interner: &'env hashql_mir::intern::Interner<'heap>,

    alloc: A,
}

impl<'env, 'heap, A: Allocator> Decoder<'env, 'heap, A> {
    pub(crate) const fn new(
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

    fn decode_unknown(&self, value: JsonValueRef<'_>) -> Result<Value<'heap, A>, DecodeError<'heap>>
    where
        A: Clone,
    {
        match value {
            JsonValueRef::Null => Ok(Value::Unit),
            JsonValueRef::Bool(value) => Ok(Value::Integer(value::Int::from(value))),
            JsonValueRef::Number(number) => {
                if let Some(value) = number.as_i128() {
                    Ok(Value::Integer(value::Int::from(value)))
                } else {
                    let value = number
                        .as_f64()
                        .ok_or(DecodeError::NumberOutOfRange { expected: None })?;

                    Ok(Value::Number(value::Num::from(value)))
                }
            }
            JsonValueRef::String(string) => {
                let value = value::Str::from(Rc::from_in(string, self.alloc.clone()));
                Ok(Value::String(value))
            }
            JsonValueRef::Array(values) => {
                // We default in the output to **lists** not tuples. Very important distinction
                let mut output = value::List::new();

                for element in values {
                    output.push_back(self.decode_unknown(element.into())?);
                }

                Ok(Value::List(output))
            }
            JsonValueRef::Object(map) => {
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
                        let key = self.decode_unknown(JsonValueRef::String(key))?;
                        let value = self.decode_unknown(value.into())?;

                        dict.insert(key, value);
                    }

                    return Ok(Value::Dict(dict));
                }

                let mut fields = Vec::with_capacity_in(map.len(), self.alloc.clone());
                let mut values = Vec::with_capacity_in(map.len(), self.alloc.clone());

                for (key, value) in map {
                    let key = self.env.heap.intern_symbol(key);
                    let value = self.decode_unknown(value.into())?;

                    fields.push(key);
                    values.push(value);
                }

                co_sort(&mut fields, &mut values);
                let fields = self.interner.symbols.intern_slice(&fields);

                value::Struct::new(fields, values)
                    .map(Value::Struct)
                    .ok_or(DecodeError::MalformedConstruction { expected: None })
            }
        }
    }

    /// Deserializes a JSON value into a typed [`Value`] guided by `type_id`.
    ///
    /// Recursively walks the type tree: opaque types wrap their inner
    /// representation, structs expect JSON objects with matching keys, tuples
    /// expect arrays of the correct length, unions try each variant in
    /// declaration order, and primitives require exact JSON kind matches.
    ///
    /// # Errors
    ///
    /// Returns a [`DecodeError`] when the JSON shape does not match the
    /// expected type (wrong kind, missing fields, length mismatches, etc.)
    /// or when an unrepresentable type (intersection, closure, never)
    /// reaches the decoder.
    ///
    /// [`Value`]: hashql_mir::interpret::value::Value
    #[expect(clippy::too_many_lines)]
    pub(crate) fn decode(
        &self,
        type_id: TypeId,
        value: JsonValueRef<'_>,
    ) -> Result<Value<'heap, A>, DecodeError<'heap>>
    where
        A: Clone,
    {
        let r#type = self.env.r#type(type_id);

        match r#type.kind {
            &TypeKind::Opaque(OpaqueType { name, repr }) => {
                let value = self.decode(repr, value)?;

                Ok(Value::Opaque(value::Opaque::new(
                    name,
                    Rc::new_in(value, self.alloc.clone()),
                )))
            }
            TypeKind::Primitive(primitive_type) => match (primitive_type, value) {
                (PrimitiveType::Number, JsonValueRef::Number(number)) => {
                    number.as_f64().map(From::from).map(Value::Number).ok_or(
                        DecodeError::NumberOutOfRange {
                            expected: Some(type_id),
                        },
                    )
                }
                (PrimitiveType::Integer, JsonValueRef::Number(number))
                    if let Some(value) = number.as_i128() =>
                {
                    Ok(Value::Integer(value::Int::from(value)))
                }
                (PrimitiveType::String, JsonValueRef::String(string)) => {
                    let value = value::Str::from(Rc::from_in(string, self.alloc.clone()));
                    Ok(Value::String(value))
                }
                (PrimitiveType::Null, JsonValueRef::Null) => Ok(Value::Unit),
                (PrimitiveType::Boolean, JsonValueRef::Bool(value)) => {
                    Ok(Value::Integer(value::Int::from(value)))
                }
                (
                    PrimitiveType::Number,
                    JsonValueRef::Null
                    | JsonValueRef::Bool(_)
                    | JsonValueRef::String(_)
                    | JsonValueRef::Array(_)
                    | JsonValueRef::Object(_),
                )
                | (
                    PrimitiveType::Integer,
                    JsonValueRef::Null
                    | JsonValueRef::Bool(_)
                    | JsonValueRef::Number(_)
                    | JsonValueRef::String(_)
                    | JsonValueRef::Array(_)
                    | JsonValueRef::Object(_),
                )
                | (
                    PrimitiveType::String,
                    JsonValueRef::Null
                    | JsonValueRef::Bool(_)
                    | JsonValueRef::Number(_)
                    | JsonValueRef::Array(_)
                    | JsonValueRef::Object(_),
                )
                | (
                    PrimitiveType::Null,
                    JsonValueRef::Bool(_)
                    | JsonValueRef::Number(_)
                    | JsonValueRef::String(_)
                    | JsonValueRef::Array(_)
                    | JsonValueRef::Object(_),
                )
                | (
                    PrimitiveType::Boolean,
                    JsonValueRef::Null
                    | JsonValueRef::Number(_)
                    | JsonValueRef::String(_)
                    | JsonValueRef::Array(_)
                    | JsonValueRef::Object(_),
                ) => Err(DecodeError::TypeMismatch {
                    expected: type_id,
                    received: JsonValueKind::from(value),
                }),
            },
            TypeKind::Struct(StructType { fields }) => {
                let JsonValueRef::Object(object) = value else {
                    return Err(DecodeError::TypeMismatch {
                        expected: type_id,
                        received: JsonValueKind::from(value),
                    });
                };

                if object.len() != fields.len() {
                    return Err(DecodeError::StructLengthMismatch {
                        expected: type_id,
                        expected_length: fields.len(),
                        received_length: object.len(),
                    });
                }

                for field in fields.iter() {
                    if !object.contains_key(field.name.as_str()) {
                        return Err(DecodeError::MissingField {
                            expected: type_id,
                            field: field.name,
                        });
                    }
                }

                let names: Vec<_, A> = fields
                    .iter()
                    .map(|field| field.name)
                    .collect_in(self.alloc.clone());
                let names = self.interner.symbols.intern_slice(&names);
                let mut values = vec::from_elem_in(Value::Unit, object.len(), self.alloc.clone());

                // We assume the struct is closed. The length check and per-field
                // check above guarantee a bijection between JSON keys and type
                // fields, so the position lookup cannot fail.
                for (name, value) in object {
                    let field = fields
                        .iter()
                        .position(|field| field.name.as_str() == name)
                        .unwrap_or_else(|| unreachable!());

                    values[field] = self.decode(fields[field].value, value.into())?;
                }

                value::Struct::new(names, values).map(Value::Struct).ok_or(
                    DecodeError::MalformedConstruction {
                        expected: Some(type_id),
                    },
                )
            }
            TypeKind::Tuple(TupleType { fields }) => {
                let JsonValueRef::Array(array) = value else {
                    return Err(DecodeError::TypeMismatch {
                        expected: type_id,
                        received: JsonValueKind::from(value),
                    });
                };

                if array.len() != fields.len() {
                    return Err(DecodeError::TupleLengthMismatch {
                        expected: type_id,
                        expected_length: fields.len(),
                        received_length: array.len(),
                    });
                }

                let mut values: Vec<_, A> = Vec::with_capacity_in(array.len(), self.alloc.clone());
                for (element, &field) in array.iter().zip(fields) {
                    values.push(self.decode(field, element.into())?);
                }

                value::Tuple::new(values).map(Value::Tuple).ok_or(
                    DecodeError::MalformedConstruction {
                        expected: Some(type_id),
                    },
                )
            }

            TypeKind::Union(union_type) => {
                // Go through *each variant* and try to find the first one that matches
                for &variant in &union_type.variants {
                    if let Ok(value) = self.decode(variant, value) {
                        return Ok(value);
                    }
                }

                Err(DecodeError::NoMatchingVariant {
                    expected: type_id,
                    received: JsonValueKind::from(value),
                })
            }

            TypeKind::Intrinsic(hashql_core::r#type::kind::IntrinsicType::List(list)) => {
                let JsonValueRef::Array(array) = value else {
                    return Err(DecodeError::TypeMismatch {
                        expected: type_id,
                        received: JsonValueKind::from(value),
                    });
                };

                let mut output = value::List::new();

                for element in array {
                    output.push_back(self.decode(list.element, element.into())?);
                }

                Ok(Value::List(output))
            }
            TypeKind::Intrinsic(hashql_core::r#type::kind::IntrinsicType::Dict(dict)) => {
                let JsonValueRef::Object(object) = value else {
                    return Err(DecodeError::TypeMismatch {
                        expected: type_id,
                        received: JsonValueKind::from(value),
                    });
                };

                let mut output = value::Dict::new();

                for (key, value) in object {
                    output.insert(
                        self.decode(dict.key, JsonValueRef::String(key))?,
                        self.decode(dict.value, value.into())?,
                    );
                }

                Ok(Value::Dict(output))
            }

            TypeKind::Intersection(_) => Err(DecodeError::IntersectionType { type_id }),

            &TypeKind::Apply(Apply {
                base,
                substitutions: _,
            })
            | &TypeKind::Generic(Generic { base, arguments: _ }) => self.decode(base, value),
            TypeKind::Closure(_) => Err(DecodeError::ClosureType { type_id }),
            TypeKind::Never => Err(DecodeError::NeverType { type_id }),

            // We're flying free here, issue a warning, and just try to deserialize using the
            // old tactics
            // TODO: issue a warning
            TypeKind::Param(_) | TypeKind::Infer(_) | TypeKind::Unknown => {
                self.decode_unknown(value)
            }
        }
    }

    /// Deserializes a column value into the expected type, or returns an error.
    ///
    /// The `column` parameter is only used for error reporting;
    /// it identifies which result column failed to deserialize.
    pub(crate) fn try_decode(
        &self,
        r#type: TypeId,
        value: JsonValueRef<'_>,
        column: Indexed<ColumnDescriptor>,
    ) -> Result<Value<'heap, A>, BridgeError<'heap>>
    where
        A: Clone,
    {
        self.decode(r#type, value)
            .map_err(|source| BridgeError::ValueDeserialization { column, source })
    }
}
