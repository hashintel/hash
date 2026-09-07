//! The power-of-two shift exponent.

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
pub(crate) struct Log2(u8);

impl Log2 {
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

    /// Returns the exponent.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u8 {
        self.0
    }
}

unsafe_impl_try_from_bytes!(Log2[u8]);
