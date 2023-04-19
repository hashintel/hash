#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(nightly, feature(provide_any, error_in_core))]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
#![deny(unsafe_code)]
mod error;

extern crate alloc;

#[cfg(feature = "arbitrary-precision")]
use alloc::format;
use alloc::{
    string::String,
    vec::{IntoIter, Vec},
};
use core::fmt::{Display, Formatter};
#[cfg(nightly)]
use std::any::Demand;

use deer::{
    error::{
        ArrayAccessError, ArrayLengthError, BoundedContractViolationError, DeserializeError,
        DeserializerError, ExpectedLength, ExpectedType, ObjectAccessError, ObjectItemsExtraError,
        ObjectLengthError, ReceivedKey, ReceivedLength, ReceivedType, ReceivedValue, TypeError,
        ValueError, Variant,
    },
    value::NoneDeserializer,
    Context, Deserialize, DeserializeOwned, Document, EnumVisitor, FieldVisitor, OptionalVisitor,
    Reflection, Schema, Visitor,
};
use error_stack::{IntoReport, Report, Result, ResultExt};
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

// Reason: the non arbitrary-precision version needs `Option<T>` as a full conversion is not
// guaranteed.
// This would happen if one enabled `arbitrary_precision` on `serde_json`, without enabling
// `arbitrary-precision` on `deer-json`.
// This is because the relationship between both features is: `deer-json::arbitrary-precision` =>
// `serde_json::arbitrary_precision`.
#[allow(clippy::unnecessary_wraps)]
#[cfg(feature = "arbitrary-precision")]
fn serde_to_deer_number(number: &serde_json::Number) -> Option<deer::Number> {
    #[allow(unsafe_code)]
    // SAFETY: we know that `number` is already valid, therefore we can safely construct the deer
    // variant.
    unsafe {
        Some(deer::Number::from_string_unchecked(format!("{number}")))
    }
}

struct NullReflection;
impl Reflection for NullReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("null")
    }
}

struct BoolReflection;
impl Reflection for BoolReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("boolean")
    }
}

struct NumberReflection;
impl Reflection for NumberReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("number")
    }
}

struct StringReflection;
impl Reflection for StringReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string")
    }
}

struct ArrayReflection;
impl Reflection for ArrayReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("array")
    }
}

struct ObjectReflection;
impl Reflection for ObjectReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("object")
    }
}

struct CharReflection;
impl Reflection for CharReflection {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string")
            .with("minLength", 1)
            .with("maxLength", 1)
    }
}

fn into_document(value: &Value) -> Document {
    match value {
        Value::Null => NullReflection::document(),
        Value::Bool(_) => BoolReflection::document(),
        Value::Number(_) => NumberReflection::document(),
        Value::String(_) => StringReflection::document(),
        Value::Array(_) => ArrayReflection::document(),
        Value::Object(_) => ObjectReflection::document(),
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
/// ```ignore
/// try_deserialize!(
///     match self {
///         Value::Bool(bool) => visitor.visit_bool(bool),
///         else => Error
///     }
/// );
/// ```
///
/// roughly expands to:
///
/// ```ignore
/// # use error_stack::Report;
/// # use serde_json::{Deserializer, Value};
/// # use deer::error::{DeserializerError, Error, ExpectedType, MissingError, ReceivedType, Schema, TypeError};
/// #
/// # let _ =
/// match self.value {
///     Some(Value::Bool(bool)) => visitor.visit_bool(bool).change_context(DeserializerError),
///     Some(value) => Err(Report::new(Error::new(TypeError))
///         .attach(ExpectedType::new(visitor.expecting()))
///         .attach(ReceivedType(into_schema(&value)))
///         .change_context(DeserializerError)),
///     None => visitor.visit_none().change_context(DeserializerError)
/// };
/// ```
#[rustfmt::skip]
macro_rules! try_deserialize {
    (
        match $self:ident {
            Value::$variant:ident$(($value:ident))? => $visitor:ident.$visit:ident($($transform:expr)?),
            else => Error
        }
    ) => {
        match $self.value {
            Some(Value::$variant$(($value))?) => $visitor.$visit($($transform)?).change_context(DeserializerError),
            // instead of relying on the document of the type itself, we can use the reflection of the visitor
            // for better hints
            Some(value) => Err(Report::new(TypeError.into_error())
                .attach(ExpectedType::new($visitor.expecting()))
                .attach(ReceivedType::new(into_document(&value))))
                .change_context(DeserializerError),
            // the default for `Visitor::visit_none` is `MissingError`, there is no value here, so
            // to be able to enable recovery we always just defer to that call
            None => $visitor.visit_none().change_context(DeserializerError),
        }
    };
}

struct Deserializer<'a> {
    value: Option<Value>,
    context: &'a Context,
}

impl<'a> Deserializer<'a> {
    const fn new(value: Value, context: &'a Context) -> Self {
        Self {
            value: Some(value),
            context,
        }
    }

    const fn empty(context: &'a Context) -> Self {
        Self {
            value: None,
            context,
        }
    }
}

impl<'a, 'de> deer::Deserializer<'de> for Deserializer<'a> {
    fn context(&self) -> &Context {
        self.context
    }

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
                .ok_or_else(|| {
                    unimplemented!(
                        "serde number has arbitrary precision enabled, deer has not, no fallback \
                         is implemented just yet"
                    )
                })
                .and_then(|number| visitor.visit_number(number)),
            Some(Value::Array(array)) => visitor.visit_array(ArrayAccess::new(array, self.context)),
            Some(Value::Object(object)) => {
                visitor.visit_object(ObjectAccess::new(object, self.context))
            }
        }
        .change_context(DeserializerError)
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(
            match self {
                Value::Null => visitor.visit_null(),
                else => Error
            }
        )
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(
            match self {
                Value::Bool(bool) => visitor.visit_bool(bool),
                else => Error
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
                        .ok_or_else(|| Report::new(OverflowError.into_error())
                            .attach(ReceivedValue::new(number)).change_context(DeserializerError)
                        )?
                }),
                else => Error
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
                        return Err(Report::new(ValueError.into_error())
                            .attach(ExpectedType::new(CharReflection::document()))
                            .attach(ReceivedValue::new(string))
                            .change_context(DeserializerError));
                    },
                    (None, Some(_)) => unreachable!(),
                }
            }),
            else => Error
        })
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::String(string) => visitor.visit_string(string),
            else => Error
        })
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::String(string) => visitor.visit_str(&string),
            else => Error
        })
    }

    fn deserialize_bytes<V>(self, _: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        Err(Report::new(BytesUnsupportedError.into_error()).change_context(DeserializerError))
    }

    fn deserialize_bytes_buffer<V>(self, _: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        Err(Report::new(BytesUnsupportedError.into_error()).change_context(DeserializerError))
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::Array(array) => visitor.visit_array(ArrayAccess::new(array, self.context)),
            else => Error
        })
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        try_deserialize!(match self {
            Value::Object(map) => visitor.visit_object(ObjectAccess::new(map, self.context)),
            else => Error
        })
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        match &self.value {
            None => visitor.visit_none(),
            Some(Value::Null) => visitor.visit_null(),
            _ => visitor.visit_some(self),
        }
        .change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let Some(value) = self.value else {
            return NoneDeserializer::new(self.context).deserialize_enum(visitor)
        };

        let context = self.context;

        if let Value::Object(object) = value {
            if object.len() != 1 {
                return Err(Report::new(ObjectLengthError.into_error())
                    .attach(ExpectedLength::new(1))
                    .attach(ReceivedLength::new(object.len()))
                    .change_context(DeserializerError));
            }

            let (key, value) = object
                .into_iter()
                .next()
                .expect("previous check should make this infallible");

            let discriminant = visitor
                .visit_discriminant(Deserializer {
                    value: Some(key.into()),
                    context,
                })
                .change_context(DeserializerError)?;

            visitor
                .visit_value(discriminant, Deserializer {
                    value: Some(value),
                    context,
                })
                .change_context(DeserializerError)
        } else {
            let discriminant = visitor
                .visit_discriminant(Deserializer {
                    value: Some(value),
                    context,
                })
                .change_context(DeserializerError)?;

            visitor
                .visit_value(discriminant, Deserializer {
                    value: None,
                    context,
                })
                .change_context(DeserializerError)
        }
    }
}

#[must_use]
struct ArrayAccess<'a> {
    dirty: bool,
    length: usize,

    inner: IntoIter<Value>,
    context: &'a Context,

    remaining: Option<usize>,
}

impl<'a> ArrayAccess<'a> {
    fn new(array: Vec<Value>, context: &'a Context) -> Self {
        Self {
            dirty: false,
            length: array.len(),

            inner: array.into_iter(),
            context,

            remaining: None,
        }
    }
}

impl<'a, 'de> deer::ArrayAccess<'de> for ArrayAccess<'a> {
    fn context(&self) -> &Context {
        self.context
    }

    fn set_bounded(&mut self, length: usize) -> Result<(), ArrayAccessError> {
        if self.dirty {
            return Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ArrayAccessError),
            );
        }

        if self.remaining.is_some() {
            return Err(Report::new(
                BoundedContractViolationError::SetCalledMultipleTimes.into_error(),
            )
            .change_context(ArrayAccessError));
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>,
    {
        self.dirty = true;

        // early return because we have exhausted all entries
        if self.remaining == Some(0) {
            return None;
        }

        let value = self.inner.next();

        // we do not set `Location` here, as different implementations might want to
        // provide their own variant (difference between e.g. tuple vs vec)
        match (value, &mut self.remaining) {
            (None, Some(remaining)) => {
                *remaining -= 1;

                // delegate calls to `Visitor::visit_none`
                Some(
                    T::deserialize(Deserializer::empty(self.context))
                        .change_context(ArrayAccessError),
                )
            }
            (None, None) => None,
            (Some(value), _) => Some(
                T::deserialize(Deserializer::new(value, self.context))
                    .change_context(ArrayAccessError),
            ),
        }
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.length)
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        // TODO: error if self.remaining isn't Some(0) or None
        let count = self.inner.count();
        if count == 0 {
            Ok(())
        } else {
            Err(Report::new(ArrayLengthError.into_error())
                .attach(ExpectedLength::new(self.length))
                .attach(ReceivedLength::new(self.length + count))
                .change_context(ArrayAccessError))
        }
    }
}

#[must_use]
struct ObjectAccess<'a> {
    dirty: bool,
    length: usize,

    inner: Map<String, Value>,
    context: &'a Context,

    remaining: Option<usize>,
}

impl<'a> ObjectAccess<'a> {
    fn new(map: Map<String, Value>, context: &'a Context) -> Self {
        Self {
            dirty: false,
            length: map.len(),
            inner: map,
            context,
            remaining: None,
        }
    }
}

impl<'a, 'de> deer::ObjectAccess<'de> for ObjectAccess<'a> {
    fn context(&self) -> &Context {
        self.context
    }

    fn set_bounded(&mut self, length: usize) -> Result<(), ObjectAccessError> {
        if self.dirty {
            return Err(
                Report::new(BoundedContractViolationError::SetDirty.into_error())
                    .change_context(ObjectAccessError),
            );
        }

        if self.remaining.is_some() {
            return Err(Report::new(
                BoundedContractViolationError::SetCalledMultipleTimes.into_error(),
            )
            .change_context(ObjectAccessError));
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn field<F>(&mut self, access: F) -> Option<Result<F::Value, ObjectAccessError>>
    where
        F: FieldVisitor<'de>,
    {
        self.dirty = true;

        // early return because we have exhausted all entries
        if self.remaining == Some(0) {
            return None;
        }

        if self.inner.is_empty() {
            return match &mut self.remaining {
                None => None,
                Some(remaining) => {
                    *remaining -= 1;

                    // defer to `Visitor::visit_none`
                    let key = access.visit_key(Deserializer::empty(self.context));

                    Some(
                        key.and_then(|key| {
                            access.visit_value(key, Deserializer::empty(self.context))
                        })
                        .change_context(ObjectAccessError),
                    )
                }
            };
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

        let key = access.visit_key(Deserializer::new(Value::String(key), self.context));
        let value =
            key.and_then(|key| access.visit_value(key, Deserializer::new(value, self.context)));

        // note: we do not set `Location` here, as different implementations might want to
        // provide their own variant (difference between e.g. HashMap vs Struct)
        Some(value.change_context(ObjectAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.length)
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        if self.inner.is_empty() {
            Ok(())
        } else {
            let mut report = Report::new(ObjectItemsExtraError.into_error());

            for key in self.inner.into_iter().map(|(key, _)| key) {
                report = report.attach(ReceivedKey::new(key));
            }

            Err(report.change_context(ObjectAccessError))
        }
    }
}

#[derive(Debug)]
struct ParseError(serde_json::Error);

impl Display for ParseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0, f)
    }
}

#[cfg(nightly)]
impl core::error::Error for ParseError {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0)
    }
}

#[cfg(all(feature = "std", not(nightly)))]
impl std::error::Error for ParseError {}

#[cfg(all(not(feature = "std"), not(nightly)))]
impl error_stack::Context for ParseError {}

// all these functions are currently DeserializeOwned, as we're unable to provide *any* borrowed
// data with the current Deserializer, this is because we run everything through `Value`, which is
// `DeserializeOwned`.
#[cfg(feature = "std")]
pub fn from_reader<R: std::io::Read, T: DeserializeOwned>(
    input: R,
    context: Option<Context>,
) -> Result<T, DeserializeError> {
    let context = context.unwrap_or_default();

    let value = serde_json::from_reader::<R, Value>(input)
        .map_err(ParseError)
        .into_report()
        .change_context(DeserializeError)?;

    let deserializer = Deserializer {
        value: Some(value),
        context: &context,
    };

    T::deserialize(deserializer)
}

pub fn from_slice<T: DeserializeOwned>(
    input: &[u8],
    context: Option<Context>,
) -> Result<T, DeserializeError> {
    let context = context.unwrap_or_default();

    let value = serde_json::from_slice::<Value>(input)
        .map_err(ParseError)
        .into_report()
        .change_context(DeserializeError)?;

    let deserializer = Deserializer {
        value: Some(value),
        context: &context,
    };

    T::deserialize(deserializer)
}

pub fn from_str<T: DeserializeOwned>(
    input: &str,
    context: Option<Context>,
) -> Result<T, DeserializeError> {
    let context = context.unwrap_or_default();

    let value = serde_json::from_str::<Value>(input)
        .map_err(ParseError)
        .into_report()
        .change_context(DeserializeError)?;

    let deserializer = Deserializer {
        value: Some(value),
        context: &context,
    };

    T::deserialize(deserializer)
}

pub fn from_value<T: DeserializeOwned>(
    value: Value,
    context: Option<Context>,
) -> Result<T, DeserializeError> {
    let context = context.unwrap_or_default();

    let deserializer = Deserializer {
        value: Some(value),
        context: &context,
    };

    T::deserialize(deserializer)
}
