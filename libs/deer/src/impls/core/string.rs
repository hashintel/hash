use core::marker::PhantomData;

use error_stack::{Report, ResultExt as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{DeserializeError, ExpectedType, ReceivedType, TypeError, Variant as _, VisitorError},
};

struct StrVisitor<'a>(PhantomData<fn() -> &'a ()>);

impl<'de: 'a, 'a> Visitor<'de> for StrVisitor<'a> {
    type Value = &'a str;

    fn expecting(&self) -> Document {
        <&str>::reflection()
    }

    fn visit_borrowed_str(self, value: &'de str) -> Result<Self::Value, Report<VisitorError>> {
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_str(StrVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}

struct CharVisitor;

impl Visitor<'_> for CharVisitor {
    type Value = char;

    fn expecting(&self) -> Document {
        Document::new::<char>()
    }

    fn visit_char(self, value: char) -> Result<Self::Value, Report<VisitorError>> {
        Ok(value)
    }

    fn visit_str(self, value: &str) -> Result<Self::Value, Report<VisitorError>> {
        let mut chars = value.chars();

        let first = chars.next();
        let second = chars.next();

        match (first, second) {
            (Some(value), None) => Ok(value),
            _ => Err(Report::new(TypeError.into_error())
                .attach(ExpectedType::new(self.expecting()))
                .attach(ReceivedType::new(str::document()))
                .change_context(VisitorError)),
        }
    }
}

// TODO: visit_str!

impl Reflection for char {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("string")
            .with("minLength", 1)
            .with("maxLength", 1)
    }
}

impl<'de> Deserialize<'de> for char {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_char(CharVisitor)
            .change_context(DeserializeError)
    }
}
