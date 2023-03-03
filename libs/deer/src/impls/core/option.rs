use core::marker::PhantomData;

use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, ObjectAccess, OptionalVisitor, Reflection, Schema,
    Visitor,
};

struct OptionVisitor<T>(PhantomData<fn() -> *const T>);

impl<'de, T: Deserialize<'de>> OptionalVisitor<'de> for OptionVisitor<T> {
    type Value = Option<T>;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Ok(None)
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(None)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, VisitorError>
    where
        D: Deserializer<'de>,
    {
        T::deserialize(deserializer)
            .change_context(VisitorError)
            .map(Some)
    }
}

impl<T: Reflection + ?Sized> Reflection for Option<T> {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: how?!
        todo!()
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Option<T> {
    type Reflection = Option<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_optional(OptionVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
