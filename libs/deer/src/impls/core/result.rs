use alloc::string::String;
use core::marker::PhantomData;

use error_stack::{Context, FutureExt, IntoReport, Report, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedLength, ExpectedVariant, FieldAccessError, ObjectAccessError,
        ObjectItemsExtraError, ObjectLengthError, ReceivedLength, ReceivedVariant,
        UnknownVariantError, Variant, VisitorError,
    },
    impls::helpers::{FieldDiscriminatorKey, FieldDiscriminatorKeyAccess},
    schema::Reference,
    Deserialize, Deserializer, Document, FieldAccess, ObjectAccess, Reflection, Schema, Visitor,
};

struct ResultFieldAccess<T, E>(PhantomData<fn() -> *const (T, E)>);

impl<'de, T, E> FieldAccess<'de> for ResultFieldAccess<T, E>
where
    T: Deserialize<'de>,
    E: Deserialize<'de>,
{
    type Key = ResultField;
    type Value = Result<T, E>;

    fn value<D>(
        &self,
        key: &Self::Key,
        deserializer: D,
    ) -> error_stack::Result<Self::Value, FieldAccessError>
    where
        D: Deserializer<'de>,
    {
        match key {
            ResultField::Ok => T::deserialize(deserializer).map(Ok),
            ResultField::Err => E::deserialize(deserializer).map_err(Err),
        }
        .change_context(FieldAccessError)
    }
}

enum ResultField {
    Ok,
    Err,
}

impl Reflection for ResultField {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Ok", "Err"])
    }
}

impl FieldDiscriminatorKey for ResultField {
    fn try_str(value: &str) -> Option<Self> {
        match value {
            "Ok" => Some(ResultField::Ok),
            "Err" => Some(ResultField::Err),
            _ => None,
        }
    }

    fn try_bytes(value: &[u8]) -> Option<Self> {
        match value {
            b"Ok" => Some(ResultField::Ok),
            b"Err" => Some(ResultField::Err),
            _ => None,
        }
    }
}

impl<'de> Deserialize<'de> for ResultField {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_str(FieldDiscriminatorKeyAccess::new())
            .change_context(DeserializeError)
    }
}

struct ResultVisitor<T, E>(PhantomData<fn() -> *const Result<T, E>>);

impl<'de, T: Deserialize<'de>, E: Deserialize<'de>> Visitor<'de> for ResultVisitor<T, E> {
    type Value = Result<T, E>;

    fn expecting(&self) -> Document {
        todo!()
    }

    fn visit_object<O>(self, mut v: O) -> error_stack::Result<Self::Value, VisitorError>
    where
        O: ObjectAccess<'de>,
    {
        v.set_bounded(1).change_context(VisitorError)?;

        let Some(field) = v.field(ResultFieldAccess(PhantomData)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(VisitorError));
        };

        v.end()?;

        field.map(|(_, value)| value).change_context(VisitorError)
    }
}

struct ResultReflection<T: ?Sized, E: ?Sized>(PhantomData<(*const T, *const E)>);

impl<T, E> Reflection for ResultReflection<T, E>
where
    T: Reflection + ?Sized,
    E: Reflection + ?Sized,
{
    /// # Schema
    ///
    /// ```json
    /// {
    ///     "type": "object",
    ///     "additionalProperties": false,
    ///     "oneOf": [
    ///         {"properties": {"Ok": <ref>}}
    ///         {"properties": {"Err": <ref>}}
    ///     ]
    /// }
    /// ```
    fn schema(doc: &mut Document) -> Schema {
        #[derive(serde::Serialize)]
        enum Properties {
            Ok(Reference),
            Err(Reference),
        }

        Schema::new("object")
            .with("oneOf", [
                Properties::Ok(doc.add::<T>()),
                Properties::Err(doc.add::<E>()),
            ])
            .with("additionalProperties", false)
    }
}

impl<'de, T: Deserialize<'de>, E: Deserialize<'de>> Deserialize<'de> for Result<T, E> {
    type Reflection = ResultReflection<T::Reflection, E::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_object(ResultVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
