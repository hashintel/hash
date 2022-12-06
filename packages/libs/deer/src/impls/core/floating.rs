use error_stack::ResultExt;

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct F32Visitor;

impl<'de> Visitor<'de> for F32Visitor {
    type Value = f32;

    fn expecting(&self) -> Document {
        Document::new::<f32>()
    }

    fn visit_f32(self, v: f32) -> error_stack::Result<Self::Value, VisitorError> {
        Ok(v)
    }
}

impl Reflection for f32 {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("number")
    }
}

impl<'de> Deserialize<'de> for f32 {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_f32(F32Visitor)
            .change_context(DeserializeError)
    }
}

struct F64Visitor;

impl<'de> Visitor<'de> for F64Visitor {
    type Value = f64;

    fn expecting(&self) -> Document {
        Document::new::<f64>()
    }

    fn visit_f64(self, v: f64) -> error_stack::Result<Self::Value, VisitorError> {
        Ok(v)
    }
}

impl Reflection for f64 {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("number")
    }
}

impl<'de> Deserialize<'de> for f64 {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_f64(F64Visitor)
            .change_context(DeserializeError)
    }
}
