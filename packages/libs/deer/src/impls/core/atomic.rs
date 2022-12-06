#[rustfmt::skip] #[cfg(all(target_has_atomic = "128", nightly))]
use core::sync::atomic::{AtomicI128, AtomicU128};
#[rustfmt::skip] #[cfg(target_has_atomic = "ptr")]
use core::sync::atomic::{AtomicIsize, AtomicUsize};
#[rustfmt::skip] #[cfg(target_has_atomic = "64")]
use core::sync::atomic::{AtomicI64, AtomicU64};
#[rustfmt::skip] #[cfg(target_has_atomic = "32")]
use core::sync::atomic::{AtomicI32, AtomicU32};
#[rustfmt::skip] #[cfg(target_has_atomic = "16")]
use core::sync::atomic::{AtomicI16, AtomicU16};
#[rustfmt::skip] #[cfg(target_has_atomic = "8")]
use core::sync::atomic::{AtomicI8, AtomicU8};

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

// target_has_atomic has been stabilized since 1.60
// https://github.com/rust-lang/rust/pull/93824
// but is not properly documented
impl_atomic![
    #[cfg(target_has_atomic = "8")] AtomicU8 <- u8,
    #[cfg(target_has_atomic = "16")] AtomicU16 <- u16,
    #[cfg(target_has_atomic = "32")] AtomicU32 <- u32,
    #[cfg(target_has_atomic = "64")] AtomicU64 <- u64,
    #[cfg(all(target_has_atomic = "128", nightly))] AtomicU128 <- u128,
    // `ptr` is how `usize` is enabled in the `core` crate
    #[cfg(target_has_atomic = "ptr")] AtomicUsize <- usize,
];

impl_atomic![
    #[cfg(target_has_atomic = "8")] AtomicI8 <- i8,
    #[cfg(target_has_atomic = "16")] AtomicI16 <- i16,
    #[cfg(target_has_atomic = "32")] AtomicI32 <- i32,
    #[cfg(target_has_atomic = "64")] AtomicI64 <- i64,
    #[cfg(all(target_has_atomic = "128", nightly))] AtomicI128 <- i128,
    // `ptr` is how `usize` is enabled in the `core` crate
    #[cfg(target_has_atomic = "ptr")] AtomicIsize <- isize,
];
