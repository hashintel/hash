#![cfg_attr(not(feature = "std"), no_std)]
#![warn(
    unreachable_pub,
    clippy::pedantic,
    clippy::nursery,
    clippy::alloc_instead_of_core,
    clippy::std_instead_of_alloc,
    clippy::std_instead_of_core,
    clippy::if_then_some_else_none,
    clippy::print_stdout,
    clippy::print_stderr
)]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::redundant_pub_crate)]
#![allow(clippy::missing_errors_doc)]
#![deny(unsafe_code)]
mod error;
mod macros;

extern crate alloc;

#[cfg(feature = "arbitrary-precision")]
use alloc::{format, string::ToString};
use alloc::{
    string::String,
    vec::{IntoIter, Vec},
};

use deer::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializerError, ExpectedLength, ExpectedType,
        MissingError, ObjectAccessError, ObjectItemsExtraError, ReceivedKey, ReceivedLength,
        ReceivedType, ReceivedValue, Schema, TypeError, ValueError,
    },
    Deserialize, Visitor,
};
use error_stack::{Report, Result, ResultExt};
use serde_json::{Map, Value};

use crate::error::{BytesUnsupportedError, OverflowError};

#[cfg(not(feature = "arbitrary-precision"))]
fn serde_to_deer_number(number: &serde_json::Number) -> Option<deer::Number> {
    number
        .as_i64()
        .map(deer::Number::from)
        .or_else(|| number.as_u64().map(deer::Number::from))
        .or_else(|| number.as_f64().map(deer::Number::from))
}

#[cfg(feature = "arbitrary-precision")]
fn serde_to_deer_number(number: &serde_json::Number) -> Option<deer::Number> {
    // SAFETY: we know that `number` is already valid, therefore we can safely construct the deer
    // variant.
    #[allow(unsafe_code)]
    unsafe {
        deer::Number::from_string_unchecked(format!("{number}"))
    }
}

fn into_schema(value: &Value) -> Schema {
    match value {
        Value::Null => Schema::new("null"),
        Value::Bool(_) => Schema::new("boolean"),
        Value::Number(_) => Schema::new("number"),
        Value::String(_) => Schema::new("string"),
        Value::Array(_) => Schema::new("array"),
        Value::Object(_) => Schema::new("object"),
    }
}

/// General helper macro to properly implement deserialization functions with proper error
/// handling without most of the boilerplate and trying to stay as close as possible to rust syntax.
/// 
/// Syntax:
/// ```text
/// match <self> {
///     Value::<Variant>(<binding>) => <visitor>.<visit>(<transform>),
///     else => Error(schema: <schema>)
/// }
/// ```
/// 
/// where: 
/// * `self` is always just `self`
/// * `Variant` is a valid variant of `serde_json::Value`
/// * `binding` is the variable name for the inner value
/// * `transform` is an expression that can mention the variable name chosen in `binding` 
///    and will be used to call the visitor
/// * `visitor` the variable that holds the visitor that implements the [`Visitor`] trait
/// * `visit` the function to be called, e.g. `Value::Bool` should call `visit_bool`
/// * `schema` should be an expression that returns a [`Schema`]
/// 
/// This means that
/// 
/// ```no_run
/// try_deserialize!(
///     match self {
///         Value::Bool(bool) => visitor.visit_bool(bool),
///         else => Error(schema: Schema::new("boolean"))
///     }
/// );
/// ```
/// 
/// roughly expands to:
/// 
/// ```no_run
/// # use error_stack::Report;
/// # use serde_json::Value;
/// # use deer::error::{DeserializerError, ExpectedType, MissingError, ReceivedType, Schema, TypeError};
/// #
/// # let _ =
/// match self.value {
///     Some(Value::Bool(bool)) => visitor.visit_bool(bool).change_context(DeserializerError),
///     Some(value) => Err(Report::new(TypeError)
///         .attach(ExpectedType::new(Schema::new("boolean")))
///         .attach(ReceivedType(into_schema(&value)))
///         .change_context(DeserializerError)),
///     None => Err(Report::new(MissingError)
///         .attach(ExpectedType::new(Schema::new("boolean")))
///         .change_context(DeserializerError))
/// };
/// ```
#[rustfmt::skip]
macro_rules! try_deserialize {
    (
        match $self:ident {
            Value::$variant:ident($value:ident) => $visitor:ident.$visit:ident($transform:expr),
            else => Error(schema: $schema:expr)
        }
    ) => {
        match $self.value {
            Some(Value::$variant($value)) => $visitor.$visit($transform).change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new($schema))
                .attach(ReceivedType::new(into_schema(&value))))
                .change_context(DeserializerError),
            None => Err(Report::new(MissingError)
                .attach(ExpectedType::new($schema))
                .change_context(DeserializerError)),
        }
    };
}

struct Deserializer {
    value: Option<Value>,
}

impl From<Value> for Deserializer {
    fn from(value: Value) -> Self {
        Self { value: Some(value) }
    }
}

impl Deserializer {
    const fn empty() -> Self {
        Self { value: None }
    }
}

impl<'de> deer::Deserializer<'de> for Deserializer {
    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.value {
            None => visitor.visit_none(),
            Some(Value::String(string)) => visitor.visit_string(string),
            Some(Value::Null) => visitor.visit_null(),
            Some(Value::Bool(bool)) => visitor.visit_bool(bool),
            Some(Value::Number(number)) => serde_to_deer_number(&number)
                .ok_or_else(|| todo!())
                .and_then(|number| visitor.visit_number(number)),
            Some(Value::Array(array)) => visitor.visit_array(ArrayAccess::new(array)),
            Some(Value::Object(object)) => visitor.visit_object(ObjectAccess::new(object)),
        }
        .change_context(DeserializerError)
    }

    fn deserialize_none<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        self.value.map_or_else(
            || visitor.visit_none().change_context(DeserializerError),
            |value| {
                Err(Report::new(TypeError)
                    .attach(ExpectedType::new(Schema::new("none")))
                    .attach(ReceivedType::new(into_schema(&value)))
                    .change_context(DeserializerError))
            },
        )
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.value {
            Some(Value::Null) => visitor.visit_null().change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new(Schema::new("null")))
                .attach(ReceivedType::new(into_schema(&value)))
                .change_context(DeserializerError)),
            None => Err(Report::new(MissingError)
                .attach(ExpectedType::new(Schema::new("null")))
                .change_context(DeserializerError)),
        }
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(
            match self {
                Value::Bool(bool) => visitor.visit_bool(bool),
                else => Error(schema: Schema::new("boolean"))
            }
        )
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(
            match self {
                Value::Number(number) => visitor.visit_number({
                    serde_to_deer_number(&number)
                        .ok_or_else(|| Report::new(OverflowError)
                            .attach(ReceivedValue::new(number)).change_context(DeserializerError)
                        )?
                }),
                else => Error(schema: Schema::new("number"))
            }
        )
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::String(string) => visitor.visit_char({
                let mut chars = string.chars();

                let (a, b) = (chars.next(), chars.next());

                match (a, b) {
                    (Some(a), None) => a,
                    (Some(_), Some(_)) | (None, None) => {
                        return Err(Report::new(ValueError)
                            .attach(ExpectedType::new(Schema::new("string").with("minLength", 1).with("maxLength", 1)))
                            .attach(ReceivedValue::new(string))
                            .change_context(DeserializerError));
                    },
                    (None, Some(_)) => unreachable!(),
                }
            }),
            else => Error(schema: Schema::new("char").with("minLength", 1).with("maxLength", 1))
        })
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::String(string) => visitor.visit_string(string),
            else => Error(schema: Schema::new("string"))
        })
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::String(string) => visitor.visit_str(&string),
            else => Error(schema: Schema::new("string"))
        })
    }

    fn deserialize_bytes<V>(self, _: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        Err(Report::new(BytesUnsupportedError).change_context(DeserializerError))
    }

    fn deserialize_bytes_buffer<V>(self, _: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        Err(Report::new(BytesUnsupportedError).change_context(DeserializerError))
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::Array(array) => visitor.visit_array(ArrayAccess::new(array)),
            else => Error(schema: Schema::new("array"))
        })
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::Object(map) => visitor.visit_object(ObjectAccess::new(map)),
            else => Error(schema: Schema::new("array"))
        })
    }
}

#[must_use]
struct ArrayAccess {
    length: usize,
    inner: IntoIter<Value>,
}

impl ArrayAccess {
    fn new(array: Vec<Value>) -> Self {
        Self {
            length: array.len(),
            inner: array.into_iter(),
        }
    }
}

impl<'de> deer::ArrayAccess<'de> for ArrayAccess {
    fn next<T>(&mut self) -> Result<Option<T>, ArrayAccessError>
    where
        T: Deserialize<'de>,
    {
        let value = self.inner.next();

        // only `ObjectAccess::value` uses `deserialize_none`, otherwise this would easily lead to
        // an endless loop!
        // note: we do not set `Location` here, as different implementations might want to
        // provide their own variant (difference between e.g. tuple vs vec)
        value.map_or_else(
            || Ok(None),
            |value| {
                T::deserialize(Deserializer::from(value))
                    .map(Some)
                    .change_context(ArrayAccessError)
            },
        )
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        let count = self.inner.count();
        if count == 0 {
            Ok(())
        } else {
            Err(Report::new(ArrayLengthError)
                .attach(ExpectedLength::new(self.length))
                .attach(ReceivedLength::new(self.length + count))
                .change_context(ArrayAccessError))
        }
    }
}

#[must_use]
struct ObjectAccess {
    inner: Map<String, Value>,
}

impl ObjectAccess {
    const fn new(map: Map<String, Value>) -> Self {
        Self { inner: map }
    }
}

impl<'de> deer::ObjectAccess<'de> for ObjectAccess {
    fn value<T>(&mut self, key: &str) -> Result<T, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        let entry = self.inner.remove(key);

        entry.map_or_else(
            || T::deserialize(Deserializer::empty()).change_context(ObjectAccessError),
            |value| T::deserialize(Deserializer::from(value)).change_context(ObjectAccessError),
        )
    }

    fn next<T>(&mut self) -> Result<Option<(String, T)>, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        // only `ObjectAccess::value` uses `deserialize_none`, otherwise this would easily lead to
        // an endless loop!
        if self.inner.is_empty() {
            return Ok(None);
        }

        // self.inner.is_empty() ensures that there is at least a single key
        let next = self
            .inner
            .keys()
            .next()
            .expect("map should have at least a single item")
            .clone();

        // `next` comes from the `keys()` iterator, therefore the key is guaranteed to be in
        // `self.inner`
        let (key, value) = self.inner.remove_entry(&next).expect("key should exist");

        // note: we do not set `Location` here, as different implementations might want to
        // provide their own variant (difference between e.g. HashMap vs Struct)
        T::deserialize(Deserializer::from(value))
            .map(|value| Some((key, value)))
            .change_context(ObjectAccessError)
    }

    fn finish(self) -> Result<(), ObjectAccessError> {
        if self.inner.is_empty() {
            Ok(())
        } else {
            let mut report = Report::new(ObjectItemsExtraError);

            for key in self.inner.into_iter().map(|(key, _)| key) {
                report = report.attach(ReceivedKey::new(key));
            }

            Err(report.change_context(ObjectAccessError))
        }
    }
}
