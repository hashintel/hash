#[cfg(nightly)]
use core::sync::atomic::{AtomicI128, AtomicU128};
use core::sync::atomic::{
    AtomicI16, AtomicI32, AtomicI64, AtomicI8, AtomicIsize, AtomicU16, AtomicU32, AtomicU64,
    AtomicU8, AtomicUsize,
};

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};

macro_rules! impl_atomic {
    (@atomic $(#[$flag:meta])* $typ:ident, $int:ident) => {
        $(#[$flag])*
        impl Reflection for $typ {
            fn schema(doc: &mut Document) -> Schema {
                $int::schema(doc)
            }
        }

        $(#[$flag])*
        impl<'de> Deserialize<'de> for $typ {
            type Reflection = Self;

            fn deserialize<D: Deserializer<'de>>(
                de: D,
            ) -> error_stack::Result<Self, DeserializeError> {
                $int::deserialize(de).map(Self::new)
            }
        }
    };

    ($($(#[$flag:meta])* $typ:ident <- $int:ident),*$(,)?) => {
        $(impl_atomic!(@atomic $(#[$flag])* $typ, $int);)*
    };
}

impl_atomic![
    AtomicU8 <- u8,
    AtomicU16 <- u16,
    AtomicU32 <- u32,
    AtomicU64 <- u64,
    #[cfg(nightly)] AtomicU128 <- u128,
    AtomicUsize <- usize,
];

impl_atomic![
    AtomicI8 <- i8,
    AtomicI16 <- i16,
    AtomicI32 <- i32,
    AtomicI64 <- i64,
    #[cfg(nightly)] AtomicI128 <- i128,
    AtomicIsize <- isize,
];
