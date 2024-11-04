use error_stack::{Report, ResultExt as _};

use crate::{
    ArrayAccess, Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor,
    Reflection as _, StructVisitor, Visitor,
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant as _},
    schema::visitor::ArraySchema,
    value::EnumUnitDeserializer,
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

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_array(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_some(self).change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: EnumVisitor<'de>,
    {
        EnumUnitDeserializer::new(self.context, self).deserialize_enum(visitor)
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: StructVisitor<'de>,
    {
        visitor
            .visit_array(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ArraySchema::document()))
            .change_context(DeserializerError))
    }
}
