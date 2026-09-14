//! The finite, strictly negative `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::raw_interop;

/// A finite, strictly negative `f32`, valid by construction.
///
/// Use [`Positive`](super::Positive) for the positive domain.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{Negative};
///
/// assert_eq!(f64::from(Negative::new(-2.5).expect("-2.5 is negative")), -2.5);
/// assert_eq!(Negative::new(0.0), None);
/// assert_eq!(Negative::new(-0.0), None);
/// assert_eq!(Negative::new(f32::NAN), None);
/// ```
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
/// Excluding NaN and both zeros gives every value one bit pattern without canonicalization.
#[derive(Copy, Clone)]
#[repr(transparent)]
pub(crate) struct Negative(f32);

impl Negative {
    /// Validates a strictly negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and less than zero. A negative zero compares
    /// equal to zero and is refused.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value < 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Creates a value the caller proves finite and strictly negative.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f32) -> Self {
        debug_assert!(
            value.is_finite() && value < 0.0,
            "the caller promised a finite negative value",
        );

        Self(value)
    }
}

const impl PartialEq for Negative {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for Negative {}

const impl PartialOrd for Negative {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for Negative {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // Negative finite floats have unsigned bit patterns increasing with magnitude. Reversing
        // the bit comparison gives numeric order.
        other.0.to_bits().cmp(&self.0.to_bits())
    }
}

impl Hash for Negative {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing the unique representation agrees with numeric equality
        state.write_u32(self.0.to_bits());
    }
}

impl fmt::Debug for Negative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for Negative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl From<Negative> for f64 {
    #[inline]
    fn from(value: Negative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

raw_interop!(Negative[f32]);
