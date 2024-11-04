#[cfg(nightly)]
use core::num::Saturating;
use core::num::{
    NonZeroI8, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI128, NonZeroIsize, NonZeroU8,
    NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU128, NonZeroUsize, Wrapping,
};

use error_stack::{Report, ResultExt as _};
use serde::{Serialize, Serializer, ser::SerializeMap as _};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema,
    error::{DeserializeError, Error, ExpectedType, ReceivedValue, ValueError},
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

            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, Report<DeserializeError>> {
                let value = $int::deserialize(deserializer)?;

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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        T::deserialize(deserializer).map(Self)
    }
}

#[cfg(nightly)]
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Saturating<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        T::deserialize(deserializer).map(Self)
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

            fn deserialize<D>(deserializer: D) -> Result<Self, Report<DeserializeError>>
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

                deserializer.$deserialize(PrimitiveVisitor).change_context(DeserializeError)
            }
        }
    };
}

macro_rules! num_self {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, value: $primitive) -> Result<Self::Value, Report<VisitorError>> {
            Ok(value)
        }
    };
}

macro_rules! num_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, value: $primitive) -> Result<Self::Value, Report<VisitorError>> {
            Ok(Self::Value::from(value))
        }
    };
}

macro_rules! num_try_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, value: $primitive) -> Result<Self::Value, Report<VisitorError>> {
            Self::Value::try_from(value)
                .change_context(ValueError.into_error())
                .attach(ExpectedType::new(self.expecting()))
                .attach(ReceivedValue::new(value))
                .change_context(VisitorError)
        }
    };
}

macro_rules! num_as_lossy {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, value: $primitive) -> Result<Self::Value, Report<VisitorError>> {
            Ok(value as Self::Value)
        }
    };
}

macro_rules! num_number {
    ($primitive:ident:: $to:ident) => {
        fn visit_number(self, value: Number) -> Result<Self::Value, Report<VisitorError>> {
            value.$to().ok_or_else(|| {
                Report::new(ValueError.into_error())
                    .attach(ExpectedType::new(self.expecting()))
                    .attach(ReceivedValue::new(value))
                    .change_context(VisitorError)
            })
        }
    };
}

// these imports are down here as they make use of the macros declared above
mod floating;
mod integral;
