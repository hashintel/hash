use core::marker::PhantomData;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant,
        VisitorError,
    },
    schema::Reference,
    Deserialize, Deserializer, Document, EnumVisitor, Reflection, Schema, Visitor,
};

enum ResultDiscriminant {
    Ok,
    Err,
}

struct ResultDiscriminantVisitor;

impl<'de> Visitor<'de> for ResultDiscriminantVisitor {
    type Value = ResultDiscriminant;

    fn expecting(&self) -> Document {
        ResultDiscriminant::reflection()
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        match v {
            "Ok" => Ok(ResultDiscriminant::Ok),
            "Err" => Ok(ResultDiscriminant::Err),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ExpectedVariant::new("Err"))
                .attach(ExpectedVariant::new("Ok"))
                .attach(ReceivedVariant::new(v))
                .change_context(VisitorError)),
        }
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        match v {
            b"Ok" => Ok(ResultDiscriminant::Ok),
            b"Err" => Ok(ResultDiscriminant::Err),
            _ => {
                let mut error = Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Err"))
                    .attach(ExpectedVariant::new("Ok"));

                if let Ok(received) = core::str::from_utf8(v) {
                    error = error.attach(ReceivedVariant::new(received));
                }

                Err(error.change_context(VisitorError))
            }
        }
    }
}

impl Reflection for ResultDiscriminant {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Ok", "Err"])
    }
}

impl<'de> Deserialize<'de> for ResultDiscriminant {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_str(ResultDiscriminantVisitor)
            .change_context(DeserializeError)
    }
}

struct ResultEnumVisitor<T, E>(PhantomData<fn() -> *const core::result::Result<T, E>>);

impl<'de, T, E> EnumVisitor<'de> for ResultEnumVisitor<T, E>
where
    T: Deserialize<'de>,
    E: Deserialize<'de>,
{
    type Discriminant = ResultDiscriminant;
    type Value = core::result::Result<T, E>;

    fn expecting(&self) -> Document {
        todo!()
    }

    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        deserializer: D,
    ) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        match discriminant {
            ResultDiscriminant::Ok => T::deserialize(deserializer)
                .map(Ok)
                .change_context(VisitorError),
            ResultDiscriminant::Err => E::deserialize(deserializer)
                .map(Err)
                .change_context(VisitorError),
        }
    }
}

pub struct ResultReflection<T: ?Sized, E: ?Sized>(PhantomData<fn() -> (*const T, *const E)>);

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

impl<'de, T, E> Deserialize<'de> for core::result::Result<T, E>
where
    T: Deserialize<'de>,
    E: Deserialize<'de>,
{
    type Reflection = ResultReflection<T::Reflection, E::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_enum(ResultEnumVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
