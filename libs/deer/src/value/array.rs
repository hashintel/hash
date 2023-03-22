use error_stack::{Result, ResultExt};

use crate::{
    error::DeserializerError,
    value::{EnumUnitDeserializer, NoneDeserializer},
    ArrayAccess, Context, Deserializer, EnumVisitor, OptionalVisitor, Visitor,
};

// TODO: SliceDeserializer/IteratorDeserializer

#[derive(Debug)]
pub struct ArrayAccessDeserializer<'a, T> {
    context: &'a Context,
    value: T,
}

impl<'a, T> ArrayAccessDeserializer<'a, T> {
    #[must_use]
    pub const fn new(context: &'a Context, value: T) -> Self {
        Self { context, value }
    }
}

impl<'de, T> Deserializer<'de> for ArrayAccessDeserializer<'_, T>
where
    T: ArrayAccess<'de>,
{
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
        self.context
    }

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_array(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_some(self).change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        EnumUnitDeserializer::new(self.context, self).deserialize_enum(visitor)
    }
}
