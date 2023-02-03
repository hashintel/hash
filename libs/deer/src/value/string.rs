use alloc::string::String;

use error_stack::ResultExt;

use crate::{error::DeserializerError, value::impl_owned, Context, Deserializer, Visitor};

pub struct StrDeserializer<'a, 'b> {
    context: &'a Context,
    value: &'b str,
}

impl<'a, 'b> StrDeserializer<'a, 'b> {
    #[must_use]
    pub const fn new(context: &'a Context, value: &'b str) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for StrDeserializer<'_, '_> {
    forward_to_deserialize_any!(
        null
        bool
        number
        i8 i16 i32 i64 i128 isize
        u8 u16 u32 u64 u128 usize
        f32 f64
        char str string
        bytes bytes_buffer
        array object
    );

    fn context(&self) -> &Context {
        &self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_str(self.value)
            .change_context(DeserializerError)
    }
}

pub struct BorrowedStrDeserializer<'a, 'de> {
    context: &'a Context,
    value: &'de str,
}

impl<'a, 'de> BorrowedStrDeserializer<'a, 'de> {
    #[must_use]
    pub const fn new(context: &'a Context, value: &'de str) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for BorrowedStrDeserializer<'_, 'de> {
    forward_to_deserialize_any!(
        null
        bool
        number
        i8 i16 i32 i64 i128 isize
        u8 u16 u32 u64 u128 usize
        f32 f64
        char str string
        bytes bytes_buffer
        array object
    );

    fn context(&self) -> &Context {
        &self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_borrowed_str(self.value)
            .change_context(DeserializerError)
    }
}

impl_owned!(!copy: String, StringDeserializer, visit_string);
