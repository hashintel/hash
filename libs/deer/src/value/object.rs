use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};

use crate::{
    Context, Deserializer, EnumVisitor, FieldVisitor, IdentifierVisitor, ObjectAccess,
    OptionalVisitor, Reflection as _, StructVisitor, Visitor,
    error::{
        DeserializerError, ExpectedLength, ExpectedType, ObjectLengthError, ReceivedLength,
        ReceivedType, TypeError, Variant as _, VisitorError,
    },
    schema::visitor::ObjectSchema,
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

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: Visitor<'de>,
    {
        visitor
            .visit_object(self.value)
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
        struct EnumFieldVisitor<T>(T);

        impl<'de, T> FieldVisitor<'de> for EnumFieldVisitor<T>
        where
            T: EnumVisitor<'de>,
        {
            type Key = T::Discriminant;
            type Value = T::Value;

            fn visit_key<D>(&self, deserializer: D) -> Result<Self::Key, Report<VisitorError>>
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
            ) -> Result<Self::Value, Report<VisitorError>>
            where
                D: Deserializer<'de>,
            {
                self.0
                    .visit_value(key, deserializer)
                    .change_context(VisitorError)
            }
        }

        let mut access = self.value.into_bound(1).change_context(DeserializerError)?;

        let Some(value) = access.field(EnumFieldVisitor(visitor)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(DeserializerError));
        };

        let (value, ()) = (value, access.end())
            .try_collect()
            .change_context(DeserializerError)?;

        Ok(value)
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: StructVisitor<'de>,
    {
        visitor
            .visit_object(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, Report<DeserializerError>>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ObjectSchema::document()))
            .change_context(DeserializerError))
    }
}
