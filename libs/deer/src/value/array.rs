use core::iter::Fuse;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializerError, ExpectedType, ReceivedLength,
        ReceivedType, TypeError, Variant,
    },
    schema::visitor::ArraySchema,
    value::{EnumUnitDeserializer, IntoDeserializer},
    ArrayAccess, Context, Deserialize, Deserializer, EnumVisitor, IdentifierVisitor,
    OptionalVisitor, Reflection, StructVisitor, Visitor,
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

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        visitor
            .visit_array(self.value)
            .change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ArraySchema::document()))
            .change_context(DeserializerError))
    }
}

pub struct ArrayIteratorDeserializer<'a, I> {
    context: &'a Context,

    dirty: bool,
    expected: usize,

    iter: Fuse<I>,
}

impl<'a, I> ArrayIteratorDeserializer<'a, I> {
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
impl<'de, I, T> Deserializer<'de> for ArrayIteratorDeserializer<'_, I>
where
    I: Iterator<Item = T>,
    T: IntoDeserializer<'de>,
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
        visitor.visit_array(self).change_context(DeserializerError)
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

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        visitor.visit_array(self).change_context(DeserializerError)
    }

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(ArraySchema::document()))
            .change_context(DeserializerError))
    }
}

impl<'de, I, T> ArrayAccess<'de> for ArrayIteratorDeserializer<'_, I>
where
    I: Iterator<Item = T>,
    T: IntoDeserializer<'de>,
{
    fn is_dirty(&self) -> bool {
        self.dirty
    }

    fn context(&self) -> &Context {
        self.context
    }

    fn next<U>(&mut self) -> Option<Result<U, ArrayAccessError>>
    where
        U: Deserialize<'de>,
    {
        self.dirty = true;

        let deserializer = self.iter.next()?;
        let deserializer = deserializer.into_deserializer(self.context);

        let value = U::deserialize(deserializer);
        self.expected += 1;

        Some(value.change_context(ArrayAccessError))
    }

    fn size_hint(&self) -> Option<usize> {
        self.iter.size_hint().1
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        let remaining = self.iter.count();

        if remaining == 0 {
            return Ok(());
        }

        let error = ArrayLengthError::new(&self, self.expected)
            .attach(ReceivedLength::new(self.expected + remaining));

        Err(error.change_context(ArrayAccessError))
    }
}
