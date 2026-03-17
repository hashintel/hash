//! Atomic units of measurement for size estimation.
//!
//! This module defines two fundamental units:
//!
//! - [`InformationUnit`]: Measures information content in abstract units. A primitive value
//!   (integer, boolean, etc.) has size 1. Composite types sum their fields' sizes.
//!
//! - [`Cardinal`]: Measures element count (cardinality). A single value has cardinality 1; a
//!   collection has cardinality equal to its element count.
//!
//! Both types are thin wrappers around `u32` with saturating arithmetic to prevent overflow.

use core::{
    fmt,
    fmt::{Debug, Display},
    ops::{Add, AddAssign, Sub, SubAssign},
};

use crate::{
    macros::{forward_ref_binop, forward_ref_op_assign},
    pass::analysis::dataflow::lattice::{HasBottom, HasTop, SaturatingSemiring},
};

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
            pub const fn as_u32(self) -> u32 {
                self.raw as u32
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

            #[inline]
            #[must_use]
            pub const fn saturating_add(self, rhs: Self) -> Self {
                Self { raw: self.raw.saturating_add(rhs.raw) }
            }

            #[inline]
            #[must_use]
            pub const fn saturating_sub(self, rhs: Self) -> Self {
                Self { raw: self.raw.saturating_sub(rhs.raw) }
            }
        }


        impl HasBottom<$name> for SaturatingSemiring {
            #[inline]
            fn bottom(&self) -> $name {
                $name::new(0)
            }

            #[inline]
            fn is_bottom(&self, value: &$name) -> bool {
                self.is_bottom(&value.raw)
            }
        }

        impl HasTop<$name> for SaturatingSemiring {
            #[inline]
            fn top(&self) -> $name {
                $name::new(u32::MAX)
            }

            #[inline]
            fn is_top(&self, value: &$name) -> bool {
                self.is_top(&value.raw)
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

unit!(
    /// A unit of information content (abstract size).
    ///
    /// One unit represents the information content of a single primitive value.
    /// Composite types have sizes equal to the sum of their components.
    pub struct InformationUnit(u32)
);

impl InformationUnit {
    #[inline]
    #[must_use]
    pub const fn checked_mul(self, cardinal: Cardinal) -> Option<Self> {
        let raw = self.raw.checked_mul(cardinal.raw);

        match raw {
            Some(value) => Some(Self::new(value)),
            None => None,
        }
    }

    #[inline]
    #[must_use]
    pub const fn midpoint(self, other: Self) -> Self {
        Self::new(u32::midpoint(self.raw, other.raw))
    }
}

unit!(
    /// A unit of cardinality (element count).
    ///
    /// Represents how many elements are contained in a value. Scalars have cardinality 1;
    /// collections have cardinality equal to their length.
    pub struct Cardinal(u32)
);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pass::analysis::dataflow::lattice::{
        SaturatingSemiring,
        laws::{assert_is_bottom_consistent, assert_is_top_consistent},
    };

    #[test]
    fn saturating_arithmetic_never_panics() {
        // Overflow saturates to MAX
        assert_eq!(
            InformationUnit::new(u32::MAX).saturating_add(InformationUnit::new(1)),
            InformationUnit::new(u32::MAX)
        );
        assert_eq!(
            Cardinal::new(u32::MAX).saturating_add(Cardinal::new(1)),
            Cardinal::new(u32::MAX)
        );

        // Underflow saturates to 0
        assert_eq!(
            InformationUnit::new(0).saturating_sub(InformationUnit::new(1)),
            InformationUnit::new(0)
        );
        assert_eq!(
            Cardinal::new(0).saturating_sub(Cardinal::new(1)),
            Cardinal::new(0)
        );
    }

    #[test]
    fn laws() {
        assert_is_bottom_consistent::<SaturatingSemiring, InformationUnit>(&SaturatingSemiring);
        assert_is_top_consistent::<SaturatingSemiring, InformationUnit>(&SaturatingSemiring);

        assert_is_bottom_consistent::<SaturatingSemiring, Cardinal>(&SaturatingSemiring);
        assert_is_top_consistent::<SaturatingSemiring, Cardinal>(&SaturatingSemiring);
    }
}
