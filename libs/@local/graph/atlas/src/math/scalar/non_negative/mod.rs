//! The finite, non-negative `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

#[cfg(test)]
use proptest::{arbitrary::Arbitrary, num, strategy::Strategy as _};

use super::{
    DNonNegative, Finite, Positive, UnitFraction, raw_interop, unsafe_impl_try_from_bytes,
};
use crate::math::Derivation;

#[cfg(test)]
mod tests;

/// Validates a non-negative literal at compile time.
///
/// A literal outside the domain fails the build. Use [`NonNegative::new`] to check runtime values.
macro_rules! non_negative {
    ($value:expr) => {
        const {
            $crate::math::NonNegative::new($value).expect("the literal is finite and non-negative")
        }
    };
}
pub(crate) use non_negative;

/// A finite, non-negative `f32`, valid by construction.
///
/// Admitting zero allows magnitudes and weights that switch a term off.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value,
/// with `-0.0` and `+0.0` the same value: construction canonicalizes the sign of zero. Values
/// sort and key ordered maps like the numbers they hold, with no NaN case, and
/// [`to_bits`](Self::to_bits) is an identity: one bit pattern per value.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{NonNegative};
///
/// assert_eq!(NonNegative::new(0.0).expect("zero is admitted").get(), 0.0);
/// assert_eq!(NonNegative::new(-0.5), None);
/// assert_eq!(NonNegative::new(f32::INFINITY), None);
/// ```
#[derive(Copy, Clone, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct NonNegative(f32);

impl NonNegative {
    /// The largest in-domain value, `f32::MAX`.
    ///
    /// Every in-domain reading sorts at or before `MAX`. An escaped `+∞` sorts after it.
    pub(crate) const MAX: Self = Self(f32::MAX);
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a non-negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and at least zero. A negative zero passes
    /// and is stored as `+0.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self::new_unchecked(value))
    }

    /// Creates a value the caller proves finite and at least zero.
    ///
    /// A promised `-0.0` is stored as `+0.0`. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f32) -> Self {
        debug_assert!(
            value.is_finite() && value >= 0.0,
            "the caller promised a finite non-negative value",
        );

        // `-0.0 + 0.0` is `+0.0` under round-to-nearest and every other in-range value is
        // unchanged: one add canonicalizes the sign of zero.
        Self(value + 0.0)
    }

    /// Returns the square of a raw scalar.
    ///
    /// The rounded square must be finite. For a finite argument it is non-negative, but a
    /// sufficiently large magnitude can overflow.
    #[inline]
    #[must_use]
    pub(crate) const fn square(value: f32) -> Self {
        let squared = value * value;
        debug_assert!(squared.is_finite(), "the square left the domain");

        Self(squared)
    }

    /// Widens to double precision, exactly.
    ///
    /// Every finite `f32` is exactly representable as `f64`. Widening preserves non-negativity and
    /// maps the canonical `+0.0` to `+0.0`. Therefore the widened value is the same real number
    /// with no rounding and no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn widen(self) -> DNonNegative {
        DNonNegative::from(self)
    }

    /// Squares into double precision, exactly and totally.
    ///
    /// Squaring a 24-bit significand needs at most 48 bits, within `f64`'s 53-bit precision. Every
    /// nonzero finite `f32` square lies in [2⁻²⁹⁸, 2²⁵⁶), inside the normal `f64` range. Widening
    /// before multiplication therefore gives an exact square that never leaves the domain. The
    /// square of zero is zero.
    #[inline]
    #[must_use]
    pub(crate) const fn square_wide(self) -> DNonNegative {
        DNonNegative::new_unchecked(self.widen().get() * self.widen().get())
    }

    /// Divides into double precision, totally.
    ///
    /// Positive finite `f32` values lie in [2⁻¹⁴⁹, 2¹²⁸). Their positive quotients lie between
    /// 2⁻²⁷⁷ and 2²⁷⁷, inside the normal `f64` range. Widening before division therefore gives
    /// a finite non-negative result with one rounding. A zero numerator gives exactly zero.
    #[inline]
    #[must_use]
    pub(crate) const fn div_wide(self, rhs: Positive) -> DNonNegative {
        DNonNegative::new_unchecked(self.widen().get() / rhs.widen().get())
    }

    /// Narrows to the strictly positive domain.
    ///
    /// Returns [`None`] exactly at zero.
    #[inline]
    #[must_use]
    pub(crate) const fn positive(self) -> Option<Positive> {
        Positive::new(self.0)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }

    /// Returns the canonical bit pattern.
    ///
    /// Equal values share one bit pattern, including the canonical `+0.0`. These bits identify the
    /// value exactly.
    #[inline]
    #[must_use]
    pub(crate) const fn to_bits(self) -> u32 {
        self.0.to_bits()
    }

    /// Returns whether the value is normal: neither zero, subnormal, nor escaped.
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

    /// Returns whether `value`'s exact bits are a stored non-negative value.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the value must
    /// be finite and at least zero, and a zero must be the canonical `+0.0` the constructors
    /// store, because admitting `-0.0` bits would produce a value whose bit-keyed equality,
    /// ordering and hashing disagree with its numeric value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f32) -> bool {
        match Self::new(value) {
            // The bit compare refuses `-0.0`, which construction stores as `+0.0`.
            Some(accepted) => accepted.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Returns whether the value is zero.
    #[inline]
    #[must_use]
    pub(crate) const fn is_zero(self) -> bool {
        self.0 == 0.0
    }

    /// Clamps from below by a positive floor.
    ///
    /// The result is at least the positive finite floor and remains finite, with no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn at_least(self, floor: Positive) -> Positive {
        Positive::new_unchecked(self.0.max(floor.get()))
    }

    /// Subtracts, saturating at zero.
    ///
    /// Returns the truncated difference `max(self - rhs, 0)`. The magnitude of a difference of two
    /// finite values of one sign never exceeds the larger operand. The subtraction cannot overflow,
    /// and clamping negative differences to zero keeps the result in the domain without
    /// re-validation. For the signed difference, `-` outputs [`Finite`].
    #[inline]
    #[must_use]
    pub(crate) fn saturating_sub(self, rhs: Self) -> Self {
        Self::new_unchecked((self.0 - rhs.0).max(0.0))
    }

    /// Divides, saturating at the domain ceiling.
    ///
    /// The quotient of a non-negative by a positive is never NaN and never negative, and a
    /// quotient beyond the `f32` range saturates at [`f32::MAX`], mirroring
    /// [`saturating_sub`](Self::saturating_sub) at the opposite edge. Underflow rounds to
    /// zero, inside the domain.
    #[inline]
    #[must_use]
    pub(crate) fn saturating_div(self, rhs: Positive) -> Self {
        Self::new_unchecked((self.0 / rhs.get()).min(f32::MAX))
    }

    /// Computes the logistic function `1 / (1 + exp(-value))` of a raw scalar.
    ///
    /// The evaluation feeds the negated magnitude to `exp`, keeping the intermediate exponent
    /// non-positive: the result lies in `[0, 1]`, inside the domain, for every non-NaN
    /// argument, the infinities included. Once `exp` underflows, the asymptotes are exact
    /// (`sigmoid(200.0)` is `1.0` and `sigmoid(-200.0)` is `0.0`), and
    /// `sigmoid(-value) == 1 - sigmoid(value)` holds up to rounding. The logistic function is
    /// the first derivative of [`softplus`](super::softplus). The argument must not be NaN.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{NonNegative};
    ///
    /// // At zero the two branches agree exactly: 1 / (1 + 1).
    /// assert_eq!(NonNegative::sigmoid(0.0), 0.5);
    /// // A naive `exp(200.0)` overflows. The stable form saturates.
    /// assert_eq!(NonNegative::sigmoid(200.0), 1.0);
    /// ```
    #[must_use]
    pub(crate) fn sigmoid(value: f32) -> Self {
        let bounded = (-value.abs()).exp();
        let result = if value >= 0.0 {
            (1.0 + bounded).recip()
        } else {
            // The direct ratio keeps relative precision where the
            // complement `1 - 1/(1 + bounded)` would round to zero.
            bounded / (1.0 + bounded)
        };
        debug_assert!(!result.is_nan(), "the logistic function of NaN is NaN");

        Self(result)
    }

    /// Evaluates the Huber penalty against a threshold.
    ///
    /// The penalty is `value²/2` up to the threshold and continues along the tangent line
    /// `threshold · (value - threshold/2)` above it. Both branches meet at `threshold²/2` with
    /// matching first derivative `threshold` in exact arithmetic. The floating-point evaluation
    /// rounds these expressions and saturates an overflow at [`f32::MAX`].
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{NonNegative, Positive};
    ///
    /// let threshold = Positive::new(1.0).expect("1.0 is positive");
    ///
    /// // Quadratic regime: 0.5 · 0.5 · 0.5.
    /// let half = NonNegative::new(0.5).expect("0.5 is non-negative");
    /// assert_eq!(half.huber(threshold).get(), 0.125);
    ///
    /// // Linear regime: 1.0 · (3.0 - 0.5).
    /// let three = NonNegative::new(3.0).expect("3.0 is non-negative");
    /// assert_eq!(three.huber(threshold).get(), 2.5);
    /// ```
    #[inline]
    #[must_use]
    pub(crate) fn huber(self, threshold: Positive) -> Self {
        let threshold = threshold.get();
        let penalty = if self.0 <= threshold {
            0.5 * self.0 * self.0
        } else {
            threshold.mul_add(-0.5, self.0) * threshold
        };

        // Both branches produce a nonnegative penalty with no NaN. Overflow can only produce +∞,
        // which the clamp maps to `f32::MAX`. The clamped penalty is in the domain.
        Self::new_unchecked(penalty.min(f32::MAX))
    }

    /// Returns the square root.
    ///
    /// The root of a non-negative value is non-negative, with no re-validation. The root of
    /// zero is zero.
    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // In domain with no check: `sqrt` over `[0, MAX]` is monotone into `[0, ~1.8e19]`,
        // never NaN for a non-negative operand, and `sqrt(+0.0)` is `+0.0`.
        Self(self.0.sqrt())
    }

    /// Raises to a real power with deferred validation.
    ///
    /// Overflow and zero raised to a negative exponent produce infinity in the [`Derivation`]. Zero
    /// raised to zero is one. Underflow to zero remains nonnegative.
    #[inline]
    pub(crate) fn powf(self, exponent: Finite) -> Derivation<Self> {
        Derivation::raw(self.0.powf(exponent.get()))
    }

    /// Returns the reciprocal.
    ///
    /// The rounded reciprocal must be finite. Zero and sufficiently small positive operands
    /// produce positive infinity. For other in-domain values the result is positive.
    #[inline]
    #[must_use]
    pub(crate) const fn inverse(self) -> Self {
        let inverse = 1.0 / self.0;
        debug_assert!(
            inverse.is_finite(),
            "the inverse of a zero reading overflowed"
        );

        Self(inverse)
    }

    /// Returns the midpoint, without intermediate overflow.
    #[inline]
    #[must_use]
    pub(crate) const fn midpoint(self, other: Self) -> Self {
        Self(self.0.midpoint(other.0))
    }

    /// Multiplies, returning [`None`] when the product overflows.
    ///
    /// A product of accepted values can leave the finite range. The checked form reports that
    /// escape as an absence, mirroring the integer `checked_mul`.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_mul(self, rhs: Self) -> Option<Self> {
        let product = self.0 * rhs.0;
        if product.is_finite() {
            Some(Self(product))
        } else {
            None
        }
    }
}

const impl Default for NonNegative {
    #[inline]
    fn default() -> Self {
        Self(0.0)
    }
}

const impl PartialEq for NonNegative {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for NonNegative {}

const impl PartialOrd for NonNegative {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for NonNegative {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For canonical non-negative floats the bit pattern is monotone in the value: a GPR
        // compare with no NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for NonNegative {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing the canonical representation agrees with numeric equality
        state.write_u32(self.0.to_bits());
    }
}

impl fmt::Debug for NonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for NonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl From<Positive> for NonNegative {
    #[inline]
    fn from(value: Positive) -> Self {
        Self(value.get())
    }
}

const impl core::ops::Add for NonNegative {
    type Output = Self;

    /// Adds.
    ///
    /// The rounded sum must remain finite. A sum of in-domain values is never NaN or `-0.0`,
    /// but it can overflow to positive infinity.
    #[inline]
    fn add(self, rhs: Self) -> Self {
        let sum = self.0 + rhs.0;
        debug_assert!(sum.is_finite(), "non-negative addition overflowed");

        Self(sum)
    }
}

const impl core::ops::AddAssign for NonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl core::ops::Add<Positive> for NonNegative {
    type Output = Positive;

    /// Adds a positive step into the positive domain.
    ///
    /// The rounded sum must remain finite. Monotone rounding keeps it at least as large as the
    /// positive operand, but does not prevent overflow.
    #[inline]
    fn add(self, rhs: Positive) -> Positive {
        let sum = self.0 + rhs.get();
        debug_assert!(sum.is_finite(), "the positive-stepped sum overflowed");

        Positive::new_unchecked(sum)
    }
}

const impl core::ops::Sub for NonNegative {
    type Output = Finite;

    /// Subtracts, into the finite domain.
    ///
    /// The magnitude of a difference of two non-negative finite values never exceeds the larger
    /// operand. The subtraction cannot overflow and needs no re-validation. Equal operands give
    /// `+0.0`. Use [`saturating_sub`](Self::saturating_sub) to clamp negative differences to zero.
    #[inline]
    fn sub(self, rhs: Self) -> Finite {
        Finite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Mul for NonNegative {
    type Output = Derivation<Self>;

    /// Multiplies with deferred validation of overflow.
    #[inline]
    fn mul(self, rhs: Self) -> Self::Output {
        Derivation::raw(self.0 * rhs.0)
    }
}

const impl core::ops::Mul<Positive> for NonNegative {
    type Output = Derivation<Self>;

    #[inline]
    fn mul(self, rhs: Positive) -> Self::Output {
        Derivation::raw(self.0 * rhs.get())
    }
}

const impl core::ops::Mul<UnitFraction> for NonNegative {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: UnitFraction) -> Self::Output {
        // A fraction in [0, 1] cannot increase the magnitude of a nonnegative finite value. The
        // product remains finite and nonnegative without a check, with canonical +0.0 for a zero
        // product.
        Self(self.0 * rhs.as_f32())
    }
}

const impl core::ops::Div<Positive> for NonNegative {
    type Output = Derivation<Self>;

    /// Divides by a nonzero divisor with deferred validation of overflow.
    #[inline]
    fn div(self, rhs: Positive) -> Self::Output {
        Derivation::raw(self.0 / rhs.get())
    }
}

const impl core::ops::Div for NonNegative {
    type Output = Derivation<Self>;

    /// Divides with deferred validation of zero division and overflow.
    #[inline]
    fn div(self, rhs: Self) -> Self::Output {
        Derivation::raw(self.0 / rhs.0)
    }
}

const impl core::ops::Mul<Finite> for NonNegative {
    type Output = f32;

    /// Multiplies by a finite signed value, leaving the domain.
    ///
    /// The raw product follows the finite operand's sign and can overflow. A NaN cannot arise: both
    /// operands are finite.
    #[inline]
    fn mul(self, rhs: Finite) -> f32 {
        self.0 * rhs.get()
    }
}

const impl From<NonNegative> for f64 {
    #[inline]
    fn from(value: NonNegative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

const impl core::ops::Add<NonNegative> for f32 {
    type Output = f32;

    #[inline]
    fn add(self, rhs: NonNegative) -> f32 {
        self + rhs.0
    }
}

impl serde::Serialize for NonNegative {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for NonNegative {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f32::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(f64::from(value)),
                &"a finite non-negative number",
            )
        })
    }
}

raw_interop!(NonNegative[f32]);
unsafe_impl_try_from_bytes!(NonNegative[f32]);

#[cfg(test)]
impl Arbitrary for NonNegative {
    type Parameters = ();

    type Strategy = impl proptest::strategy::Strategy<Value = Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        (num::f32::POSITIVE | num::f32::NORMAL | num::f32::SUBNORMAL | num::f32::ZERO)
            .prop_map(Self)
    }
}
