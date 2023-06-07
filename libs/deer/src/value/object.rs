use core::iter::Fuse;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        DeserializerError, ExpectedLength, ExpectedType, ObjectAccessError, ObjectLengthError,
        ReceivedLength, ReceivedType, TypeError, Variant, VisitorError,
    },
    ext::TupleExt,
    schema::visitor::ObjectSchema,
    value::IntoDeserializer,
    Context, Deserializer, EnumVisitor, FieldVisitor, IdentifierVisitor, ObjectAccess,
    OptionalVisitor, Reflection, StructVisitor, Visitor,
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

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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

        let mut access = self.value.into_bound(1).change_context(DeserializerError)?;

        let Some(value) = access.field(EnumFieldVisitor(visitor)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(DeserializerError))
        };

        let (value, _) = (value, access.end())
            .fold_reports()
            .change_context(DeserializerError)?;

        Ok(value)
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        visitor
            .visit_object(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ObjectSchema::document()))
            .change_context(DeserializerError))
    }
}

pub struct ObjectIteratorDeserializer<'a, I> {
    context: &'a Context,

    dirty: bool,
    expected: usize,

    iter: Fuse<I>,
}

impl<'a, I> ObjectIteratorDeserializer<'a, I> {
    #[must_use]
    pub const fn new(context: &'a Context, iter: I) -> Self
    where
        I: Iterator,
    {
        Self {
            context,

            dirty: false,
            expected: 0,

            iter: iter.fuse(),
        }
    }
}

// TODO: test
impl<'de, I, T, U> Deserializer<'de> for ObjectIteratorDeserializer<'_, I>
where
    I: Iterator<Item = (T, U)>,
    T: IntoDeserializer<'de>,
    U: IntoDeserializer<'de>,
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
        visitor.visit_object(self).change_context(DeserializerError)
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

        let mut access = self.into_bound(1).change_context(DeserializerError)?;

        let Some(value) = access.field(EnumFieldVisitor(visitor)) else {
            return Err(Report::new(ObjectLengthError.into_error())
                .attach(ExpectedLength::new(1))
                .attach(ReceivedLength::new(0))
                .change_context(DeserializerError))
        };

        let (value, _) = (value, access.end())
            .fold_reports()
            .change_context(DeserializerError)?;

        Ok(value)
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        visitor.visit_object(self).change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ObjectSchema::document()))
            .change_context(DeserializerError))
    }
}

impl<'de, I, T, U> ObjectAccess<'de> for ObjectIteratorDeserializer<'_, I>
where
    I: Iterator<Item = (T, U)>,
    T: IntoDeserializer<'de>,
    U: IntoDeserializer<'de>,
{
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn context(&self) -> &Context {
        self.context
    }

    fn try_field<F>(
        &mut self,
        visitor: F,
    ) -> core::result::Result<Result<F::Value, ObjectAccessError>, F>
    where
        F: FieldVisitor<'de>,
    {
        self.dirty = true;

        let Some((key, value)) = self.iter.next() else {
            return Err(visitor);
        };

        let key = key.into_deserializer(self.context);
        let value = value.into_deserializer(self.context);

        let key = visitor.visit_key(key);
        let value = key.and_then(|key| visitor.visit_value(key, value));

        Ok(value.change_context(ObjectAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        self.iter.size_hint().1
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        let remaining = self.iter.count();

        if remaining == 0 {
            return Ok(());
        }

        let error = ObjectLengthError::new(&self, self.expected)
            .attach(ReceivedLength::new(self.expected + remaining));

        Err(error.change_context(ObjectAccessError))
    }
}
