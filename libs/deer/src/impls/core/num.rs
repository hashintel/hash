#[cfg(nightly)]
use core::num::Saturating;
use core::num::{
    NonZeroI128, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI8, NonZeroIsize, NonZeroU128,
    NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU8, NonZeroUsize, Wrapping,
};

use error_stack::{Report, ResultExt};
use serde::{ser::SerializeMap, Serialize, Serializer};

use crate::{
    error::{DeserializeError, Error, ExpectedType, ReceivedValue, ValueError},
    Deserialize, Deserializer, Document, Reflection, Schema,
};

struct Zero;

impl Serialize for Zero {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(1))?;
        map.serialize_entry("enum", &[0])?;
        map.end()
    }
}

macro_rules! impl_nonzero {
    (@nonzero $typ:ident, $int:ident) => {
        impl Reflection for $typ {
            fn schema(doc: &mut Document) -> Schema {
                $int::schema(doc).with("not", Zero)
            }
        }

        impl<'de> Deserialize<'de> for $typ {
            type Reflection = Self;

            fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
                let value = $int::deserialize(de)?;

                Self::new(value)
                    .ok_or_else(|| Report::new(Error::new(ValueError)))
                    .attach(ReceivedValue::new(0))
                    .attach(ExpectedType::new(Self::reflection()))
                    .change_context(DeserializeError)
            }
        }
    };

    ($($typ:ident <- $int:ident),*$(,)?) => {
        $(impl_nonzero!(@nonzero $typ, $int);)*
    };
}

impl_nonzero![
    NonZeroU8 <- u8,
    NonZeroU16 <- u16,
    NonZeroU32 <- u32,
    NonZeroU64 <- u64,
    NonZeroU128 <- u128,
    NonZeroUsize <- usize,
];

impl_nonzero![
    NonZeroI8 <- i8,
    NonZeroI16 <- i16,
    NonZeroI32 <- i32,
    NonZeroI64 <- i64,
    NonZeroI128 <- i128,
    NonZeroIsize <- isize,
];

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Wrapping<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self)
    }
}

#[cfg(nightly)]
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Saturating<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self)
    }
}

macro_rules! impl_num {
    (
        $primitive:ident:: $deserialize:ident;
        $reflection:ident;
        $($method:ident !($($val:ident:: $visit:ident),*);)*
    ) => {
        $reflection!($primitive);

        impl<'de> Deserialize<'de> for $primitive {
            type Reflection = Self;

            fn deserialize<D>(de: D) -> Result<Self, DeserializeError>
            where
                D: Deserializer<'de>,
            {
                struct PrimitiveVisitor;

                impl<'de> Visitor<'de> for PrimitiveVisitor {
                    type Value = $primitive;

                    fn expecting(&self) -> Document {
                        Self::Value::reflection()
                    }

                    $($($method!($val :: $visit);)*)*
                }

                de.$deserialize(PrimitiveVisitor).change_context(DeserializeError)
            }
        }
    };
}

macro_rules! num_self {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Ok(v)
        }
    };
}

macro_rules! num_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Ok(Self::Value::from(v))
        }
    };
}

macro_rules! num_try_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Self::Value::try_from(v)
                .into_report()
                .change_context(ValueError.into_error())
                .attach(ExpectedType::new(self.expecting()))
                .attach(ReceivedValue::new(v))
                .change_context(VisitorError)
        }
    };
}

macro_rules! num_as_lossy {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Ok(v as Self::Value)
        }
    };
}

macro_rules! num_number {
    ($primitive:ident:: $to:ident) => {
        fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
            v.$to().ok_or_else(|| {
                Report::new(ValueError.into_error())
                    .attach(ExpectedType::new(self.expecting()))
                    .attach(ReceivedValue::new(v))
                    .change_context(VisitorError)
            })
        }
    };
}

pub(super) use impl_num;
pub(super) use num_as_lossy;
pub(super) use num_from;
pub(super) use num_number;
pub(super) use num_self;
pub(super) use num_try_from;
