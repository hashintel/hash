use error_stack::Result;

use crate::{
    content::Content, error::DeserializerError, sealed::T, Context, Deserializer, EnumVisitor,
    IdentifierVisitor, OptionalVisitor, StructVisitor, Visitor,
};

struct ContentRefDeserializer<'a, 'de: 'a> {
    content: &'a Content<'de>,
    context: &'a mut Context,
}

impl<'de> Deserializer<'de> for ContentRefDeserializer<'_, 'de> {
    fn context(&self) -> &Context {
        &self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        todo!()
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        todo!()
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        todo!()
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        todo!()
    }

    // TODO: is there a better way? I don't think without specialization (default impl)
    fn __deserialize_content<V>(self, _: T, visitor: V) -> Result<Content<'de>, DeserializerError>
    where
        V: Visitor<'de, Value = Content<'de>>,
    {
        let _ = visitor;

        Ok(self.content.clone())
    }
}
