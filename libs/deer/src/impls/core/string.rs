use core::marker::PhantomData;

use error_stack::ResultExt;

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct StrVisitor<'a>(PhantomData<fn() -> &'a ()>);

impl<'de: 'a, 'a> Visitor<'de> for StrVisitor<'a> {
    type Value = &'a str;

    fn expecting(&self) -> Document {
        <&str>::reflection()
    }

    fn visit_borrowed_str(self, value: &'de str) -> error_stack::Result<Self::Value, VisitorError> {
        Ok(value)
    }
}

impl Reflection for str {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string")
    }
}

impl<'de: 'a, 'a> Deserialize<'de> for &'a str {
    type Reflection = str;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_str(StrVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}

struct CharVisitor;

impl<'de> Visitor<'de> for CharVisitor {
    type Value = char;

    fn expecting(&self) -> Document {
        Document::new::<char>()
    }

    fn visit_char(self, value: char) -> error_stack::Result<Self::Value, VisitorError> {
        Ok(value)
    }
}

impl Reflection for char {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string")
            .with("minLength", 1)
            .with("maxLength", 1)
    }
}

impl<'de> Deserialize<'de> for char {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        de.deserialize_char(CharVisitor)
            .change_context(DeserializeError)
    }
}
