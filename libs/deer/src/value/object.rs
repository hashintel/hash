use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        DeserializerError, ExpectedLength, ObjectLengthError, ReceivedLength, Variant, VisitorError,
    },
    Context, Deserializer, EnumVisitor, FieldVisitor, ObjectAccess, OptionalVisitor, Visitor,
};

// TODO: MapDeserializer/IteratorDeserializer

#[derive(Debug)]
pub struct ObjectAccessDeserializer<'a, T> {
    context: &'a Context,
    value: T,
}

impl<'a, T> ObjectAccessDeserializer<'a, T> {
    #[must_use]
    pub const fn new(context: &'a Context, value: T) -> Self {
        Self { context, value }
    }
}

impl<'de, T> Deserializer<'de> for ObjectAccessDeserializer<'_, T>
where
    T: ObjectAccess<'de>,
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

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_object(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_some(self).change_context(DeserializerError)
    }

    fn deserialize_enum<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        struct EnumFieldVisitor<T>(T);

        impl<'de, T> FieldVisitor<'de> for EnumFieldVisitor<T>
        where
            T: EnumVisitor<'de>,
        {
            type Key = T::Discriminant;
            type Value = T::Value;

            fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, VisitorError>
            where
                D: Deserializer<'de>,
            {
                self.0
                    .visit_discriminant(deserializer)
                    .change_context(VisitorError)
            }

            fn visit_value<D>(
                self,
                key: Self::Key,
                deserializer: D,
            ) -> Result<Self::Value, VisitorError>
            where
                D: Deserializer<'de>,
            {
                self.0
                    .visit_value(key, deserializer)
                    .change_context(VisitorError)
            }
        }

        self.value
            .set_bounded(1)
            .change_context(DeserializerError)?;

        let Some(value) = self.value.field(EnumFieldVisitor(visitor)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(DeserializerError))
        };

        // TODO: fold_results
        self.value.end().change_context(DeserializerError)?;
        value.change_context(DeserializerError)
    }
}
