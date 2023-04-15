use alloc::string::String;

use error_stack::ResultExt;

use crate::{
    error::DeserializerError,
    value::{impl_owned, EnumUnitDeserializer, IntoDeserializer, NoneDeserializer},
    Context, Deserializer, EnumVisitor, OptionalVisitor, Visitor,
};

#[derive(Debug, Copy, Clone)]
pub struct StrDeserializer<'a, 'b> {
    context: &'a Context,
    value: &'b str,
}

impl<'a, 'b> StrDeserializer<'a, 'b> {
    #[must_use]
    pub const fn new(value: &'b str, context: &'a Context) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for StrDeserializer<'_, '_> {
    forward_to_deserialize_any!(
        null
        bool
        number
        i8 i16 i32 i64 i128
        u8 u16 u32 u64 u128
        f32 f64
        char str string
        bytes bytes_buffer
        array object
    );

    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_str(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_some(self).change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let context = self.context;

        let discriminant = visitor
            .visit_discriminant(self)
            .change_context(DeserializerError)?;

        visitor
            .visit_value(discriminant, NoneDeserializer::new(context))
            .change_context(DeserializerError)
    }
}

impl<'de, 'b> IntoDeserializer<'de> for &'b str {
    type Deserializer<'a> = StrDeserializer<'a, 'b> where Self: 'a;

    fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
    where
        Self: 'a,
    {
        StrDeserializer::new(self, context)
    }
}

#[derive(Debug, Copy, Clone)]
pub struct BorrowedStrDeserializer<'a, 'de> {
    context: &'a Context,
    value: &'de str,
}

impl<'a, 'de> BorrowedStrDeserializer<'a, 'de> {
    #[must_use]
    pub const fn new(value: &'de str, context: &'a Context) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for BorrowedStrDeserializer<'_, 'de> {
    forward_to_deserialize_any!(
        null
        bool
        number
        i8 i16 i32 i64 i128
        u8 u16 u32 u64 u128
        f32 f64
        char str string
        bytes bytes_buffer
        array object
    );

    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_borrowed_str(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_some(self).change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        EnumUnitDeserializer::new(self.context, self).deserialize_enum(visitor)
    }
}

impl_owned!(!copy: String, StringDeserializer, visit_string);
