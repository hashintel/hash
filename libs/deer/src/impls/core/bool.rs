use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct BoolVisitor;

impl<'de> Visitor<'de> for BoolVisitor {
    type Value = bool;

    fn expecting(&self) -> Document {
        bool::document()
    }

    fn visit_bool(self, v: bool) -> Result<Self::Value, VisitorError> {
        Ok(v)
    }
}

impl Reflection for bool {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("boolean")
    }
}

impl<'de> Deserialize<'de> for bool {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_bool(BoolVisitor)
            .change_context(DeserializeError)
    }
}
