//! The power-of-two shift exponent.

use super::unsafe_impl_try_from_bytes;

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
pub(crate) struct Log2(u8);

impl Log2 {
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

    /// Returns the exponent.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u8 {
        self.0
    }
}

unsafe_impl_try_from_bytes!(Log2[u8]);
