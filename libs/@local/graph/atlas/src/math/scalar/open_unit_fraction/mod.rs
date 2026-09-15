//! The open unit-interval fraction.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
};

#[cfg(test)]
use proptest::{arbitrary::Arbitrary, strategy::Strategy as _};

use super::{DPositive, UnitFraction, raw_interop, unsafe_impl_try_from_bytes};

#[cfg(test)]
mod tests;

/// Validates an open-unit-fraction literal at compile time.
///
/// A literal outside the domain fails the build. Use [`OpenUnitFraction::new`] to check runtime
/// values.
macro_rules! open_unit_fraction {
    ($value:expr) => {
        const { $crate::math::OpenUnitFraction::new($value).expect("the literal lies inside (0, 1)") }
    };
}
pub(crate) use open_unit_fraction;

/// The rejected value of a failed [`OpenUnitFraction`] conversion.
///
/// [`TryFrom`] returns this error where [`OpenUnitFraction::new`] returns [`None`] - the value lies
/// outside `(0, 1)` or is NaN. The error carries the rejected value and displays it together with
/// the expected interval.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NotInOpenUnitInterval(pub f64);

impl fmt::Display for NotInOpenUnitInterval {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{} is not a fraction in (0, 1)", self.0)
    }
}

impl Error for NotInOpenUnitInterval {}

/// A fraction strictly between zero and one, valid by construction.
///
/// The open-interval sibling of [`UnitFraction`], for parameters that exclude both endpoints.
/// Division by a fraction needs no zero-divisor check, and its logarithm has a finite input in
/// its domain. As a threshold within `[0, 1]`, the fraction leaves values on either side of a
/// strict comparison. As a contraction factor, it is strictly below one in exact arithmetic,
/// although a floating-point product can round back to its operand or underflow to zero.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{OpenUnitFraction};
///
/// let shrink = OpenUnitFraction::new(0.25).expect("a quarter contracts");
/// assert_eq!(shrink.get(), 0.25);
///
/// // Both endpoints lie outside the domain.
/// assert_eq!(OpenUnitFraction::new(0.0), None);
/// assert_eq!(OpenUnitFraction::new(1.0), None);
/// ```
#[derive(Debug, Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub struct OpenUnitFraction(f64);

impl OpenUnitFraction {
    /// Validates a fraction strictly inside the unit interval.
    ///
    /// Returns [`None`] outside `(0, 1)`: both endpoints are refused, NaN fails both bounds, and
    /// `-0.0` fails strict positivity.
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if value > 0.0 && value < 1.0 {
            Some(Self(value))
        } else {
            None
        }
    }

    /// Returns whether `value`'s exact bits are a stored fraction.
    ///
    /// For validating persisted bytes, this accepts exactly the values accepted by
    /// [`new`](Self::new). The domain excludes both zeros and preserves accepted values bit for
    /// bit.
    #[inline]
    #[must_use]
    pub const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Creates a fraction from a value the caller proves lies in `(0, 1)`.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong fraction
    // rather than UB.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value > 0.0 && value < 1.0,
            "the caller promised a value strictly inside (0, 1)",
        );
        // excluding both zeros makes in-domain values canonical without normalization
        Self(value)
    }

    /// Returns the fraction.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }

    /// Returns the complement `1 − self`, widened to [`UnitFraction`].
    ///
    /// The closed return type admits exactly one: `1 − x` rounds to `1.0` for every in-domain `x ≤
    /// 2⁻⁵⁴`. The complement is never zero. Its minimum is `2⁻⁵³`, the complement of the largest
    /// fraction below one.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{OpenUnitFraction, UnitFraction};
    ///
    /// let kept = OpenUnitFraction::new(0.75).expect("0.75 lies inside (0, 1)");
    /// assert_eq!(
    ///     kept.complement(),
    ///     UnitFraction::new(0.25).expect("the complement is exact")
    /// );
    ///
    /// // A tiny fraction complements to exactly one - the open interval cannot hold the result.
    /// let sliver = OpenUnitFraction::new(1e-300).expect("1e-300 lies inside (0, 1)");
    /// assert_eq!(sliver.complement(), UnitFraction::ONE);
    /// ```
    #[inline]
    #[must_use]
    pub(crate) const fn complement(self) -> UnitFraction {
        // Rounding cannot leave [0, 1], whose endpoints are representable. Here 1 − x lies in (0,
        // 1), and Sterbenz's lemma makes subtraction exact for x ≥ 0.5. The minimum result is 2⁻⁵³,
        // at x = 1 − 2⁻⁵³. The result is in-domain and strictly positive, requiring no sign
        // normalization.
        UnitFraction::new_unchecked(1.0 - self.0)
    }

    /// Computes `ln(1 - self)` without forming the rounded difference.
    ///
    /// Evaluates as `ln_1p(-self)` to preserve a small fraction's contribution near zero, where
    /// `1.0 - self` can round to exactly one. Near one, that subtraction is exact by Sterbenz's
    /// lemma. The open interval keeps the logarithm finite and strictly negative.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{OpenUnitFraction};
    ///
    /// let confidence = OpenUnitFraction::new(0.999).expect("0.999 lies inside (0, 1)");
    /// assert!((confidence.ln_complement() - 0.001_f64.ln()).abs() < 1e-12);
    ///
    /// let tiny = OpenUnitFraction::new(1e-300).expect("1e-300 is inside (0, 1)");
    /// assert_eq!(1.0 - tiny.get(), 1.0);
    /// assert!(tiny.ln_complement() < 0.0);
    /// ```
    #[inline]
    #[must_use]
    pub fn ln_complement(self) -> f64 {
        (-self.0).ln_1p()
    }
}

const impl PartialEq for OpenUnitFraction {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for OpenUnitFraction {}

const impl PartialOrd for OpenUnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for OpenUnitFraction {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // strictly positive finite floats: the bit pattern is monotone in the value
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for OpenUnitFraction {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing the unique representation agrees with numeric equality
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Display for OpenUnitFraction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl TryFrom<UnitFraction> for OpenUnitFraction {
    type Error = NotInOpenUnitInterval;

    #[inline]
    fn try_from(value: UnitFraction) -> Result<Self, Self::Error> {
        let raw = value.get();

        Self::new(raw).ok_or(NotInOpenUnitInterval(raw))
    }
}

const impl From<OpenUnitFraction> for f64 {
    #[inline]
    fn from(value: OpenUnitFraction) -> Self {
        value.get()
    }
}

const impl TryFrom<f64> for OpenUnitFraction {
    type Error = NotInOpenUnitInterval;

    #[inline]
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(NotInOpenUnitInterval(value))
    }
}

const impl PartialEq<DPositive> for OpenUnitFraction {
    #[inline]
    fn eq(&self, other: &DPositive) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DPositive> for OpenUnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &DPositive) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

const impl core::ops::Div<OpenUnitFraction> for f64 {
    type Output = f64;

    /// Divides a raw `f64` by the fraction, staying in `f64`.
    ///
    /// A divisor in `(0, 1)` is never zero and never NaN. A NaN quotient can arise only through the
    /// numerator. For a finite numerator, the rounded quotient's magnitude is at least the
    /// numerator's and can overflow to infinity.
    #[inline]
    fn div(self, rhs: OpenUnitFraction) -> f64 {
        self / rhs.0
    }
}

impl serde::Serialize for OpenUnitFraction {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for OpenUnitFraction {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a fraction in the open unit interval",
            )
        })
    }
}

raw_interop!(OpenUnitFraction[f64]);
unsafe_impl_try_from_bytes!(OpenUnitFraction[f64]);

#[cfg(test)]
#[expect(
    exported_private_dependencies,
    reason = "the impl is absent from downstream builds"
)]
impl Arbitrary for OpenUnitFraction {
    type Parameters = ();

    type Strategy = impl proptest::strategy::Strategy<Value = Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        (f64::from_bits(1)..1.0).prop_map(Self)
    }
}
