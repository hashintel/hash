use core::marker::PhantomData;

use error_stack::{FutureExt, IntoReport, Report, ResultExt};

use crate::{
    error::{
        DeserializeError, ExpectedVariant, ObjectAccessError, ReceivedVariant, UnknownVariantError,
        Variant, VisitorError,
    },
    Deserialize, Deserializer, Document, FieldAccess, ObjectAccess, Reflection, Schema, Visitor,
};

// rename into field visitor!
enum Field<T, E> {
    Ok,
    Err,
}

impl<'de, T: Deserialize<'de>, E: Deserialize<'de>> Deserialize<'de> for Field<T, E> {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_str(de).change_context(DeserializeError)
    }
}

impl<'de, T: Deserialize<'de>, E: Deserialize<'de>> FieldAccess<'de> for Field<T, E> {
    type Value = Result<T, E>;

    fn value<D>(&self, deserializer: D) -> error_stack::Result<Self::Value, ObjectAccessError>
    where
        D: Deserializer<'de>,
    {
        match self {
            Self::Ok => T::deserialize(deserializer)
                .map(Ok)
                .change_context(ObjectAccessError),

            Self::Err => T::deserialize(deserializer)
                .map(Err)
                .change_context(ObjectAccessError),
        }
    }
}

impl Reflection for Field {
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("string").with("enum", ["Ok", "Err"])
    }
}

struct FieldVisitor;

impl<'de> Visitor<'de> for FieldVisitor {
    type Value = Field;

    fn expecting(&self) -> Document {
        Field::reflection()
    }

    fn visit_str(self, v: &str) -> error_stack::Result<Self::Value, VisitorError> {
        match v {
            "Ok" => Ok(Field::Ok),
            "Err" => Ok(Field::Err),
            name => Err(Report::new(UnknownVariantError.into_error())
                .attach(ReceivedVariant::new(name))
                .attach(ExpectedVariant::new("Ok"))
                .attach(ExpectedVariant::new("Err"))
                .change_context(VisitorError)),
        }
    }

    fn visit_bytes(self, v: &[u8]) -> error_stack::Result<Self::Value, VisitorError> {
        match v {
            b"Ok" => Ok(Field::Ok),
            b"Err" => Ok(Field::Err),
            name => {
                let value = core::str::from_utf8(name)
                    .into_report()
                    .change_context(UnknownVariantError.into_error())
                    .attach(ExpectedVariant::new("Ok"))
                    .attach(ExpectedVariant::new("Err"))
                    .change_context(VisitorError)?;

                Err(Report::new(UnknownVariantError.into_error())
                    .attach(ReceivedVariant::new(value))
                    .attach(ExpectedVariant::new("Ok"))
                    .attach(ExpectedVariant::new("Err"))
                    .change_context(VisitorError))
            }
        }
    }
}

impl<'de> Deserialize<'de> for Field {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        todo!()
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

        // TODO: the problem - the type is different depending on the variant
        //  we would first need to get the key THEN the value

        // TODO: value by key
        v.next_late(|key: &Field| match key {
            Field::Ok => T::deserialize(),
            Field::Err => V::deserialize,
        });
    }
}

impl<'de, T: Deserialize<'de>, E: Deserialize<'de>> Deserialize<'de> for Result<T, E> {
    type Reflection = ();

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        todo!()
    }
}
