use core::marker::PhantomData;

use error_stack::ResultExt;

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct BytesVisitor<'de>(PhantomData<fn() -> &'de ()>);

impl<'de> Visitor<'de> for BytesVisitor<'de> {
    type Value = &'de [u8];

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> error_stack::Result<Self::Value, VisitorError> {
        Ok(v)
    }
}

impl Reflection for [u8] {
    fn schema(_: &mut Document) -> Schema {
        // this type does not really exist in json-schema :/
        // TODO: correct valid schema?
        Schema::new("bytes")
    }
}

impl<'de> Deserialize<'de> for &'de [u8] {
    type Reflection = [u8];

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_bytes(BytesVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
