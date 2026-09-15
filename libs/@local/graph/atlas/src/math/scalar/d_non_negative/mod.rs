//! The finite, non-negative `f64` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

#[cfg(test)]
use proptest::{arbitrary::Arbitrary, num, strategy::Strategy as _};

use super::{
    DFinite, DPositive, NonNegative, OpenUnitFraction, Positive, PositiveUnitFraction,
    UnitFraction, raw_interop, unsafe_impl_try_from_bytes,
};
use crate::math::derivation::Derivation;

#[cfg(test)]
mod tests;

/// Validates a non-negative double-precision literal at compile time.
///
/// A `const` block validates the literal with [`DNonNegative::new`] during compilation. A literal
/// outside the domain fails the build. Runtime values use the checked constructor.
macro_rules! d_non_negative {
    ($value:expr) => {
        const {
            $crate::math::DNonNegative::new($value)
                .expect("the literal is finite and non-negative")
        }
    };
}
pub(crate) use d_non_negative;

/// A finite, non-negative `f64`, valid by construction.
///
/// The double-precision twin of [`NonNegative`] admits zero. It represents measured magnitudes such
/// as distances and tolerances or floors that may use zero to switch a check off.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value,
/// with `-0.0` and `+0.0` the same value: construction canonicalizes the sign of zero. Values
/// sort and key ordered maps like the numbers they hold, with no NaN case.
///
/// Arithmetic preserves the type when its result provably remains in the domain. The square root of
/// a nonnegative value is nonnegative ([`sqrt`](Self::sqrt)). Subtraction returns [`DFinite`] to
/// admit negative differences while preserving finiteness. Serialization writes plain numbers and
/// deserialization re-validates.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DNonNegative};
///
/// assert_eq!(
///     DNonNegative::new(0.0)
///         .expect("zero disables the floor")
///         .get(),
///     0.0
/// );
/// assert_eq!(DNonNegative::new(-1.0e-10), None);
/// assert_eq!(DNonNegative::new(f64::NAN), None);
/// ```
#[derive(Copy, Clone, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct DNonNegative(f64);

impl DNonNegative {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Views a slice of readings as raw `f64`s.
    ///
    /// The `repr(transparent)` representation over `f64` gives both slices the same layout,
    /// permitting a zero-copy view.
    #[inline]
    pub(crate) fn slice_as_raw(values: &[Self]) -> &[f64] {
        zerocopy::FromBytes::ref_from_bytes(zerocopy::IntoBytes::as_bytes(values))
            .expect("a `repr(transparent)` newtype slice shares its primitive's size and alignment")
    }

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

    /// Converts a count into the domain.
    ///
    /// Counts at or below 2⁵³ convert exactly, and a larger count rounds to the nearest
    /// representable value, staying finite and non-negative.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the rounding above 2^53 is this constructor's stated contract"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn from_usize(value: usize) -> Self {
        Self(value as f64)
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

    /// Squares with deferred validation.
    ///
    /// Squaring can overflow the finite range. The product enters the derivation for validation at
    /// the finish.
    #[inline]
    pub(crate) const fn square(self) -> Derivation<Self> {
        Derivation::raw(self.0 * self.0)
    }

    /// Narrows to working precision with round-to-nearest.
    ///
    /// The rounded result must be finite. Values that round to positive infinity lie outside
    /// the result type's domain.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the rounding cast is the operation itself"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn narrow_lossy(self) -> NonNegative {
        NonNegative::new_unchecked(self.0 as f32)
    }

    /// Converts a count, exactly.
    ///
    /// Every `u16` is nonnegative and exactly representable in `f64`. The conversion is total and
    /// requires no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u16(value: u16) -> Self {
        Self(value as f64)
    }

    /// Narrows to the strictly positive domain.
    ///
    /// Returns [`None`] exactly at zero.
    #[inline]
    #[must_use]
    pub(crate) const fn positive(self) -> Option<DPositive> {
        DPositive::new(self.0)
    }

    /// Returns whether the value is zero.
    #[inline]
    #[must_use]
    pub(crate) const fn is_zero(self) -> bool {
        self.0 == 0.0
    }

    /// Returns whether the value is subnormal.
    #[inline]
    #[must_use]
    pub(crate) const fn is_subnormal(self) -> bool {
        self.0.is_subnormal()
    }

    /// Returns whether the stored reading is finite.
    ///
    /// Detects a non-finite result after arithmetic whose range requirements were not met.
    #[inline]
    #[must_use]
    pub(crate) const fn is_finite(self) -> bool {
        self.0.is_finite()
    }

    /// Divides by a positive value, refusing the escape.
    ///
    /// The quotient of a non-negative by a positive is never NaN and never negative, and
    /// underflow rounds to zero, inside the domain. Returns [`None`] exactly when the quotient
    /// overflows, where the plain division would escape to `+∞`.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_div(self, rhs: DPositive) -> Option<Self> {
        Self::new(self.0 / rhs.get())
    }

    /// Raises to a real power with deferred validation.
    ///
    /// Overflow and zero raised to a negative exponent produce infinity in the [`Derivation`]. Zero
    /// raised to zero is one. Underflow to zero remains nonnegative.
    #[inline]
    pub(crate) fn powf(self, exponent: DFinite) -> Derivation<Self> {
        Derivation::raw(self.0.powf(exponent.get()))
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

impl fmt::LowerExp for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::LowerExp::fmt(&self.0, fmt)
    }
}

const impl PartialEq for DNonNegative {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
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
        // hashing each value's canonical bit pattern preserves agreement with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

const impl core::ops::Sub for DNonNegative {
    type Output = DFinite;

    /// Subtracts, into the finite domain.
    ///
    /// The difference of two nonnegative finite values has a magnitude that never exceeds the
    /// larger operand. The subtraction cannot overflow and requires no re-validation. Equal
    /// operands give `+0.0`.
    #[inline]
    fn sub(self, rhs: Self) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Neg for DNonNegative {
    type Output = DFinite;

    /// Negates into the finite domain, exactly.
    ///
    /// The negation of a finite value is finite, and the sign is the reading.
    #[inline]
    fn neg(self) -> DFinite {
        DFinite::new_unchecked(-self.0)
    }
}

const impl core::ops::Add<f64> for DNonNegative {
    type Output = f64;

    #[inline]
    fn add(self, rhs: f64) -> f64 {
        self.0 + rhs
    }
}

const impl core::ops::Sub<f64> for DNonNegative {
    type Output = f64;

    #[inline]
    fn sub(self, rhs: f64) -> f64 {
        self.0 - rhs
    }
}

const impl core::ops::Add<DNonNegative> for f64 {
    type Output = f64;

    #[inline]
    fn add(self, rhs: DNonNegative) -> f64 {
        self + rhs.0
    }
}

const impl core::ops::Sub<DNonNegative> for f64 {
    type Output = f64;

    #[inline]
    fn sub(self, rhs: DNonNegative) -> f64 {
        self - rhs.0
    }
}

const impl core::ops::Sub<DPositive> for DNonNegative {
    type Output = DFinite;

    /// Subtracts a positive value, into the finite domain.
    ///
    /// The difference of two finite values of one sign has a magnitude that never exceeds the
    /// larger operand. The subtraction cannot overflow and requires no re-validation. The result is
    /// negative whenever the positive operand exceeds `self`.
    #[inline]
    fn sub(self, rhs: DPositive) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.get())
    }
}

const impl core::ops::Add<OpenUnitFraction> for DNonNegative {
    type Output = Self;

    /// Adds a fraction without overflowing the finite domain.
    ///
    /// Binary64 addition is monotone and round(MAX + 1) = MAX, where MAX is [`f64::MAX`]. The
    /// operands are bounded by MAX and one, and their rounded sum is at most MAX. Therefore
    /// adding an in-domain fraction remains finite and non-negative.
    #[inline]
    fn add(self, rhs: OpenUnitFraction) -> Self {
        Self(self.0 + rhs.get())
    }
}

const impl core::ops::AddAssign<OpenUnitFraction> for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: OpenUnitFraction) {
        self.0 += rhs.get();
    }
}

const impl core::ops::Add for DNonNegative {
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

const impl core::ops::AddAssign for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl core::ops::AddAssign<PositiveUnitFraction> for DNonNegative {
    /// Accumulates a positive unit fraction without overflowing.
    ///
    /// Monotone rounding bounds the sum by round(MAX + 1) = MAX, as for addition of an open unit
    /// fraction.
    #[inline]
    fn add_assign(&mut self, rhs: PositiveUnitFraction) {
        *self = *self + Self(rhs.get());
    }
}

const impl core::ops::Add<DPositive> for DNonNegative {
    type Output = DPositive;

    /// Adds a positive value, into the positive domain.
    ///
    /// The rounded sum must remain finite. Monotone rounding keeps it at least as large as the
    /// positive operand, but does not prevent overflow.
    #[inline]
    fn add(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.0 + rhs.get())
    }
}

const impl core::ops::Mul for DNonNegative {
    type Output = Derivation<Self>;

    /// Multiplies with deferred validation of overflow.
    ///
    /// For finite non-negative operands the product is never NaN or negative. The derivation
    /// carries overflow to positive infinity until its finish. Underflow rounds to zero, inside
    /// the target domain.
    #[inline]
    fn mul(self, rhs: Self) -> Derivation<Self> {
        Derivation::raw(self.0 * rhs.0)
    }
}

const impl core::ops::Mul<DPositive> for DNonNegative {
    type Output = Derivation<Self>;

    /// Multiplies by a positive factor with deferred validation.
    ///
    /// A zero operand gives zero. Finite products are non-negative, while overflow produces
    /// positive infinity in the derivation.
    #[inline]
    fn mul(self, rhs: DPositive) -> Derivation<Self> {
        Derivation::raw(self.0 * rhs.get())
    }
}

const impl core::ops::Div<DPositive> for DNonNegative {
    type Output = Derivation<Self>;

    /// Divides by a nonzero divisor with deferred validation of overflow.
    ///
    /// The divisor is never zero or NaN, and the numerator is finite and non-negative. Their
    /// quotient cannot be NaN or negative. A large numerator over a small divisor can overflow to
    /// positive infinity. Underflow rounds to zero, inside the target domain.
    #[inline]
    fn div(self, rhs: DPositive) -> Derivation<Self> {
        Derivation::raw(self.0 / rhs.get())
    }
}

const impl core::ops::Div for DNonNegative {
    type Output = Derivation<Self>;

    /// Divides with deferred validation of zero division and overflow.
    ///
    /// A zero divisor gives positive infinity for a positive numerator and NaN for zero. A positive
    /// divisor follows the range behavior of division by [`DPositive`]: overflow can produce
    /// infinity, while underflow produces an in-domain zero.
    #[inline]
    fn div(self, rhs: Self) -> Derivation<Self> {
        Derivation::raw(self.0 / rhs.0)
    }
}

const impl PartialEq<DPositive> for DNonNegative {
    #[inline]
    fn eq(&self, other: &DPositive) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DPositive> for DNonNegative {
    #[inline]
    fn partial_cmp(&self, other: &DPositive) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

impl serde::Serialize for DNonNegative {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DNonNegative {
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

const impl From<DPositive> for DNonNegative {
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

const impl From<NonNegative> for DNonNegative {
    #[inline]
    fn from(value: NonNegative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.get() as f64)
    }
}

const impl From<Positive> for DNonNegative {
    #[inline]
    fn from(value: Positive) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.get() as f64)
    }
}

const impl From<UnitFraction> for DNonNegative {
    #[inline]
    fn from(value: UnitFraction) -> Self {
        Self(value.get())
    }
}

const impl From<DNonNegative> for f64 {
    #[inline]
    fn from(value: DNonNegative) -> Self {
        value.0
    }
}

const impl core::ops::Mul<DNonNegative> for UnitFraction {
    type Output = DNonNegative;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> DNonNegative {
        // A fraction in [0, 1] cannot increase the magnitude of a nonnegative finite value. The
        // product remains finite and nonnegative without a check, with canonical +0.0 for a zero
        // product.
        DNonNegative(self.get() * rhs.0)
    }
}

const impl core::ops::Mul<DNonNegative> for OpenUnitFraction {
    type Output = DNonNegative;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> DNonNegative {
        // A fraction in (0, 1) cannot increase the magnitude of a nonnegative finite value. The
        // product remains finite and nonnegative without a check, with canonical +0.0 for a zero
        // product.
        DNonNegative(self.get() * rhs.0)
    }
}

raw_interop!(DNonNegative[f64]);
unsafe_impl_try_from_bytes!(DNonNegative[f64]);

#[cfg(test)]
impl Arbitrary for DNonNegative {
    type Parameters = ();

    type Strategy = impl proptest::strategy::Strategy<Value = Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        (num::f64::POSITIVE | num::f64::NORMAL | num::f64::SUBNORMAL | num::f64::ZERO)
            .prop_map(Self)
    }
}
