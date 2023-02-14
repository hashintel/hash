use alloc::{string::String, vec::Vec};
use core::marker::PhantomData;

use error_stack::{Result, ResultExt};

use crate::{
    error::{DeserializeError, VisitorError},
    value::{
        ArrayAccessDeserializer, BoolDeserializer, BorrowedBytesDeserializer,
        BorrowedStrDeserializer, BytesBufferDeserializer, BytesDeserializer, CharDeserializer,
        F32Deserializer, F64Deserializer, I128Deserializer, I16Deserializer, I32Deserializer,
        I64Deserializer, I8Deserializer, IsizeDeserializer, NumberDeserializer,
        ObjectAccessDeserializer, StrDeserializer, StringDeserializer, U128Deserializer,
        U16Deserializer, U32Deserializer, U64Deserializer, U8Deserializer, UsizeDeserializer,
    },
    ArrayAccess, Context, Deserialize, Deserializer, Document, Number, ObjectAccess, Reflection,
    Schema, Visitor,
};

struct OptionVisitor<'a, T>(PhantomData<fn() -> *const T>, &'a Context);

impl<'de, T: Deserialize<'de>> Visitor<'de> for OptionVisitor<'_, T> {
    type Value = Option<T>;

    fn expecting(&self) -> Document {
        Self::Value::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Ok(None)
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(None)
    }

    fn visit_bool(self, v: bool) -> Result<Self::Value, VisitorError> {
        T::deserialize(BoolDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
        T::deserialize(NumberDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_char(self, v: char) -> Result<Self::Value, VisitorError> {
        T::deserialize(CharDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        T::deserialize(StrDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_borrowed_str(self, v: &'de str) -> Result<Self::Value, VisitorError> {
        T::deserialize(BorrowedStrDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_string(self, v: String) -> Result<Self::Value, VisitorError> {
        T::deserialize(StringDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        T::deserialize(BytesDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_borrowed_bytes(self, v: &'de [u8]) -> Result<Self::Value, VisitorError> {
        T::deserialize(BorrowedBytesDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_bytes_buffer(self, v: Vec<u8>) -> Result<Self::Value, VisitorError> {
        T::deserialize(BytesBufferDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_array<U>(self, v: U) -> Result<Self::Value, VisitorError>
    where
        U: ArrayAccess<'de>,
    {
        T::deserialize(ArrayAccessDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_object<U>(self, v: U) -> Result<Self::Value, VisitorError>
    where
        U: ObjectAccess<'de>,
    {
        T::deserialize(ObjectAccessDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_i8(self, v: i8) -> Result<Self::Value, VisitorError> {
        T::deserialize(I8Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_i16(self, v: i16) -> Result<Self::Value, VisitorError> {
        T::deserialize(I16Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_i32(self, v: i32) -> Result<Self::Value, VisitorError> {
        T::deserialize(I32Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_i64(self, v: i64) -> Result<Self::Value, VisitorError> {
        T::deserialize(I64Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_i128(self, v: i128) -> Result<Self::Value, VisitorError> {
        T::deserialize(I128Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_isize(self, v: isize) -> Result<Self::Value, VisitorError> {
        T::deserialize(IsizeDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_u8(self, v: u8) -> Result<Self::Value, VisitorError> {
        T::deserialize(U8Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_u16(self, v: u16) -> Result<Self::Value, VisitorError> {
        T::deserialize(U16Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_u32(self, v: u32) -> Result<Self::Value, VisitorError> {
        T::deserialize(U32Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_u64(self, v: u64) -> Result<Self::Value, VisitorError> {
        T::deserialize(U64Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_u128(self, v: u128) -> Result<Self::Value, VisitorError> {
        T::deserialize(U128Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_usize(self, v: usize) -> Result<Self::Value, VisitorError> {
        T::deserialize(UsizeDeserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_f32(self, v: f32) -> Result<Self::Value, VisitorError> {
        T::deserialize(F32Deserializer::new(v, &self.1)).change_context(VisitorError)
    }

    fn visit_f64(self, v: f64) -> Result<Self::Value, VisitorError> {
        T::deserialize(F64Deserializer::new(v, &self.1)).change_context(VisitorError)
    }
}

impl<T: Reflection> Reflection for Option<T> {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: how?!
        todo!()
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Option<T> {
    type Reflection = Option<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        // TODO: is deserialize_any ok here?
        de.deserialize_any(OptionVisitor(PhantomData, de.context()))
            .change_context(DeserializeError)
    }
}
