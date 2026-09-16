//! The finite, strictly positive `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

#[cfg(test)]
use proptest::{arbitrary::Arbitrary, num, strategy::Strategy as _};

use super::{DPositive, Finite, Negative, NonNegative, raw_interop, unsafe_impl_try_from_bytes};
use crate::math::Derivation;

#[cfg(test)]
mod tests;

/// Validates a positive literal at compile time.
///
/// A literal outside the domain fails the build. Use [`Positive::new`] to check runtime values.
macro_rules! positive {
    ($value:expr) => {
        const { $crate::math::Positive::new($value).expect("the literal is finite and positive") }
    };
}
pub(crate) use positive;

/// A finite, strictly positive `f32`, valid by construction.
///
/// Use [`DPositive`] when the finite domain needs double precision. Products and quotients return a
/// [`Derivation`] because rounding can produce infinity or zero.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{Positive};
///
/// assert_eq!(Positive::new(2.5).expect("2.5 is positive").get(), 2.5);
/// assert_eq!(Positive::new(0.0), None);
/// assert_eq!(Positive::new(f32::NAN), None);
/// ```
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
/// Excluding NaN and both zeros gives every value one bit pattern without canonicalization.
#[derive(Copy, Clone, zerocopy::Immutable, zerocopy::IntoBytes, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct Positive(f32);

impl Positive {
    /// The domain's largest value, the largest finite `f32`.
    ///
    /// The exact ceiling a representation check compares against: past it, a working-precision
    /// value overflows to `+∞` and leaves the domain.
    pub(crate) const MAX: Self = Self(f32::MAX);
    /// The domain's smallest value, the smallest positive subnormal `2⁻¹⁴⁹`.
    pub(crate) const MIN: Self = Self(f32::from_bits(1));
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);

    /// Validates a strictly positive finite value.
    ///
    /// Returns [`None`] unless the value is finite and greater than zero.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Creates a value the caller proves finite and strictly positive.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f32) -> Self {
        debug_assert!(
            value.is_finite() && value > 0.0,
            "the caller promised a finite positive value",
        );

        Self(value)
    }

    /// Returns whether `value`'s exact bits are a stored positive value.
    ///
    /// For validating persisted bytes, this accepts exactly the values accepted by
    /// [`new`](Self::new). The domain excludes both zeros and preserves accepted values bit for
    /// bit.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f32) -> bool {
        match Self::new(value) {
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Returns whether the value is a normal `f32`, at or above `2⁻¹²⁶`.
    ///
    /// The domain admits subnormals, and a subnormal carries fewer than 24 significand bits. A
    /// caller whose relative-error argument assumes the full significand checks this before
    /// relying on it.
    #[inline]
    #[must_use]
    pub(crate) const fn is_normal(self) -> bool {
        self.0.is_normal()
    }

    /// Returns whether the stored reading is finite.
    ///
    /// Detects a non-finite result after arithmetic whose range requirements were not met.
    #[inline]
    #[must_use]
    pub(crate) const fn is_finite(self) -> bool {
        self.0.is_finite()
    }

    /// Widens to double precision, exactly.
    ///
    /// Every finite `f32` is exactly representable as `f64`. Widening preserves strict positivity.
    /// Therefore the widened value is the same real number with no rounding and no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn widen(self) -> DPositive {
        DPositive::from(self)
    }

    /// Multiplies into double precision, exactly and totally.
    ///
    /// The product of two 24-bit significands fits within 53 bits, and the product of two
    /// positive finite `f32` values lies between `2⁻²⁹⁸` and `2²⁵⁶`. Widening both operands
    /// before multiplication represents that product exactly in `f64`. Therefore the product
    /// never leaves the positive domain and has no rounding error.
    #[inline]
    #[must_use]
    pub(crate) const fn mul_wide(self, rhs: Self) -> DPositive {
        DPositive::new_unchecked(self.widen().get() * rhs.widen().get())
    }

    /// Divides into double precision, totally.
    ///
    /// Positive finite `f32` values lie in [2⁻¹⁴⁹, 2¹²⁸). Their quotient lies between
    /// 2⁻²⁷⁷ and 2²⁷⁷, inside the normal `f64` range. Widening before division therefore gives
    /// a finite positive result with one rounding.
    #[inline]
    #[must_use]
    pub(crate) const fn div_wide(self, rhs: Self) -> DPositive {
        DPositive::new_unchecked(self.widen().get() / rhs.widen().get())
    }

    /// Squares into double precision, exactly and totally.
    ///
    /// Squaring a 24-bit significand needs at most 48 bits, within `f64`'s 53-bit precision. Every
    /// positive finite `f32` square lies in [2⁻²⁹⁸, 2²⁵⁶), inside the normal `f64` range. Widening
    /// before multiplication therefore gives an exact square that never leaves the positive domain.
    #[inline]
    #[must_use]
    pub(crate) const fn square_wide(self) -> DPositive {
        DPositive::new_unchecked(self.widen().get() * self.widen().get())
    }

    /// Multiplies, refusing an escape from the domain.
    ///
    /// A product of positives is never NaN and never negative. Returns [`None`] exactly on overflow
    /// to `+∞` or underflow to zero.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_mul(self, other: Self) -> Option<Self> {
        let result = self.0 * other.0;

        if result.is_finite() && result > 0.0 {
            Some(Self(result))
        } else {
            None
        }
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }

    /// Returns the square root.
    ///
    /// The root of a positive value is positive, with no re-validation.
    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // The square root is monotone and never NaN for a positive finite operand. In-domain inputs
        // lie in [2⁻¹⁴⁹, 2¹²⁸), with real roots in [√(2⁻¹⁴⁹), 2⁶⁴). These bounds fit inside the
        // normal `f32` range. The rounded root remains positive and finite, never zero, without
        // re-validation.
        Self::new_unchecked(self.0.sqrt())
    }

    /// Returns the geometric mean `√(self · rhs)`, total.
    ///
    /// The exact geometric mean lies between the operands. The widened product is exact, and
    /// both root rounding and narrowing are monotone. Therefore the result remains between
    /// the representable positive operands and needs no range check.
    #[inline]
    #[must_use]
    pub(crate) fn geometric_mean(self, rhs: Self) -> Self {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the narrowing cast is the operation itself, and the mean of two `f32` \
                      values narrows back into the `f32` range by the bound above"
        )]
        Self::new_unchecked((self.widen().get() * rhs.widen().get()).sqrt() as f32)
    }

    /// Returns the reciprocal.
    ///
    /// The rounded reciprocal must be finite. A sufficiently small operand produces positive
    /// infinity. A valid operand's reciprocal never rounds to zero: even the reciprocal of
    /// [`Self::MAX`] exceeds the smallest positive subnormal.
    #[inline]
    #[must_use]
    pub(crate) const fn recip(self) -> Self {
        let reciprocal = 1.0 / self.0;
        debug_assert!(
            reciprocal.is_finite() && reciprocal > 0.0,
            "the reciprocal left the domain",
        );

        Self(reciprocal)
    }
}

const impl PartialEq for Positive {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for Positive {}

const impl PartialOrd for Positive {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for Positive {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For positive floats the bit pattern is monotone in the value: a GPR compare with no
        // NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for Positive {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing the unique representation agrees with numeric equality
        state.write_u32(self.0.to_bits());
    }
}

impl fmt::Debug for Positive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for Positive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl core::ops::Neg for Positive {
    type Output = Negative;

    /// Negates into the strictly negative domain, exactly.
    #[inline]
    fn neg(self) -> Negative {
        Negative::new_unchecked(-self.0)
    }
}

const impl From<Positive> for f64 {
    #[inline]
    fn from(value: Positive) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

const impl core::ops::Sub for Positive {
    type Output = Finite;

    /// Subtracts, into the finite domain.
    ///
    /// The magnitude of a difference of two positive finite values never exceeds the larger
    /// operand. The subtraction cannot overflow and needs no re-validation. Equal operands give
    /// `+0.0`.
    #[inline]
    fn sub(self, rhs: Self) -> Finite {
        Finite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Mul for Positive {
    type Output = Derivation<Self>;

    #[inline]
    fn mul(self, rhs: Self) -> Self::Output {
        Derivation::raw(self.0 * rhs.0)
    }
}

const impl core::ops::Mul<NonNegative> for Positive {
    type Output = Derivation<NonNegative>;

    #[inline]
    fn mul(self, rhs: NonNegative) -> Self::Output {
        Derivation::raw(self.0 * rhs.get())
    }
}

const impl core::ops::Div for Positive {
    type Output = Derivation<Self>;

    #[inline]
    fn div(self, rhs: Self) -> Self::Output {
        Derivation::raw(self.0 / rhs.0)
    }
}

const impl core::ops::Div<Positive> for f32 {
    type Output = f32;

    /// Divides a raw `f32` by a positive divisor, which is never zero.
    ///
    /// An arbitrary numerator can produce a quotient outside any bounded domain. The result remains
    /// a raw float.
    #[inline]
    fn div(self, rhs: Positive) -> f32 {
        self / rhs.0
    }
}

impl serde::Serialize for Positive {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Positive {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f32::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(f64::from(value)),
                &"a finite positive number",
            )
        })
    }
}

raw_interop!(Positive[f32]);
unsafe_impl_try_from_bytes!(Positive[f32]);

#[cfg(test)]
impl Arbitrary for Positive {
    type Parameters = ();

    type Strategy = impl proptest::strategy::Strategy<Value = Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        (num::f32::POSITIVE | num::f32::NORMAL | num::f32::SUBNORMAL).prop_map(Self)
    }
}
