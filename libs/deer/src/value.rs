// Number, Char, Str, BorrowedStr, String, Bytes, BorrowedBytes, BytesBuffer,
// Array, Object

use error_stack::ResultExt;

use crate::{error::DeserializerError, Context, Deserializer, Visitor};

#[derive(Debug, Copy, Clone)]
pub struct NoneDeserializer<'a> {
    context: &'a Context,
}

impl<'a> NoneDeserializer<'a> {
    #[must_use]
    pub const fn new(context: &'a Context) -> Self {
        Self { context }
    }
}

impl<'de> Deserializer<'de> for NoneDeserializer<'_> {
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

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor.visit_none().change_context(DeserializerError)
    }
}

#[derive(Debug, Copy, Clone)]
pub struct NullDeserializer<'a> {
    context: &'a Context,
}

impl<'a> NullDeserializer<'a> {
    #[must_use]
    pub const fn new(context: &'a Context) -> Self {
        Self { context }
    }
}

impl<'de> Deserializer<'de> for NullDeserializer<'_> {
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

    fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor.visit_null().change_context(DeserializerError)
    }
}

macro_rules! impl_primitive {
    ($ty:ty, $name:ident, $method:ident) => {
        #[derive(Debug, Copy, Clone)]
        pub struct $name<'a> {
            context: &'a Context,
            value: $ty
        }

        impl<'a> $name<'a> {
            #[must_use]
            pub const fn new(value: $ty, context: &'a Context) -> Self {
                Self { value, context }
            }
        }

        impl<'de, 'a> Deserializer<'de> for $name<'a> {
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

            fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: Visitor<'de>,
            {
                visitor.$method(self.value).change_context(DeserializerError)
            }
        }
    };
}

impl_primitive!(bool, BoolDeserializer, visit_bool);
impl_primitive!(char, CharDeserializer, visit_char);
impl_primitive!(u8, U8Deserializer, visit_u8);
impl_primitive!(u16, U16Deserializer, visit_u16);
impl_primitive!(u32, U32Deserializer, visit_u32);
impl_primitive!(u64, U64Deserializer, visit_u64);
impl_primitive!(u128, U128Deserializer, visit_u128);
impl_primitive!(usize, UsizeDeserializer, visit_usize);
impl_primitive!(i8, I8Deserializer, visit_i8);
impl_primitive!(i16, I16Deserializer, visit_i16);
impl_primitive!(i32, I32Deserializer, visit_i32);
impl_primitive!(i64, I64Deserializer, visit_i64);
impl_primitive!(i128, I128Deserializer, visit_i128);
impl_primitive!(isize, IsizeDeserializer, visit_isize);
impl_primitive!(f32, F32Deserializer, visit_f32);
impl_primitive!(f64, F64Deserializer, visit_f64);

// TODO: test
// TODO: branch out into different PR
