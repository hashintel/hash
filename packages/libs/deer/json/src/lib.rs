#![no_std]

mod error;

extern crate alloc;

use alloc::{
    borrow::ToOwned,
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

use crate::error::BytesUnsupportedError;

// TODO: arbitrary-precision
// TODO: error recovery
fn serde_to_deer_number(number: &serde_json::Number) -> Option<deer::Number> {
    if let Some(int) = number.as_i64() {
        Some(deer::Number::from(int))
    } else if let Some(int) = number.as_u64() {
        Some(deer::Number::from(int))
    } else {
        number.as_f64().map(deer::Number::from)
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

// note:
//  one could also do `Option<serde_json::Deserializer>` instead, while this would be more
//  performant (less allocations) we miss a crucial
struct Deserializer {
    value: Option<Value>,
}

impl From<Value> for Deserializer {
    fn from(value: Value) -> Self {
        Self { value: Some(value) }
    }
}

impl Deserializer {
    fn empty() -> Self {
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
        match self.value {
            None => visitor.visit_none().change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new(Schema::new("none")))
                .attach(ReceivedType::new(into_schema(&value)))
                .change_context(DeserializerError)),
        }
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
        if let Some(Value::Number(number)) = self.value {
            if let Some(number) = serde_to_deer_number(&number) {
                visitor
                    .visit_number(number)
                    .change_context(DeserializerError)
            } else {
                todo!()
            }
        } else {
            todo!()
        }
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

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let _ = visitor;
        Err(Report::new(BytesUnsupportedError).change_context(DeserializerError))
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let _ = visitor;
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
        match value {
            None => Ok(None),
            // note: we do not set `Location` here, as different implementations might want to
            // provide their own variant (difference between e.g. tuple vs vec)
            Some(value) => T::deserialize(Deserializer::from(value))
                .map(Some)
                .change_context(ArrayAccessError),
        }
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
    fn new(map: Map<String, Value>) -> Self {
        Self { inner: map }
    }
}

impl<'de> deer::ObjectAccess<'de> for ObjectAccess {
    fn value<T>(&mut self, key: &str) -> Result<T, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        let entry = self.inner.remove(key);

        match entry {
            None => T::deserialize(Deserializer::empty()).change_context(ObjectAccessError),
            Some(value) => {
                T::deserialize(Deserializer::from(value)).change_context(ObjectAccessError)
            }
        }
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
            .to_owned();

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
                report = report.attach(ReceivedKey::new(key))
            }

            Err(report.change_context(ObjectAccessError))
        }
    }
}
