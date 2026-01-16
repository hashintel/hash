use core::{
    fmt,
    fmt::{Debug, Display},
    ops::{Add, AddAssign, Sub, SubAssign},
};

use crate::macros::{forward_ref_binop, forward_ref_op_assign};

macro_rules! unit {
    ($(#[$meta:meta])* $vis:vis struct $name:ident($inner:ty)) => {
        $(#[$meta])*
        #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
        #[expect(clippy::field_scoped_visibility_modifiers)]
        $vis struct $name {
            pub(super) raw: $inner,
        }

        impl $name {
            #[inline]
            pub const fn new(inner: $inner) -> Self {
                Self { raw: inner }
            }

            #[inline]
            pub const fn checked_add(self, rhs: Self) -> Option<Self> {
                match self.raw.checked_add(rhs.raw) {
                    Some(raw) => Some(Self { raw }),
                    None => None,
                }
            }

            #[inline]
            pub const fn checked_sub(self, rhs: Self) -> Option<Self> {
                match self.raw.checked_sub(rhs.raw) {
                    Some(raw) => Some(Self { raw }),
                    None => None,
                }
            }
        }

        impl Add<Self> for $name {
            type Output = Self;

            #[inline]
            fn add(self, rhs: Self) -> Self::Output {
                Self::new(self.raw + rhs.raw)
            }
        }

        impl AddAssign<Self> for $name {
            #[inline]
            fn add_assign(&mut self, rhs: Self) {
                self.raw += rhs.raw;
            }
        }

        impl Sub<Self> for $name {
            type Output = Self;

            #[inline]
            fn sub(self, rhs: Self) -> Self::Output {
                Self::new(self.raw - rhs.raw)
            }
        }

        impl SubAssign<Self> for $name {
            #[inline]
            fn sub_assign(&mut self, rhs: Self) {
                self.raw -= rhs.raw;
            }
        }

        impl Debug for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                Display::fmt(&self.raw, fmt)
            }
        }

        impl From<$inner> for $name {
            #[inline]
            fn from(inner: $inner) -> Self {
                Self { raw: inner }
            }
        }

        impl From<$name> for $inner {
            #[inline]
            fn from(inner: $name) -> Self {
                inner.raw
            }
        }

        forward_ref_binop!(impl Add<Self>::add for $name);
        forward_ref_binop!(impl Sub<Self>::sub for $name);
        forward_ref_op_assign!(impl AddAssign<Self>::add_assign for $name);
        forward_ref_op_assign!(impl SubAssign<Self>::sub_assign for $name);
    };
}

unit!(pub struct InformationUnit(u32));
unit!(pub struct Cardinal(u32));
