use alloc::vec::Vec;

use error_stack::ResultExt;

use crate::{error::DeserializerError, value::impl_owned, Context, Deserializer, Visitor};

pub struct BytesDeserializer<'a, 'b> {
    context: &'a Context,
    value: &'b [u8],
}

impl<'a, 'b> BytesDeserializer<'a, 'b> {
    #[must_use]
    pub const fn new(context: &'a Context, value: &'b [u8]) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for BytesDeserializer<'_, '_> {
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
            .visit_bytes(self.value)
            .change_context(DeserializerError)
    }
}

pub struct BorrowedBytesDeserializer<'a, 'de> {
    context: &'a Context,
    value: &'de [u8],
}

impl<'a, 'de> BorrowedBytesDeserializer<'a, 'de> {
    #[must_use]
    pub const fn new(context: &'a Context, value: &'de [u8]) -> Self {
        Self { context, value }
    }
}

impl<'de> Deserializer<'de> for BorrowedBytesDeserializer<'_, 'de> {
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
            .visit_borrowed_bytes(self.value)
            .change_context(DeserializerError)
    }
}

impl_owned!(!copy: Vec<u8>, BytesBufferDeserializer, visit_bytes_buffer);
