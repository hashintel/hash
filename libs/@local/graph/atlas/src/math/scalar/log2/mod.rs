//! The power-of-two shift exponent.

use core::fmt;

#[cfg(test)]
use proptest::{arbitrary::Arbitrary, strategy::Strategy as _};

use super::unsafe_impl_try_from_bytes;

#[cfg(test)]
mod tests;

/// A power-of-two exponent below the `u64` shift width, valid by construction.
///
/// Values lie in `0..64`, the valid shift counts for a `u64`. A power of two computed as
/// `1_u64 << exponent.get()` therefore fits in that type. A narrower integer needs its own
/// shift-width bound.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{Log2};
///
/// let span = Log2::new(6).expect("6 lies below the shift width");
/// assert_eq!(span.get(), 6);
/// assert_eq!(1_u64 << span.get(), 64);
///
/// // A hostile document's 200 refuses construction instead of panicking a later shift.
/// assert_eq!(Log2::new(200), None);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, zerocopy::Immutable)]
#[repr(transparent)]
pub struct Log2(u8);

impl Log2 {
    /// One doubling.
    pub(crate) const ONE: Self = Self(1);
    /// No doublings: the exponent of one.
    pub(crate) const ZERO: Self = Self(0);

    /// Validates a shift exponent.
    ///
    /// Returns [`None`] unless the value is below 64, the `u64` shift width.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: u8) -> Option<Self> {
        if u32::from(value) >= u64::BITS {
            return None;
        }

        Some(Self(value))
    }

    /// Creates an exponent whose value is already known to be below the `u64` shift width.
    ///
    /// The caller must establish `value < 64`. Use [`new`](Self::new) to check other inputs.
    // this bound concerns numeric correctness rather than memory safety.
    pub(crate) const fn new_unchecked(value: u8) -> Self {
        debug_assert!(u32::from(value) < u64::BITS);
        Self(value)
    }

    /// Returns whether `value`'s exact bits are a stored exponent.
    ///
    /// The constructor [`new`](Self::new) preserves integer bits. Persisted values are valid
    /// exactly when the exponent lies below the `u64` shift width.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: u8) -> bool {
        match Self::new(value) {
            // compare with the constructed value to account for normalization
            Some(accepted) => accepted.0 == value,
            None => false,
        }
    }

    /// Adds another exponent, refusing a sum at or above the `u64` shift width.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_add(self, other: Self) -> Option<Self> {
        // The sum of two exponents below 64 is at most 126 and fits within u8's range.
        Self::new(self.0 + other.0)
    }

    /// Returns the exponent.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u8 {
        self.0
    }
}

impl fmt::Display for Log2 {
    /// Formats as a power of two, e.g. `2⁶`.
    #[expect(
        clippy::non_ascii_literal,
        clippy::integer_division_remainder_used,
        clippy::integer_division
    )]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        const SUPERSCRIPTS: [char; 10] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

        write!(fmt, "2")?;
        if self.0 >= 10 {
            write!(fmt, "{}", SUPERSCRIPTS[usize::from(self.0 / 10)])?;
        }
        write!(fmt, "{}", SUPERSCRIPTS[usize::from(self.0 % 10)])
    }
}

impl serde::Serialize for Log2 {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Log2 {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = u8::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Unsigned(u64::from(value)),
                &"an exponent below the u64 shift width",
            )
        })
    }
}

unsafe_impl_try_from_bytes!(Log2[u8]);

#[cfg(test)]
#[expect(
    exported_private_dependencies,
    reason = "the impl is absent from downstream builds"
)]
impl Arbitrary for Log2 {
    type Parameters = ();

    type Strategy = impl proptest::strategy::Strategy<Value = Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        (0_u8..64).prop_map(Self)
    }
}
