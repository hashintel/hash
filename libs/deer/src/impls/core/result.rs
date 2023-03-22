use alloc::string::String;
use core::marker::PhantomData;

use error_stack::{Context, FutureExt, IntoReport, Report, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedLength, ExpectedVariant, FieldAccessError, ObjectAccessError,
        ObjectItemsExtraError, ObjectLengthError, ReceivedLength, ReceivedVariant,
        UnknownVariantError, Variant, VisitorError,
    },
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

struct FieldVisitor;

impl FieldVisitor {
    fn unknown_variant_error(name: impl Into<String>) -> Report<impl Context> {
        Report::new(UnknownVariantError.into_error())
            .attach(ReceivedVariant::new(name))
            .attach(ExpectedVariant::new("Ok"))
            .attach(ExpectedVariant::new("Err"))
            .change_context(VisitorError)
    }
}

impl<'de> Visitor<'de> for FieldVisitor {
    type Value = ResultField;

    fn expecting(&self) -> Document {
        ResultField::reflection()
    }

    fn visit_str(self, v: &str) -> error_stack::Result<Self::Value, VisitorError> {
        match v {
            "Ok" => Ok(ResultField::Ok),
            "Err" => Ok(ResultField::Err),
            name => Err(Self::unknown_variant_error(name)),
        }
    }

    fn visit_bytes(self, v: &[u8]) -> error_stack::Result<Self::Value, VisitorError> {
        match v {
            b"Ok" => Ok(ResultField::Ok),
            b"Err" => Ok(ResultField::Err),
            name => {
                let value = core::str::from_utf8(name)
                    .into_report()
                    .change_context(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Ok"))
                    .attach(ExpectedVariant::new("Err"))
                    .change_context(VisitorError)?;

                Err(Self::unknown_variant_error(value))
            }
        }
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

impl<'de> Deserialize<'de> for ResultField {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_str(FieldVisitor)
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
