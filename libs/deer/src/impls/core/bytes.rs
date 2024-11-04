use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{DeserializeError, VisitorError},
};

struct BytesVisitor<'de>(PhantomData<fn() -> &'de ()>);

impl<'de> Visitor<'de> for BytesVisitor<'de> {
    type Value = &'de [u8];

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_borrowed_bytes(self, value: &'de [u8]) -> Result<Self::Value, Report<VisitorError>> {
        Ok(value)
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_bytes(BytesVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
