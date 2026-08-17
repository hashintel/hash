//! The finite, strictly positive `f64` scalar.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
    num::NonZero,
};

use super::{
    DFinite, DNonNegative, GreaterThanOne, OpenUnitFraction, Positive, PositiveUnitFraction,
    raw_interop, unsafe_impl_try_from_bytes,
};

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

/// The rejected value of a failed [`DPositive`] narrowing.
///
/// [`TryFrom`] returns this error where [`DPositive::new`] returns [`None`]. For a
/// [`DNonNegative`] source the only such value is zero.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct NotPositive(pub f64);

impl fmt::Display for NotPositive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{} is not strictly positive", self.0)
    }
}

impl Error for NotPositive {}

/// A finite, strictly positive `f64`, valid by construction.
///
/// The double-precision twin of [`Positive`], named as [`DVecN`](crate::math::DVecN) is to
/// [`VecN`](crate::math::VecN): configuration fields that steer double-precision arithmetic
/// carry their domain in the type, and the consuming site validates nothing.
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

    /// Converts a nonzero count, exactly.
    ///
    /// Every nonzero `u16` is strictly positive and far inside `f64`'s exact-integer range, so
    /// the conversion is total and no re-validation happens.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u16(value: NonZero<u16>) -> Self {
        Self(value.get() as f64)
    }

    /// Converts a nonzero count, exactly.
    ///
    /// Every nonzero `u32` is strictly positive and inside `f64`'s exact-integer range, so the
    /// conversion is total and no re-validation happens.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u32(value: NonZero<u32>) -> Self {
        Self(value.get() as f64)
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

    /// Returns the natural logarithm.
    ///
    /// The logarithm of a positive value is never NaN and always finite, because the smallest
    /// positive subnormal's logarithm is only about `-745` and the largest finite value's about
    /// `710`. The sign is the reading, so the result carries finiteness alone.
    #[inline]
    #[must_use]
    pub(crate) fn ln(self) -> DFinite {
        DFinite::new_unchecked(self.0.ln())
    }

    /// Fuses a multiply-add `self · factor + addend` with one rounding.
    ///
    /// The fused product of a positive value and a non-negative factor is non-negative, and the
    /// positive addend keeps the sum positive - rounding is monotone, so it never rounds below
    /// the addend's magnitude class. Overflow escapes to `+∞` - a wrong reading rather than a
    /// soundness break, since no unsafe code trusts the domain - and asserts in debug builds
    /// through the constructor.
    #[inline]
    #[must_use]
    pub(crate) const fn mul_add(self, factor: DNonNegative, addend: Self) -> Self {
        Self::new_unchecked(self.0.mul_add(factor.get(), addend.0))
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

impl fmt::LowerExp for DPositive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::LowerExp::fmt(&self.0, fmt)
    }
}

impl fmt::Display for DPositive {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl core::ops::Mul for DPositive {
    type Output = Self;

    /// Multiplies.
    ///
    /// A product of positives is never NaN and never negative. Overflow escapes to `+∞` and
    /// underflow to zero - each a wrong reading rather than a soundness break, since no unsafe
    /// code trusts the domain - and each asserts in debug builds through the constructor.
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Self::new_unchecked(self.0 * rhs.0)
    }
}

const impl core::ops::Div<DPositive> for f64 {
    type Output = f64;

    /// Divides a double-precision measurement by the positive value, staying in `f64`.
    ///
    /// The divisor is never zero and never NaN, so a NaN or infinite quotient arrives only
    /// through the numerator.
    #[inline]
    fn div(self, rhs: DPositive) -> f64 {
        self / rhs.0
    }
}

const impl core::ops::Div for DPositive {
    type Output = DPositive;

    /// Divides.
    ///
    /// A quotient of positives is never NaN and never negative. Overflow escapes to `+∞` and
    /// underflow to zero - each a wrong reading rather than a soundness break, since no unsafe
    /// code trusts the domain - and each asserts in debug builds through the constructor.
    #[inline]
    fn div(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.0 / rhs.0)
    }
}

const impl core::ops::Mul<PositiveUnitFraction> for DPositive {
    type Output = Self;

    /// Scales by a positive fraction.
    ///
    /// The product of a positive value and a fraction in `(0, 1]` is positive, at most the
    /// value, and never NaN, so overflow cannot occur. Underflow escapes to zero - a wrong
    /// reading rather than a soundness break, since no unsafe code trusts the domain - and
    /// asserts in debug builds through the constructor.
    #[inline]
    fn mul(self, rhs: PositiveUnitFraction) -> Self {
        Self::new_unchecked(self.0 * rhs.get())
    }
}

const impl core::ops::Mul<DPositive> for OpenUnitFraction {
    type Output = DPositive;

    /// Scales a positive value toward zero.
    ///
    /// The product of a positive value and a fraction in `(0, 1)` is less than the value and
    /// never NaN, so overflow cannot occur. Underflow escapes to zero - a wrong reading rather
    /// than a soundness break, since no unsafe code trusts the domain - and asserts in debug
    /// builds through the constructor.
    #[inline]
    fn mul(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.get() * rhs.0)
    }
}

const impl core::ops::Mul<DPositive> for GreaterThanOne {
    type Output = DPositive;

    /// Grows a positive value.
    ///
    /// The product of a positive value and a factor above one is positive, at least the value,
    /// and never NaN. Overflow escapes to `+∞` - a wrong reading rather than a soundness break,
    /// since no unsafe code trusts the domain - and asserts in debug builds through the
    /// constructor.
    #[inline]
    fn mul(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.get() * rhs.0)
    }
}

const impl From<DPositive> for f64 {
    /// Reads the value, exactly.
    #[inline]
    fn from(value: DPositive) -> Self {
        value.0
    }
}

const impl core::ops::Add<f64> for DPositive {
    type Output = f64;

    /// Adds a raw offset.
    ///
    /// The raw operand is arbitrary, so the sum can leave any bounded domain and returns a raw
    /// float.
    #[inline]
    fn add(self, rhs: f64) -> f64 {
        self.0 + rhs
    }
}

const impl PartialEq<DNonNegative> for DPositive {
    /// Compares across the scalar family, in one precision with no widening.
    #[inline]
    fn eq(&self, other: &DNonNegative) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DNonNegative> for DPositive {
    /// Orders across the scalar family, in one precision with no widening.
    #[inline]
    fn partial_cmp(&self, other: &DNonNegative) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

const impl PartialEq<OpenUnitFraction> for DPositive {
    /// Compares across the scalar family, in one precision with no widening.
    #[inline]
    fn eq(&self, other: &OpenUnitFraction) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<OpenUnitFraction> for DPositive {
    /// Orders across the scalar family, in one precision with no widening.
    #[inline]
    fn partial_cmp(&self, other: &OpenUnitFraction) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

const impl TryFrom<DNonNegative> for DPositive {
    type Error = NotPositive;

    /// Narrows from the enclosing domain, refusing exactly zero.
    #[inline]
    fn try_from(value: DNonNegative) -> Result<Self, Self::Error> {
        let value = value.get();
        Self::new(value).ok_or(NotPositive(value))
    }
}

const impl From<Positive> for DPositive {
    /// Widens into double precision, exactly.
    ///
    /// Every positive `f32` denotes a positive, finite `f64`, so no re-validation happens.
    #[inline]
    fn from(value: Positive) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.get() as f64)
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

raw_interop!(DPositive[f64]);
unsafe_impl_try_from_bytes!(DPositive[f64]);
