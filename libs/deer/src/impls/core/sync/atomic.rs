#[cfg(target_has_atomic = "8")]
use core::sync::atomic::{AtomicBool, AtomicI8, AtomicU8};
#[cfg(target_has_atomic = "16")]
use core::sync::atomic::{AtomicI16, AtomicU16};
#[cfg(target_has_atomic = "32")]
use core::sync::atomic::{AtomicI32, AtomicU32};
#[cfg(target_has_atomic = "64")]
use core::sync::atomic::{AtomicI64, AtomicU64};
#[cfg(nightly)]
#[cfg(target_has_atomic = "128")]
use core::sync::atomic::{AtomicI128, AtomicU128};
#[cfg(target_has_atomic = "ptr")]
use core::sync::atomic::{AtomicIsize, AtomicUsize};

use error_stack::Report;

use crate::{Deserialize, Deserializer, Document, Reflection, Schema, error::DeserializeError};

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
                deserializer: D,
            ) -> Result<Self, Report<DeserializeError>> {
                $int::deserialize(deserializer).map(Self::new)
            }
        }
    };

    ($($(#[$flag:meta])* $typ:ident <- $int:ident),*$(,)?) => {
        $(impl_atomic!(@atomic $(#[$flag])* $typ, $int);)*
    };
}

impl_atomic![
    #[cfg(target_has_atomic = "8")]
    AtomicBool <- bool,
    #[cfg(target_has_atomic = "8")]
    AtomicU8 <- u8,
    #[cfg(target_has_atomic = "16")]
    AtomicU16 <- u16,
    #[cfg(target_has_atomic = "32")]
    AtomicU32 <- u32,
    #[cfg(target_has_atomic = "64")]
    AtomicU64 <- u64,
    #[cfg(nightly)]
    #[cfg(target_has_atomic = "128")]
    AtomicU128 <- u128,
    #[cfg(target_has_atomic = "ptr")]
    AtomicUsize <- usize,
];

impl_atomic![
    #[cfg(target_has_atomic = "8")]
    AtomicI8 <- i8,
    #[cfg(target_has_atomic = "16")]
    AtomicI16 <- i16,
    #[cfg(target_has_atomic = "32")]
    AtomicI32 <- i32,
    #[cfg(target_has_atomic = "64")]
    AtomicI64 <- i64,
    #[cfg(nightly)]
    #[cfg(target_has_atomic = "128")]
    AtomicI128 <- i128,
    #[cfg(target_has_atomic = "ptr")]
    AtomicIsize <- isize,
];
