//! The finite, non-negative `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{DNonNegative, Finite, Positive, raw_interop, unsafe_impl_try_from_bytes};

/// Validates a non-negative literal at compile time.
///
/// The expansion is a `const` block over [`NonNegative::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
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
/// The shared definition of the finite-and-non-negative check. Zero passes, so the type carries
/// magnitudes and weights that may legitimately switch a term off.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value,
/// with `-0.0` and `+0.0` the same value: construction canonicalizes the sign of zero. Values
/// sort and key ordered maps like the numbers they hold, with no NaN case, and
/// [`to_bits`](Self::to_bits) is an identity: one bit pattern per value.
///
/// # Examples
///
/// ```ignore
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
    /// A square is never negative and never NaN for non-NaN arguments. Overflow escapes to `+∞`
    /// and asserts in debug builds, mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) const fn square(value: f32) -> Self {
        let squared = value * value;
        debug_assert!(squared.is_finite(), "the square left the domain");

        Self(squared)
    }

    #[inline]
    #[must_use]
    pub(crate) const fn widen(self) -> DNonNegative {
        DNonNegative::from(self)
    }

    /// Narrows to the strictly positive domain.
    ///
    /// Returns [`None`] exactly at zero, so an `if let` on the result is the zero guard and the
    /// positivity witness in one move.
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
    /// Construction canonicalizes the sign of zero, so equal values share one bit pattern and
    /// the bits identify the value exactly: fit for reproducibility records and bit-exact pins.
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

    /// Returns whether the value stayed in domain.
    ///
    /// Construction admits only finite values and arithmetic escapes to `+∞` on overflow, so a
    /// non-finite reading is exactly an escaped one.
    ///
    /// The one caller shape is a validation point that rejects escaped readings before acting on
    /// a computed value. Anywhere else the query re-checks what construction already proved, and
    /// the check itself is the defect.
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
    /// The larger of a non-negative value and a positive floor is at least the floor, so the
    /// result carries the stricter domain with no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn at_least(self, floor: Positive) -> Positive {
        Positive::new_unchecked(self.0.max(floor.get()))
    }

    /// Subtracts, saturating at zero.
    ///
    /// The truncated difference `max(self - rhs, 0)`, mirroring the integer `saturating_sub`: a
    /// difference below the domain floor returns zero. The magnitude of a difference of two
    /// finite values of one sign never exceeds the larger operand, so the subtraction cannot
    /// overflow and the result needs no re-validation. For the signed difference, `-` outputs
    /// [`Finite`].
    #[inline]
    #[must_use]
    pub(crate) fn saturating_sub(self, rhs: Self) -> Self {
        Self::new_unchecked((self.0 - rhs.0).max(0.0))
    }

    /// Computes the logistic function `1 / (1 + exp(-value))` of a raw scalar.
    ///
    /// The evaluation feeds the negated magnitude to `exp`, keeping the intermediate exponent
    /// non-positive: the result lies in `[0, 1]`, inside the domain, for every non-NaN
    /// argument, the infinities included. Once `exp` underflows, the asymptotes are exact
    /// (`sigmoid(200.0)` is `1.0` and `sigmoid(-200.0)` is `0.0`), and
    /// `sigmoid(-value) == 1 - sigmoid(value)` holds up to rounding. The logistic function is
    /// the first derivative of [`softplus`](super::softplus). A NaN argument asserts in debug
    /// builds and passes through in release, the way the arithmetic operators treat their
    /// invalid inhabitants.
    ///
    /// # Examples
    ///
    /// ```ignore
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
    /// matching first derivative `threshold`, so the penalty is continuous with a continuous
    /// first derivative. An evaluation that overflows the `f32` range saturates at
    /// [`f32::MAX`], the same resolution [`sigmoid`](Self::sigmoid) applies at its asymptote.
    ///
    /// # Examples
    ///
    /// ```ignore
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

        // Finite operands overflow only to +∞ and produce no NaN, so the clamp re-enters the
        // domain.
        Self::new_unchecked(penalty.min(f32::MAX))
    }

    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // In domain with no check: `sqrt` over `[0, MAX]` is monotone into `[0, ~1.8e19]`,
        // never NaN for a non-negative operand, and `sqrt(+0.0)` is `+0.0`.
        Self(self.0.sqrt())
    }

    /// Fuses a multiply-add `self · factor + addend` with one rounding.
    ///
    /// Products and sums of non-negatives stay non-negative and are never NaN. Overflow escapes
    /// to `+∞` and asserts in debug builds, mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) fn mul_add(self, factor: Self, addend: Self) -> Self {
        let fused = self.0.mul_add(factor.0, addend.0);
        debug_assert!(fused.is_finite(), "the fused multiply-add overflowed");

        Self(fused)
    }

    /// Raises to a real power.
    ///
    /// Never NaN over the domain: a negative base is unrepresentable, and `0⁰` is one. Overflow,
    /// and a zero base under a negative exponent, escape to `+∞` and assert in debug builds,
    /// mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) fn powf(self, exponent: f32) -> Self {
        let raised = self.0.powf(exponent);
        debug_assert!(raised.is_finite(), "the power left the domain");

        Self(raised)
    }

    /// Returns the reciprocal.
    ///
    /// Never NaN and never negative over the domain. A zero reading escapes to `+∞` and asserts
    /// in debug builds, mirroring integer `+`. An escaped `+∞` collapses back to `+0.0`.
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
        // one bit pattern per value, so bit equality is numeric equality
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
        // canonical bits: equal values share one bit pattern, so `Hash` agrees with `Eq`
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
    /// Widens into the enclosing domain: every positive value is non-negative.
    #[inline]
    fn from(value: Positive) -> Self {
        Self(value.get())
    }
}

const impl core::ops::Add for NonNegative {
    type Output = Self;

    /// Adds.
    ///
    /// A sum of non-negatives is never NaN and never `-0.0`. Overflow escapes to `+∞` - a
    /// wrong reading rather than a soundness break, since no unsafe code trusts the domain and
    /// a persisted value re-validates at construction - and asserts in debug builds, mirroring
    /// integer `+`.
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
    /// The sum is positive - rounding is monotone, so it never rounds below the positive
    /// operand - and never NaN. Overflow escapes to `+∞` and asserts in debug builds,
    /// mirroring integer `+`.
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
    /// The difference of two non-negative finite values is finite, with no re-validation: its
    /// magnitude never exceeds the larger operand, so the subtraction cannot overflow. Equal
    /// operands give `+0.0`. For the difference clamped back into this domain,
    /// [`saturating_sub`](Self::saturating_sub) subtracts without leaving it.
    #[inline]
    fn sub(self, rhs: Self) -> Finite {
        Finite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Mul for NonNegative {
    type Output = Self;

    /// Multiplies.
    ///
    /// A product of non-negatives is non-negative and never NaN, and zero keeps its canonical
    /// positive sign. Overflow escapes to `+∞` and asserts in debug builds, mirroring integer
    /// `+`. For a product the caller revalidates, [`checked_mul`](Self::checked_mul) returns the
    /// overflow as [`None`].
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        let product = self.0 * rhs.0;
        debug_assert!(
            product.is_finite(),
            "non-negative multiplication overflowed"
        );

        Self(product)
    }
}

const impl core::ops::Div<Positive> for NonNegative {
    type Output = Self;

    /// Divides by a positive divisor.
    ///
    /// The quotient is non-negative and never NaN, because the divisor is never zero. A divisor
    /// below one can overflow to `+∞`. The crossing asserts in debug builds the way integer `+`
    /// does.
    #[inline]
    fn div(self, rhs: Positive) -> Self {
        let quotient = self.0 / rhs.get();
        debug_assert!(quotient.is_finite(), "the quotient overflowed");

        Self(quotient)
    }
}

const impl From<NonNegative> for f64 {
    /// Widens into double precision, exactly.
    #[inline]
    fn from(value: NonNegative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

const impl core::ops::Add<NonNegative> for f32 {
    type Output = f32;

    /// Adds a non-negative offset to a raw `f32`.
    ///
    /// The raw operand is arbitrary, so the sum can leave any bounded domain and returns a raw
    /// float.
    #[inline]
    fn add(self, rhs: NonNegative) -> f32 {
        self + rhs.0
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for NonNegative {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, zero and subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (0.0..=f32::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for NonNegative {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for NonNegative {
    /// Deserializes a plain number, refusing values outside the finite non-negative range.
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
