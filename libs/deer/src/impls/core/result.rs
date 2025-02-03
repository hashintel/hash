use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, EnumVisitor, Reflection, Schema, Visitor,
    error::{
        DeserializeError, ExpectedVariant, Location, ReceivedVariant, UnknownVariantError,
        Variant as _, VisitorError,
    },
    schema::Reference,
};

enum ResultDiscriminant {
    Ok,
    Err,
}

struct ResultDiscriminantVisitor;

impl Visitor<'_> for ResultDiscriminantVisitor {
    type Value = ResultDiscriminant;

    fn expecting(&self) -> Document {
        ResultDiscriminant::reflection()
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        match value {
            "Ok" => Ok(ResultDiscriminant::Ok),
            "Err" => Ok(ResultDiscriminant::Err),
            _ => Err(Report::new(UnknownVariantError.into_error())
                .attach(ExpectedVariant::new("Err"))
                .attach(ExpectedVariant::new("Ok"))
                .attach(ReceivedVariant::new(value))
                .change_context(VisitorError)),
        }
    }

    fn visit_bytes(self, value: &[u8]) -> Result<Self::Value, Report<VisitorError>> {
        match value {
            b"Ok" => Ok(ResultDiscriminant::Ok),
            b"Err" => Ok(ResultDiscriminant::Err),
            _ => {
                let mut error = Report::new(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Err"))
                    .attach(ExpectedVariant::new("Ok"));

                if let Ok(received) = core::str::from_utf8(value) {
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_str(ResultDiscriminantVisitor)
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
        Self::Value::reflection()
    }

    fn visit_value<D>(
        self,
        discriminant: Self::Discriminant,
        deserializer: D,
    ) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        match discriminant {
            ResultDiscriminant::Ok => T::deserialize(deserializer)
                .map(Ok)
                .attach(Location::Variant("Ok"))
                .change_context(VisitorError),
            ResultDiscriminant::Err => E::deserialize(deserializer)
                .map(Err)
                .attach(Location::Variant("Err"))
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
            .with(
                "oneOf",
                [
                    Properties::Ok(doc.add::<T>()),
                    Properties::Err(doc.add::<E>()),
                ],
            )
            .with("additionalProperties", false)
    }
}

impl<'de, T, E> Deserialize<'de> for core::result::Result<T, E>
where
    T: Deserialize<'de>,
    E: Deserialize<'de>,
{
    type Reflection = ResultReflection<T::Reflection, E::Reflection>;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_enum(ResultEnumVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
