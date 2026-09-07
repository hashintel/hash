//! The finite `f64` scalar strictly greater than one.

use super::unsafe_impl_try_from_bytes;

/// Validates a greater-than-one literal at compile time.
///
/// The expansion is a `const` block over [`GreaterThanOne::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! greater_than_one {
    ($value:expr) => {
        const {
            $crate::math::GreaterThanOne::new($value)
                .expect("the literal is finite and greater than one")
        }
    };
}
#[cfg(test)]
pub(crate) use greater_than_one;

/// A finite `f64` strictly greater than one, valid by construction.
///
/// Growth and expansion factors whose semantics require actual growth - a factor of one never
/// expands - carry the bound in the type.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(
///     GreaterThanOne::new(2.0).expect("doubling expands").get(),
///     2.0
/// );
/// assert_eq!(GreaterThanOne::new(1.0), None);
/// assert_eq!(GreaterThanOne::new(f64::INFINITY), None);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct GreaterThanOne(f64);

impl GreaterThanOne {
    /// Validates a finite value strictly greater than one.
    ///
    /// Returns [`None`] unless the value is finite and greater than one.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value > 1.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns whether `value`'s exact bits are a stored growth factor.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the domain
    /// holds no zero and accepted values store bit for bit, so the bits are valid exactly when
    /// [`new`](Self::new) accepts the value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // Compare against what construction stored, so the check follows any future
            // normalization.
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

unsafe_impl_try_from_bytes!(GreaterThanOne[f64]);
