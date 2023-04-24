use error_stack::{IntoReport, Report, Result, ResultExt};
use num_traits::ToPrimitive;

use crate::{
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant},
    Context, Deserialize, Deserializer, EnumVisitor, IdentifierVisitor, Number, OptionalVisitor,
    Reflection, Visitor,
};

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

// TODO: split into 2 PRs!
macro_rules! deserialize_any {
    ($name:ident, $primitive:ty, $visit:ident) => {
        fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: Visitor<'de>,
        {
            visitor.$visit(self.value).change_context(DeserializerError)
        }
    };
}

macro_rules! deserialize_optional {
    ($name:ident, $primitive:ty) => {
        fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: OptionalVisitor<'de>,
        {
            visitor.visit_some(self).change_context(DeserializerError)
        }
    };
}

macro_rules! deserialize_enum {
    ($name:ident, $primitive:ty) => {
        fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: EnumVisitor<'de>,
        {
            $crate::value::EnumUnitDeserializer::new(self.context, self).deserialize_enum(visitor)
        }
    };
}

// TODO: we should always first try the smaller number?
// TODO: possibility for borrowed values vs. borrowed by "just normal"
macro_rules! deserialize_identifier {
    ($name:ident, $primitive:ty, !) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            Err(Report::new(TypeError.into_error())
                .attach(ExpectedType::new(visitor.expecting()))
                .attach(ReceivedType::new(<$primitive>::document()))
                .change_context(DeserializerError))
        }
    };

    ($name:ident, $primitive:ty, ! , $reflection:ty) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            Err(Report::new(TypeError.into_error())
                .attach(ExpectedType::new(visitor.expecting()))
                .attach(ReceivedType::new(<$reflection>::document()))
                .change_context(DeserializerError))
        }
    };

    ($name:ident, $primitive:ty,deref, $visit:ident) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            visitor
                .$visit(&*self.value)
                .change_context(DeserializerError)
        }
    };

    ($name:ident, $primitive:ty,to, $to:ident, $visit:ident) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            let value = self.value.$to().ok_or_else(|| {
                Report::new(TypeError.into_error())
                    .attach(ExpectedType::new(visitor.expecting()))
                    .attach(ReceivedType::new(<$primitive>::reflection()))
                    .change_context(DeserializerError)
            })?;

            visitor.$visit(value).change_context(DeserializerError)
        }
    };

    ($name:ident, $primitive:ty,visit, $visit:ident) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            visitor
                .$visit(self.value.into())
                .change_context(DeserializerError)
        }
    };

    ($name:ident, $primitive:ty,try, $visit:ident) => {
        fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: IdentifierVisitor<'de>,
        {
            let value = self
                .value
                .try_into()
                .into_report()
                .change_context(TypeError.into_error())
                .attach(ExpectedType::new(visitor.expecting()))
                .attach(ReceivedType::new(<$primitive>::document()))
                .change_context(DeserializerError)?;

            visitor.$visit(value).change_context(DeserializerError)
        }
    };
}

macro_rules! impl_deserializer {
    (@derive Copy, $name:ident, $primitive:ty $(, $lifetime:lifetime)?) => {
        #[derive(Debug, Copy, Clone)]
        pub struct $name<'a $(, $lifetime)?> {
            context: &'a Context,
            value: $(& $lifetime)? $primitive
        }
    };

    (@derive Clone, $name:ident, $primitive:ty $(, $lifetime:lifetime)?) => {
        #[derive(Debug, Clone)]
        pub struct $name<'a $(, $lifetime)?> {
            context: &'a Context,
            value: $(& $lifetime)? $primitive
        }
    };

    (@impl $name:ident, $primitive:ty, 'de { $($body:tt)* }) => {
        impl<'a, 'de> $name<'a, 'de> {
            #[must_use]
            pub const fn new(value: &'de $primitive, context: &'a Context) -> Self {
                Self { context, value }
            }
        }

        impl<'de> Deserializer<'de> for $name<'_, 'de> {
            $($body)*
        }
    };

    (@impl $name:ident, $primitive:ty, $lifetime:lifetime { $($body:tt)* }) => {
        impl<'a, $lifetime> $name<'a, $lifetime> {
            #[must_use]
            pub const fn new(value: &$lifetime $primitive, context: &'a Context) -> Self {
                Self { context, value }
            }
        }

        impl<'de> Deserializer<'de> for $name<'_, '_> {
            $($body)*
        }

        impl<'de, $lifetime> IntoDeserializer<'de> for &$lifetime $primitive {
            type Deserializer<'a> = $name<'a, $lifetime> where Self: 'a;

            fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
            where
                Self: 'a {
                $name::new(self, context)
            }
        }
    };

    (@impl $name:ident, $primitive:ty { $($body:tt)* }) => {
        impl<'a> $name<'a> {
            #[must_use]
            pub const fn new(value: $primitive, context: &'a Context) -> Self {
                Self { context, value }
            }
        }

        impl<'de> Deserializer<'de> for $name<'_> {
            $($body)*
        }

        impl<'de> IntoDeserializer<'de> for $primitive {
            type Deserializer<'a> = $name<'a> where Self: 'a;

            fn into_deserializer<'a>(self, context: &'a Context) -> Self::Deserializer<'a>
            where
                Self: 'a {
                $name::new(self, context)
            }
        }
    };

    (
        #[derive($mode:ident)]
        $name:ident$(<$lifetime:lifetime>)?($primitive:ty);
        $($extra:ident!($($arg1:tt $(, $arg2:tt $(, $arg3:tt)?)?)?);)*
    ) => {
        impl_deserializer!(@derive $mode, $name, $primitive $(, $lifetime)?);

        impl_deserializer!(@impl $name, $primitive $(, $lifetime)? {
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

            $($extra!($name, $primitive$(, $arg1 $(, $arg2 $(, $arg3)?)?)?);)*
        });
    };
}

impl_deserializer!(
    #[derive(Copy)] BoolDeserializer(bool);
    deserialize_any!(visit_bool);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(!);
);

impl_deserializer!(
    #[derive(Copy)] CharDeserializer(char);
    deserialize_any!(visit_char);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(!);
);

impl_deserializer!(
    #[derive(Copy)] U8Deserializer(u8);
    deserialize_any!(visit_u8);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(visit, visit_u8);
);

impl_deserializer!(
    #[derive(Copy)] U16Deserializer(u16);
    deserialize_any!(visit_u16);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(visit, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] U32Deserializer(u32);
    deserialize_any!(visit_u32);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(visit, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] U64Deserializer(u64);
    deserialize_any!(visit_u64);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(visit, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] U128Deserializer(u128);
    deserialize_any!(visit_u128);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] UsizeDeserializer(usize);
    deserialize_any!(visit_usize);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] I8Deserializer(i8);
    deserialize_any!(visit_i8);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u8);
);

impl_deserializer!(
    #[derive(Copy)] I16Deserializer(i16);
    deserialize_any!(visit_i16);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] I32Deserializer(i32);
    deserialize_any!(visit_i32);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] I64Deserializer(i64);
    deserialize_any!(visit_i64);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] I128Deserializer(i128);
    deserialize_any!(visit_i128);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] IsizeDeserializer(isize);
    deserialize_any!(visit_isize);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(try, visit_u64);
);

impl_deserializer!(
    #[derive(Copy)] F32Deserializer(f32);
    deserialize_any!(visit_f32);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(!);
);

impl_deserializer!(
    #[derive(Copy)] F64Deserializer(f64);
    deserialize_any!(visit_f64);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(!);
);

impl_deserializer!(
    #[derive(Clone)] NumberDeserializer(Number);
    deserialize_any!(visit_number);
    deserialize_enum!();
    deserialize_optional!();
    deserialize_identifier!(to, to_u64, visit_u64);
);

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

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
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

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: IdentifierVisitor<'de>,
    {
        Err(Report::new(TypeError.into_error())
            .attach(ReceivedType::new(<()>::reflection()))
            .attach(ExpectedType::new(visitor.expecting()))
            .change_context(DeserializerError))
    }
}

// down here so that they can make use of the macros
mod array;
mod bytes;
mod object;
mod string;

pub use array::ArrayAccessDeserializer;
pub use bytes::{BorrowedBytesDeserializer, BytesBufferDeserializer, BytesDeserializer};
pub use object::ObjectAccessDeserializer;
pub use string::{BorrowedStrDeserializer, StrDeserializer, StringDeserializer};

use crate::error::MissingError;
