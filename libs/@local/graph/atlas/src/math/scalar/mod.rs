//! Numerically stable scalar special functions with validated domains.
//!
//! Checked float narrowing rides beside them.
//!
//! These formalize numeric patterns that recur across the crate: a stable softplus and the Huber
//! penalty for layout losses, checked `f64` to `f32` narrowing for persisted coordinates, the
//! unit-interval fractions [`UnitFraction`], [`PositiveUnitFraction`] and [`OpenUnitFraction`],
//! and the finiteness-only
//! guards [`Finite`] and [`DFinite`] for signed quantities, all validated once at construction and
//! carried by configuration knobs and measured shares alike. Vector reductions such as softmax and
//! log-sum-exp live on [`DVecN`](super::DVecN).
mod finite;
#[cfg(test)]
mod tests;
mod unit;

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

pub(crate) use finite::{DFinite, Finite};
#[cfg(test)]
pub(crate) use finite::{d_finite, finite};
pub(crate) use unit::{OpenUnitFraction, PositiveUnitFraction, UnitFraction};

/// Validates a positive literal at compile time.
///
/// The expansion is a `const` block over [`Positive::new`], so a literal outside the domain fails
/// the build instead of a test run. Runtime values keep the checked constructor.
macro_rules! positive {
    ($value:expr) => {
        const { $crate::math::Positive::new($value).expect("the literal is finite and positive") }
    };
}
pub(crate) use positive;

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

/// Validates a positive double-precision literal at compile time.
///
/// The expansion is a `const` block over [`DPositive::new`], so a literal outside the domain fails
/// the build instead of a test run. Runtime values keep the checked constructor.
macro_rules! d_positive {
    ($value:expr) => {
        const { $crate::math::DPositive::new($value).expect("the literal is finite and positive") }
    };
}
pub(crate) use d_positive;

/// Validates a non-negative double-precision literal at compile time.
///
/// The expansion is a `const` block over [`DNonNegative::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! d_non_negative {
    ($value:expr) => {
        const {
            $crate::math::DNonNegative::new($value)
                .expect("the literal is finite and non-negative")
        }
    };
}
#[cfg(test)]
pub(crate) use d_non_negative;

/// Validates an open-unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`OpenUnitFraction::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
macro_rules! open_unit_fraction {
    ($value:expr) => {
        const { $crate::math::OpenUnitFraction::new($value).expect("the literal lies inside (0, 1)") }
    };
}
pub(crate) use open_unit_fraction;

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

/// Validates a unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`UnitFraction::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
macro_rules! unit_fraction {
    ($value:expr) => {
        const { $crate::math::UnitFraction::new($value).expect("the literal lies in [0, 1]") }
    };
}
pub(crate) use unit_fraction;

/// Validates a positive-unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`PositiveUnitFraction::new`], so a literal outside the
/// domain fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! positive_unit_fraction {
    ($value:expr) => {
        const {
            $crate::math::PositiveUnitFraction::new($value)
                .expect("the literal lies inside (0, 1]")
        }
    };
}
#[cfg(test)]
pub(crate) use positive_unit_fraction;

macro_rules! nz {
    ($value:expr) => {
        const { NonZero::new($value).expect("the literal is nonzero") }
    };
}
pub(crate) use nz;

/// Implements [`zerocopy::TryFromBytes`] for `repr(transparent)` scalar newtypes.
///
/// A derive states a type's bit validity as its fields' bit validity, and a raw primitive field
/// admits every bit pattern, so a domain-validated newtype writes the impl by hand. The shape is
/// zerocopy's own `NonZero` impl: reinterpret the candidate as an unaligned primitive and copy
/// the value out, accepting exactly the bit patterns the type's `is_canonical` accepts. This is
/// what lets a mapped byte region serve typed rows, the domain validated as the bytes are read.
///
/// Soundness rides on two facts per listed type. The layout claim, `repr(transparent)` over the
/// named primitive, is checked at compile time: the exact-size cast refuses a size mismatch. The
/// domain claim is `is_canonical`'s contract - `true` exactly for the bit patterns the validating
/// constructors can store - which its construct-and-compare body takes from the constructor
/// itself.
macro_rules! unsafe_impl_try_from_bytes {
    ($($ty:ident[$prim:ty]),* $(,)?) => {
        $(
            // SAFETY: `is_bit_valid` returns `true` exactly when the candidate's bytes hold a
            // valid value. The type is `repr(transparent)` over a primitive that every
            // initialized byte pattern inhabits, so the read below yields the stored value, and
            // `is_canonical` accepts exactly the bit patterns the validating constructors can
            // store.
            unsafe impl zerocopy::TryFromBytes for $ty {
                fn only_derive_is_allowed_to_implement_this_trait() {}

                #[inline]
                fn is_bit_valid<A: zerocopy::pointer::invariant::Alignment>(
                    candidate: zerocopy::Maybe<'_, Self, A>,
                ) -> bool {
                    // Reinterpret the candidate as an unaligned primitive: the same size, every
                    // bit pattern valid, at any alignment. `read` copies the value out of the
                    // shared referent.
                    let candidate = candidate.transmute_with::<
                        zerocopy::Unalign<$prim>,
                        zerocopy::pointer::invariant::Valid,
                        zerocopy::pointer::cast::CastSizedExact,
                        zerocopy::BecauseImmutable,
                    >();

                    Self::is_canonical(candidate.read().into_inner())
                }
            }
        )*
    };
}
pub(crate) use unsafe_impl_try_from_bytes;

/// A finite, strictly positive `f32`, valid by construction.
///
/// The shared definition of the finite-and-positive check that recurs across configuration and
/// weight fields: a value that exists is valid, and the consuming site validates nothing.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(Positive::new(2.5).expect("2.5 is positive").get(), 2.5);
/// assert_eq!(Positive::new(0.0), None);
/// assert_eq!(Positive::new(f32::NAN), None);
/// ```
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
/// The domain excludes NaN and both zeros, so every value owns one bit pattern with no
/// canonicalization step.
#[derive(Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct Positive(f32);

impl Positive {
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
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the domain
    /// holds no zero of either sign and accepted values store bit for bit, so the bits are
    /// valid exactly when [`new`](Self::new) accepts the value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f32) -> bool {
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
    pub(crate) const fn get(self) -> f32 {
        self.0
    }

    /// Returns the square root.
    ///
    /// The root of a positive value is positive, with no re-validation.
    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // In domain with no check: sqrt is monotone from (0, MAX] into (0, ~1.8e19], never NaN
        // for a positive operand, and never zero - the root halves the exponent, so the
        // smallest input roots far above the underflow threshold.
        Self::new_unchecked(self.0.sqrt())
    }
}

const impl PartialEq for Positive {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
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
        // one bit pattern per value, so `Hash` agrees with `Eq`
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

const impl PartialEq<f32> for Positive {
    #[inline]
    fn eq(&self, other: &f32) -> bool {
        // numeric, not bitwise: the raw side may be `-0.0` or NaN, and the comparison must
        // follow IEEE semantics for both
        self.0 == *other
    }
}

const impl PartialEq<Positive> for f32 {
    #[inline]
    fn eq(&self, other: &Positive) -> bool {
        *self == other.0
    }
}

const impl PartialOrd<f32> for Positive {
    #[inline]
    fn partial_cmp(&self, other: &f32) -> Option<Ordering> {
        self.0.partial_cmp(other)
    }
}

const impl PartialOrd<Positive> for f32 {
    #[inline]
    fn partial_cmp(&self, other: &Positive) -> Option<Ordering> {
        self.partial_cmp(&other.0)
    }
}

const impl core::ops::Mul<f32> for Positive {
    type Output = f32;

    /// Scales a raw `f32`.
    ///
    /// The raw operand is arbitrary, so the product can leave the domain and returns a raw
    /// float.
    #[inline]
    fn mul(self, rhs: f32) -> f32 {
        self.0 * rhs
    }
}

const impl core::ops::Mul<Positive> for f32 {
    type Output = f32;

    #[inline]
    fn mul(self, rhs: Positive) -> f32 {
        self * rhs.0
    }
}

const impl core::ops::Mul for Positive {
    type Output = Self;

    /// Multiplies.
    ///
    /// A product of positives is never NaN and never `-0.0`. Overflow escapes to `+∞` and
    /// underflow to `+0.0` - wrong readings rather than soundness breaks, since no unsafe code
    /// trusts the domain and a persisted value re-validates at construction - and both assert
    /// in debug builds, mirroring integer `+`.
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        let product = self.0 * rhs.0;
        debug_assert!(
            product.is_finite() && product > 0.0,
            "positive multiplication left the domain",
        );

        Self(product)
    }
}

const impl From<Positive> for f64 {
    /// Widens into double precision, exactly.
    #[inline]
    fn from(value: Positive) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

const impl core::ops::Div<Positive> for f32 {
    type Output = f32;

    /// Divides a raw `f32` by a positive divisor, which is never zero.
    ///
    /// The result is a raw float: the numerator is arbitrary, so the quotient can leave any
    /// bounded domain.
    #[inline]
    fn div(self, rhs: Positive) -> f32 {
        self / rhs.0
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for Positive {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (f32::from_bits(1)..=f32::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for Positive {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Positive {
    /// Deserializes a plain number, refusing values outside the finite positive range.
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
        Positive(self.0.max(floor.0))
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
    /// the first derivative of [`softplus`]. A NaN argument asserts in debug builds and passes
    /// through in release, the way the arithmetic operators treat their invalid inhabitants.
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

impl From<Positive> for NonNegative {
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
        let sum = self.0 + rhs.0;
        debug_assert!(sum.is_finite(), "the positive-stepped sum overflowed");

        Positive(sum)
    }
}

impl core::ops::Sub for NonNegative {
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

const impl core::ops::Div for NonNegative {
    type Output = Self;

    #[inline]
    fn div(self, rhs: Self) -> Self {
        Self(self.0 / rhs.0)
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
        let quotient = self.0 / rhs.0;
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

const impl PartialEq<f32> for NonNegative {
    #[inline]
    fn eq(&self, other: &f32) -> bool {
        // numeric, not bitwise: the raw side may be `-0.0` or NaN, and the comparison must
        // follow IEEE semantics for both
        self.0 == *other
    }
}

const impl PartialEq<NonNegative> for f32 {
    #[inline]
    fn eq(&self, other: &NonNegative) -> bool {
        *self == other.0
    }
}

const impl PartialOrd<f32> for NonNegative {
    #[inline]
    fn partial_cmp(&self, other: &f32) -> Option<Ordering> {
        self.0.partial_cmp(other)
    }
}

const impl PartialOrd<NonNegative> for f32 {
    #[inline]
    fn partial_cmp(&self, other: &NonNegative) -> Option<Ordering> {
        self.partial_cmp(&other.0)
    }
}

const impl core::ops::Mul<f32> for NonNegative {
    type Output = f32;

    /// Scales a raw `f32`.
    ///
    /// The raw operand is arbitrary, so the product can leave the domain and returns a raw
    /// float.
    #[inline]
    fn mul(self, rhs: f32) -> f32 {
        self.0 * rhs
    }
}

const impl core::ops::Mul<NonNegative> for f32 {
    type Output = f32;

    #[inline]
    fn mul(self, rhs: NonNegative) -> f32 {
        self * rhs.0
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

/// A finite, strictly positive `f64`, valid by construction.
///
/// The double-precision twin of [`Positive`], named as [`DVecN`](super::DVecN) is to
/// [`VecN`](super::VecN): configuration fields that steer double-precision arithmetic carry their
/// domain in the type, and the consuming site validates nothing.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(
///     DPositive::new(1.0e-8)
///         .expect("the radius floor is positive")
///         .get(),
///     1.0e-8
/// );
/// assert_eq!(DPositive::new(0.0), None);
/// assert_eq!(DPositive::new(f64::INFINITY), None);
/// ```
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
/// The domain excludes NaN and both zeros, so every value owns one bit pattern with no
/// canonicalization step.
#[derive(Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct DPositive(f64);

impl DPositive {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);

    /// Validates a strictly positive finite value.
    ///
    /// Returns [`None`] unless the value is finite and greater than zero.
    #[inline]
    #[must_use]
    pub(crate) const fn new<T>(value: T) -> Option<Self>
    where
        T: [const] Into<f64>,
    {
        let value = value.into();
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns whether `value`'s exact bits are a stored positive value.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the domain
    /// holds no zero of either sign and accepted values store bit for bit, so the bits are
    /// valid exactly when [`new`](Self::new) accepts the value.
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

    /// Creates a value the caller proves finite and strictly positive.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value.is_finite() && value > 0.0,
            "the caller promised a finite positive value",
        );

        Self(value)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

const impl PartialEq for DPositive {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for DPositive {}

const impl PartialOrd for DPositive {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for DPositive {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For positive floats the bit pattern is monotone in the value: a GPR compare with no
        // NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for DPositive {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // one bit pattern per value, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Debug for DPositive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for DPositive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<Positive> for DPositive {
    /// Widens into double precision, exactly.
    ///
    /// Every positive `f32` denotes a positive, finite `f64`, so no re-validation happens.
    #[inline]
    fn from(value: Positive) -> Self {
        Self(f64::from(value.get()))
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for DPositive {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (f64::from_bits(1)..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DPositive {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DPositive {
    /// Deserializes a plain number, refusing values outside the finite strictly positive range.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a finite positive number",
            )
        })
    }
}

/// A finite, non-negative `f64`, valid by construction.
///
/// The double-precision twin of [`NonNegative`]. Zero passes, so the type carries tolerances and
/// floors that may legitimately switch a check off, and measured magnitudes such as distances.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value,
/// with `-0.0` and `+0.0` the same value: construction canonicalizes the sign of zero. Values
/// sort and key ordered maps like the numbers they hold, with no NaN case.
///
/// Arithmetic whose result provably stays in the domain stays in the type. The square root of a
/// non-negative value is non-negative ([`sqrt`](Self::sqrt)), while subtracting one non-negative
/// value from another leaves the domain yet provably stays finite, so `-` outputs [`DFinite`].
/// Serialization writes plain numbers and deserialization re-validates.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(
///     DNonNegative::new(0.0)
///         .expect("zero disables the floor")
///         .get(),
///     0.0
/// );
/// assert_eq!(DNonNegative::new(-1.0e-10), None);
/// assert_eq!(DNonNegative::new(f64::NAN), None);
/// ```
#[derive(Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct DNonNegative(f64);

impl DNonNegative {
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a non-negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and at least zero. A negative zero passes
    /// and is stored as `+0.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self::new_unchecked(value))
    }

    /// Returns whether `value`'s exact bits are a stored non-negative value.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the value must
    /// be finite and at least zero, and a zero must be the canonical `+0.0` the constructors
    /// store, because admitting `-0.0` bits would produce a value whose bit-keyed equality,
    /// ordering and hashing disagree with its numeric value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // The bit compare refuses `-0.0`, which construction stores as `+0.0`.
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Creates a value the caller proves finite and at least zero.
    ///
    /// A promised `-0.0` is stored as `+0.0`. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value.is_finite() && value >= 0.0,
            "the caller promised a finite non-negative value",
        );

        // `-0.0 + 0.0` is `+0.0` under round-to-nearest and every other in-range value is
        // unchanged: one add canonicalizes the sign of zero.
        Self(value + 0.0)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }

    /// Returns the square root.
    ///
    /// The root of a non-negative value is non-negative, with no re-validation. The root of
    /// zero is zero.
    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // In domain with no check: `sqrt` over `[0, MAX]` is monotone into `[0, ~1.35e154]`,
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
}

const impl Default for DNonNegative {
    fn default() -> Self {
        DNonNegative::ZERO
    }
}

impl fmt::Debug for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl PartialEq for DNonNegative {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for DNonNegative {}

const impl PartialOrd for DNonNegative {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for DNonNegative {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For canonical non-negative floats the bit pattern is monotone in the value: a GPR
        // compare with no NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for DNonNegative {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // canonical bits: equal values share one bit pattern, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

impl core::ops::Sub for DNonNegative {
    type Output = DFinite;

    /// Subtracts, into the finite domain.
    ///
    /// The difference of two non-negative finite values is finite, with no re-validation: its
    /// magnitude never exceeds the larger operand, so the subtraction cannot overflow. Equal
    /// operands give `+0.0`.
    #[inline]
    fn sub(self, rhs: Self) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Add<OpenUnitFraction> for DNonNegative {
    type Output = Self;

    /// Accumulates a fraction: an open unit fraction is a finite non-negative value, and a sum
    /// with a value below one cannot overflow.
    #[inline]
    fn add(self, rhs: OpenUnitFraction) -> Self {
        Self(self.0 + rhs.get())
    }
}

impl core::ops::AddAssign<OpenUnitFraction> for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: OpenUnitFraction) {
        self.0 += rhs.get();
    }
}

const impl core::ops::Add for DNonNegative {
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

const impl core::ops::AddAssign for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl core::ops::AddAssign<PositiveUnitFraction> for DNonNegative {
    /// Accumulates a fraction: a positive unit fraction is a finite non-negative value, and a
    /// sum with a value at most one cannot overflow.
    #[inline]
    fn add_assign(&mut self, rhs: PositiveUnitFraction) {
        *self = *self + Self(rhs.get());
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for DNonNegative {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, zero and subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (0.0..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DNonNegative {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DNonNegative {
    /// Deserializes a plain number, refusing values outside the finite non-negative range.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a finite non-negative number",
            )
        })
    }
}

impl From<DPositive> for DNonNegative {
    /// Widens into the enclosing domain: every positive value is non-negative.
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

const impl From<NonNegative> for DNonNegative {
    /// Widens into double precision, exactly: the canonical zero and the domain both survive.
    #[inline]
    fn from(value: NonNegative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.0 as f64)
    }
}

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

/// Computes `ln(1 + exp(value))` in a numerically stable form.
///
/// The evaluation uses `max(value, 0) + ln_1p(exp(-|value|))`, which keeps the intermediate
/// exponent non-positive: the result is finite for every finite input, approaching `value` itself
/// for large positive inputs and `0` for large negative inputs. The output is non-negative and
/// satisfies `softplus(value) - softplus(-value) == value` up to rounding.
///
/// # Examples
///
/// ```ignore
/// // A naive `exp(50.0)` loses the asymptote. The stable form is exact.
/// assert_eq!(softplus(50.0), 50.0);
/// assert!(softplus(-50.0) < 1e-20);
/// assert!((softplus(0.0) - core::f32::consts::LN_2).abs() < 1e-7);
/// ```
#[inline]
#[must_use]
pub(crate) fn softplus(value: f32) -> f32 {
    value.max(0.0) + (-value.abs()).exp().ln_1p()
}

/// Narrows an `f64` to `f32`, permitting rounding.
///
/// This converts with round-to-nearest and returns the result whenever it is finite. Inputs whose
/// magnitude exceeds the `f32` range, the infinities, and NaN all yield [`None`]. Negative zero
/// narrows to negative zero, preserving the sign bit.
///
/// For a conversion that also demands bit-exact representability, use [`narrow_f32_exact`].
///
/// # Examples
///
/// ```ignore
/// // Rounds to the nearest `f32`.
/// assert_eq!(narrow_f32(0.1), Some(0.1_f32));
/// // Beyond the `f32` range.
/// assert_eq!(narrow_f32(1e300), None);
/// assert_eq!(narrow_f32(f64::NAN), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  finiteness before being returned"
    )]
    let narrowed = value as f32;

    if narrowed.is_finite() {
        Some(narrowed)
    } else {
        None
    }
}

/// Narrows an `f64` to `f32` when the value is exactly representable.
///
/// The conversion succeeds precisely when the input is finite and widening the narrowed result back
/// to `f64` reproduces the input bit for bit; the returned `f32` therefore denotes the same real
/// number as the input. Values that would round, overflow the `f32` range, or fail to be finite
/// yield [`None`]. Negative zero is exactly representable and keeps its sign bit.
///
/// For a conversion that tolerates rounding, use [`narrow_f32`].
///
/// # Examples
///
/// ```ignore
/// assert_eq!(narrow_f32_exact(0.25), Some(0.25_f32));
/// // 0.1 has no exact `f32` representation.
/// assert_eq!(narrow_f32_exact(0.1), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32_exact(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  bit-exact round-tripping before being returned"
    )]
    let narrowed = value as f32;
    // `f64::from` is not callable in const contexts; the widening cast is
    // lossless.
    let widened = narrowed as f64;

    if narrowed.is_finite() && widened.to_bits() == value.to_bits() {
        Some(narrowed)
    } else {
        None
    }
}

unsafe_impl_try_from_bytes!(
    Positive[f32],
    NonNegative[f32],
    DPositive[f64],
    DNonNegative[f64],
    GreaterThanOne[f64],
    Log2[u8],
);
