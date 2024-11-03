use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{DeserializeError, VisitorError},
};

struct BoolVisitor;

impl Visitor<'_> for BoolVisitor {
    type Value = bool;

    fn expecting(&self) -> Document {
        bool::document()
    }

    fn visit_bool(self, value: bool) -> Result<Self::Value, Report<VisitorError>> {
        Ok(value)
    }
}

impl Reflection for bool {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("boolean")
    }
}

impl<'de> Deserialize<'de> for bool {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_bool(BoolVisitor)
            .change_context(DeserializeError)
    }
}
