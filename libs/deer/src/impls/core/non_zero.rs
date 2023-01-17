use core::num::{
    NonZeroI128, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI8, NonZeroIsize, NonZeroU128,
    NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU8, NonZeroUsize,
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
