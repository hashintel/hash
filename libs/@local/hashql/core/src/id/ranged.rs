//! Integer storage for an id whose values lie in a range.
//!
//! The [`define_id!`](super::newtype) macro stores an id declared with `is MIN..=MAX` in one of
//! these types. The range is then part of the stored type, and the compiler uses it in two ways. An
//! enum around the id, such as `Option`, takes a value outside the range as its discriminant and is
//! no larger than the id. The compiler also optimizes code that reads the id for the range, for
//! example when the id indexes an array whose length exceeds `MAX`.
#![expect(
    unsafe_code,
    reason = "the conversions to and from the range-limited form read through a pointer cast"
)]

use core::{
    cmp::Ordering,
    hash::{Hash, Hasher},
    marker::StructuralPartialEq,
    pat::pattern_type,
};

macro_rules! define_ranged {
    ($($name:ident($scalar:ident);)*) => {$(
        #[doc = concat!("A [`", stringify!($scalar), "`] in `MIN..=MAX`.")]
        ///
        /// A number outside the range is not a valid value of this type. The compiler rejects a
        /// use of the type whose `MIN` exceeds `MAX`.
        #[derive(Copy, Clone)]
        #[repr(transparent)]
        pub struct $name<const MIN: $scalar, const MAX: $scalar>(
            pattern_type!($scalar is MIN..=MAX),
        );

        impl<const MIN: $scalar, const MAX: $scalar> $name<MIN, MAX> {
            /// Creates a value without checking that it is in the range.
            ///
            /// # Safety
            ///
            /// `value` must be in `MIN..=MAX`.
            #[inline]
            #[must_use]
            pub const unsafe fn new_unchecked(value: $scalar) -> Self {
                // `transmute` rejects a type whose size depends on a parameter, which `MIN` and
                // `MAX` are here.
                // SAFETY: `Self` is `repr(transparent)` over a pattern type, which has the size and
                // alignment of its base type. The caller guarantees that `value` is in `MIN..=MAX`,
                // and every number in that range is a valid value of the pattern type. Therefore
                // reading `value` as `Self` is sound.
                unsafe { (&raw const value).cast::<Self>().read() }
            }

            #[doc = concat!("Returns the value as a [`", stringify!($scalar), "`].")]
            #[inline]
            #[must_use]
            pub const fn get(self) -> $scalar {
                // SAFETY: `Self` is `repr(transparent)` over a pattern type, which has the size and
                // alignment of its base type. Every value of the pattern type is a valid value of
                // the base type. Therefore reading `self` as the base type is sound.
                unsafe { (&raw const self).cast::<$scalar>().read() }
            }
        }

        const impl<const MIN: $scalar, const MAX: $scalar> PartialEq for $name<MIN, MAX> {
            #[inline]
            fn eq(&self, other: &Self) -> bool {
                self.get() == other.get()
            }
        }

        const impl<const MIN: $scalar, const MAX: $scalar> Eq for $name<MIN, MAX> {}

        // The derive of `PartialEq` cannot compare a pattern type. This is the marker that the
        // derive would have added. A `match` accepts a constant of an id as a pattern only with it.
        impl<const MIN: $scalar, const MAX: $scalar> StructuralPartialEq for $name<MIN, MAX> {}

        const impl<const MIN: $scalar, const MAX: $scalar> PartialOrd for $name<MIN, MAX> {
            #[inline]
            fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
                Some(self.cmp(other))
            }
        }

        const impl<const MIN: $scalar, const MAX: $scalar> Ord for $name<MIN, MAX> {
            #[inline]
            fn cmp(&self, other: &Self) -> Ordering {
                self.get().cmp(&other.get())
            }
        }

        impl<const MIN: $scalar, const MAX: $scalar> Hash for $name<MIN, MAX> {
            #[inline]
            fn hash<H: Hasher>(&self, state: &mut H) {
                self.get().hash(state);
            }
        }
    )*};
}

define_ranged! {
    RangedU8(u8);
    RangedU16(u16);
    RangedU32(u32);
    RangedU64(u64);
    RangedU128(u128);
}
