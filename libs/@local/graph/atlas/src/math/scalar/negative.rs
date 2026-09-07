//! The finite, strictly negative `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::raw_interop;

/// A finite, strictly negative `f32`, valid by construction.
///
/// The sign mirror of [`Positive`](super::Positive), for readings whose sign is part of the
/// contract: a slope that rewards rather than corrects carries its direction in the type, and the
/// consuming site validates nothing.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(Negative::new(-2.5).expect("-2.5 is negative").get(), -2.5);
/// assert_eq!(Negative::new(0.0), None);
/// assert_eq!(Negative::new(-0.0), None);
/// assert_eq!(Negative::new(f32::NAN), None);
/// ```
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
/// The domain excludes NaN and both zeros, so every value owns one bit pattern with no
/// canonicalization step.
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
        // one bit pattern per value, so bit equality is numeric equality
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
        // For negative floats the bit pattern is monotone in the magnitude, so the value order
        // is the bit order reversed: still a GPR compare with no NaN branch and no panic path.
        other.0.to_bits().cmp(&self.0.to_bits())
    }
}

impl Hash for Negative {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // one bit pattern per value, so `Hash` agrees with `Eq`
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
    /// Widens into double precision, exactly.
    #[inline]
    fn from(value: Negative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

raw_interop!(Negative[f32]);
