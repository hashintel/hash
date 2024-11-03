use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, OptionalVisitor, Reflection, Schema,
    error::{DeserializeError, Location, VisitorError},
};

struct OptionVisitor<T>(PhantomData<fn() -> *const T>);

impl<'de, T: Deserialize<'de>> OptionalVisitor<'de> for OptionVisitor<T> {
    type Value = Option<T>;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(None)
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(None)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, Report<VisitorError>>
    where
        D: Deserializer<'de>,
    {
        T::deserialize(deserializer)
            .map(Some)
            .attach(Location::Variant("Some"))
            .change_context(VisitorError)
    }
}

pub struct OptionReflection<T: ?Sized>(PhantomData<fn() -> *const T>);

impl<T: Reflection + ?Sized> Reflection for OptionReflection<T> {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: an accurate reflection is not really possible right now
        //  we need to do oneOf null/none/T and `Schema` does not support it right now
        //  this needs to be fixed until `0.1`
        // For now we just fallback to `T`
        T::schema(doc)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Option<T> {
    type Reflection = OptionReflection<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_optional(OptionVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
