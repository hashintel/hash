mod array;
mod bytes;
mod object;
mod string;

pub use array::ArrayAccessDeserializer;
pub use bytes::{BorrowedBytesDeserializer, BytesBufferDeserializer, BytesDeserializer};
use error_stack::{Report, Result, ResultExt};
pub use object::ObjectAccessDeserializer;
pub use string::{BorrowedStrDeserializer, StrDeserializer, StringDeserializer};

use crate::{
    error::{DeserializerError, ExpectedType, TypeError, Variant},
    Context, Deserialize, Deserializer, EnumVisitor, Number, OptionalVisitor, StructVisitor,
    Visitor,
};

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

    (@INTERNAL IMPL, $ty:ty $(as $conv:ty)?, $name:ident, $method:ident) => {
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

            fn deserialize_any<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: Visitor<'de>,
            {
                visitor.$method(self.value $(as $conv)?).change_context(DeserializerError)
            }

            fn deserialize_optional<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: OptionalVisitor<'de>
            {
                visitor.visit_some(self).change_context(DeserializerError)
            }

            fn deserialize_enum<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: EnumVisitor<'de>,
            {
                $crate::value::EnumUnitDeserializer::new(self.context, self).deserialize_enum(visitor)
            }

            fn deserialize_struct<V>(self, visitor: V) -> error_stack::Result<V::Value, DeserializerError>
            where
                V: StructVisitor<'de>
            {
                Err(
                    Report::new(TypeError.into_error())
                        .attach(ExpectedType::new(visitor.expecting()))
                        // TODO: enable once String and Vec<u8> have reflection
                        //  (or we rework this macro c:)
                        // .attach(ReceivedType::new(<$ty>::reflection()))
                        .change_context(DeserializerError)
                )
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

    (copy: $ty:ty $(as $conv:ty)?, $name:ident, $method:ident) => {
        impl_owned!(@INTERNAL COPY, $ty, $name, $method);
        impl_owned!(@INTERNAL IMPL, $ty $(as $conv)?, $name, $method);
    };

    (!copy: $ty:ty, $name:ident, $method:ident) => {
        impl_owned!(@INTERNAL CLONE, $ty, $name, $method);
        impl_owned!(@INTERNAL IMPL, $ty, $name, $method);
    };

    ($ty:ty $(as $conv:ty)?, $name:ident, $method:ident) => {
        impl_owned!(copy: $ty $(as $conv)?, $name, $method);
    };
}

use impl_owned;

use crate::error::{MissingError, ReceivedType};

pub trait IntoDeserializer<'de> {
    type Deserializer<'a>: Deserializer<'de>
    where
        Self: 'a;

    fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
    where
        Self: 'a;
}

pub(crate) struct EnumUnitDeserializer<'a, D> {
    context: &'a Context,
    deserializer: D,
}

impl<'a, D> EnumUnitDeserializer<'a, D> {
    #[must_use]
    pub(crate) const fn new(context: &'a Context, deserializer: D) -> Self {
        Self {
            context,
            deserializer,
        }
    }
}

impl<'de, D> EnumUnitDeserializer<'_, D>
where
    D: Deserializer<'de>,
{
    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let context = self.context;

        let discriminant = visitor
            .visit_discriminant(self.deserializer)
            .change_context(DeserializerError)?;

        visitor
            .visit_value(discriminant, NoneDeserializer::new(context))
            .change_context(DeserializerError)
    }
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
        visitor.visit_none().change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_none().change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let discriminant = visitor
            .visit_discriminant(self)
            .change_context(DeserializerError)?;

        visitor
            .visit_value(discriminant, self)
            .change_context(DeserializerError)
    }

    fn deserialize_struct<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: StructVisitor<'de>,
    {
        Err(Report::new(MissingError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .change_context(DeserializerError))
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
        visitor.visit_null().change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_null().change_context(DeserializerError)
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
        Err(Report::new(TypeError.into_error())
            .attach(ExpectedType::new(visitor.expecting()))
            .attach(ReceivedType::new(<()>::reflection()))
            .change_context(DeserializerError))
    }
}

impl_owned!(bool, BoolDeserializer, visit_bool);
impl_owned!(char, CharDeserializer, visit_char);
impl_owned!(u8, U8Deserializer, visit_u8);
impl_owned!(u16, U16Deserializer, visit_u16);
impl_owned!(u32, U32Deserializer, visit_u32);
impl_owned!(u64, U64Deserializer, visit_u64);
impl_owned!(u128, U128Deserializer, visit_u128);
#[cfg(target_pointer_width = "16")]
impl_owned!(usize as u16, UsizeDeserializer, visit_u16);
#[cfg(target_pointer_width = "32")]
impl_owned!(usize as u32, UsizeDeserializer, visit_u32);
#[cfg(not(any(
    target_pointer_width = "16",
    target_pointer_width = "32",
    target_pointer_width = "128"
)))]
impl_owned!(usize as u64, UsizeDeserializer, visit_u64);
#[cfg(target_pointer_width = "128")]
impl_owned!(usize as u128, UsizeDeserializer, visit_u128);
impl_owned!(i8, I8Deserializer, visit_i8);
impl_owned!(i16, I16Deserializer, visit_i16);
impl_owned!(i32, I32Deserializer, visit_i32);
impl_owned!(i64, I64Deserializer, visit_i64);
impl_owned!(i128, I128Deserializer, visit_i128);
#[cfg(target_pointer_width = "16")]
impl_owned!(isize as i16, IsizeDeserializer, visit_u16);
#[cfg(target_pointer_width = "32")]
impl_owned!(isize as i32, IsizeDeserializer, visit_u32);
#[cfg(not(any(
    target_pointer_width = "16",
    target_pointer_width = "32",
    target_pointer_width = "128"
)))]
impl_owned!(isize as i64, IsizeDeserializer, visit_i64);
#[cfg(target_pointer_width = "128")]
impl_owned!(isize as i128, UsizeDeserializer, visit_i128);
impl_owned!(f32, F32Deserializer, visit_f32);
impl_owned!(f64, F64Deserializer, visit_f64);

impl_owned!(!copy: Number, NumberDeserializer, visit_number);
