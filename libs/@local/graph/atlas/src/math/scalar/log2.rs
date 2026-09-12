//! The power-of-two shift exponent.

use core::fmt;

use super::unsafe_impl_try_from_bytes;

/// A power-of-two exponent below the `u64` shift width, valid by construction.
///
/// Configuration fields named `*_log2` carry this type instead of a raw `u8`. Shifting a `u64` by
/// 64 or more panics in debug builds and masks in release, so the constructor checks the bound and
/// the shifting site validates nothing.
///
/// # Examples
///
/// ```ignore
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
    /// Returns [`None`] unless the value lies below the `u64` shift width: 64 and above have no
    /// in-range power of two, and shifting by them panics in debug builds and masks in release.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: u8) -> Option<Self> {
        if u32::from(value) >= u64::BITS {
            return None;
        }

        Some(Self(value))
    }

    pub(crate) const fn new_unchecked(value: u8) -> Self {
        debug_assert!(u32::from(value) < u64::BITS);
        Self(value)
    }

    /// Returns whether `value`'s exact bits are a stored exponent.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: integers store
    /// bit for bit, so the bits are valid exactly when the exponent lies below the shift width.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: u8) -> bool {
        match Self::new(value) {
            // Compare against what construction stored, so the check follows any future
            // normalization.
            Some(accepted) => accepted.0 == value,
            None => false,
        }
    }

    /// Adds another exponent, refusing a sum at or above the `u64` shift width.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_add(self, other: Self) -> Option<Self> {
        // Both exponents lie below the shift width, so the sum stays within `u8`.
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
    /// Serializes as the plain exponent.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Log2 {
    /// Deserializes a plain exponent, refusing values at or above the `u64` shift width.
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
