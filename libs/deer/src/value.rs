mod array;
mod bytes;
mod object;
mod string;

pub use array::ArrayAccessDeserializer;
pub use bytes::{BorrowedBytesDeserializer, BytesBufferDeserializer, BytesDeserializer};
use error_stack::ResultExt;
pub use object::ObjectAccessDeserializer;
pub use string::{BorrowedStrDeserializer, StrDeserializer, StringDeserializer};

use crate::{error::DeserializerError, Context, Deserializer, Number, Visitor};

macro_rules! impl_owned {
    (@INTERNAL COPY, $ty:ty, $name:ident, $method:ident) => {
        #[derive(Debug, Copy, Clone)]
        pub struct $name<'a> {
            context: &'a Context,
            value: $ty
        }
    };

    (@INTERNAL CLONE, $ty:ty, $name:ident, $method:ident) => {
        #[derive(Debug, Clone)]
        pub struct $name<'a> {
            context: &'a Context,
            value: $ty
        }
    };

    (@INTERNAL IMPL, $ty:ty, $name:ident, $method:ident) => {
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

            fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: Visitor<'de>
            {
                visitor.visit_some(self).change_context(DeserializerError)
            }
        }

        impl<'de> IntoDeserializer<'de> for $ty {
            type Deserializer<'a> = $name<'a> where Self: 'a;

            fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
            where
                Self: 'a {
                $name::new(self, context)
            }
        }
    };

    (copy: $ty:ty, $name:ident, $method:ident) => {
        impl_owned!(@INTERNAL COPY, $ty, $name, $method);
        impl_owned!(@INTERNAL IMPL, $ty, $name, $method);
    };

    (!copy: $ty:ty, $name:ident, $method:ident) => {
        impl_owned!(@INTERNAL CLONE, $ty, $name, $method);
        impl_owned!(@INTERNAL IMPL, $ty, $name, $method);
    };

    ($ty:ty, $name:ident, $method:ident) => {
        impl_owned!(copy: $ty, $name, $method);
    };
}

use impl_owned;

pub trait IntoDeserializer<'de> {
    type Deserializer<'a>: Deserializer<'de>
    where
        Self: 'a;

    fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
    where
        Self: 'a;
}

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

    fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
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

    fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor.visit_null().change_context(DeserializerError)
    }
}

impl_owned!(bool, BoolDeserializer, visit_bool);
impl_owned!(char, CharDeserializer, visit_char);
impl_owned!(u8, U8Deserializer, visit_u8);
impl_owned!(u16, U16Deserializer, visit_u16);
impl_owned!(u32, U32Deserializer, visit_u32);
impl_owned!(u64, U64Deserializer, visit_u64);
impl_owned!(u128, U128Deserializer, visit_u128);
impl_owned!(usize, UsizeDeserializer, visit_usize);
impl_owned!(i8, I8Deserializer, visit_i8);
impl_owned!(i16, I16Deserializer, visit_i16);
impl_owned!(i32, I32Deserializer, visit_i32);
impl_owned!(i64, I64Deserializer, visit_i64);
impl_owned!(i128, I128Deserializer, visit_i128);
impl_owned!(isize, IsizeDeserializer, visit_isize);
impl_owned!(f32, F32Deserializer, visit_f32);
impl_owned!(f64, F64Deserializer, visit_f64);

impl_owned!(!copy: Number, NumberDeserializer, visit_number);
