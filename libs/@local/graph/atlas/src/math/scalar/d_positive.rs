//! The finite, strictly positive `f64` scalar.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
    num::NonZero,
};

use super::{
    DFinite, DNonNegative, OpenUnitFraction, Positive, PositiveUnitFraction, raw_interop,
    unsafe_impl_try_from_bytes,
};
use crate::math::Derivation;

/// Validates a positive double-precision literal at compile time.
///
/// A `const` block validates the literal with [`DPositive::new`] during compilation. A literal
/// outside the domain fails the build. Runtime values use the checked constructor.
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
/// Use [`Positive`] when the finite domain needs only single precision.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DPositive};
///
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
/// The domain excludes NaN and both zeros, giving every value one bit pattern without
/// canonicalization. [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow
/// numeric value.
#[derive(Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct DPositive(f64);

impl DPositive {
    /// The unit in the last place of one, `2⁻⁵²`.
    ///
    /// The spacing between one and the next larger `f64`, the unit a tolerance stated in ulps
    /// multiplies.
    pub(crate) const EPSILON: Self = Self::new(f64::EPSILON).unwrap();
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
    /// Every nonzero `u16` is strictly positive and exactly representable in `f64`. The conversion
    /// is total and requires no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u16(value: NonZero<u16>) -> Self {
        Self(value.get() as f64)
    }

    /// Converts a nonzero count, exactly.
    ///
    /// Every nonzero `u32` is strictly positive and exactly representable in `f64`. The conversion
    /// is total and requires no re-validation.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u32(value: NonZero<u32>) -> Self {
        Self(value.get() as f64)
    }

    /// Converts a nonzero count into the domain.
    ///
    /// Counts at or below 2⁵³ convert exactly, and a larger count rounds to the nearest
    /// representable value, staying finite and positive.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the rounding above 2^53 is this constructor's stated contract"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn from_usize(value: NonZero<usize>) -> Self {
        Self(value.get() as f64)
    }

    /// Returns whether `value`'s exact bits are a stored positive value.
    ///
    /// Accepted values retain their bits, and the domain excludes both zeros. This validates
    /// persisted bits exactly when [`new`](Self::new) accepts the corresponding value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // compare with the constructed value to account for normalization
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
    pub(crate) const fn new_unchecked<T>(value: T) -> Self
    where
        T: [const] Into<f64>,
    {
        let value = value.into();

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
    /// `710`.
    #[inline]
    #[must_use]
    pub(crate) fn ln(self) -> DFinite {
        DFinite::new_unchecked(self.0.ln())
    }

    /// Narrows to single precision, rejecting overflow and underflow to zero.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the checked narrowing is the operation"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn narrow(self) -> Option<Positive> {
        Positive::new(self.0 as f32)
    }

    /// Divides, refusing the escape.
    ///
    /// The quotient of positives is never NaN and never negative. Returns [`None`] exactly when
    /// the quotient leaves the domain, overflowing to positive infinity or underflowing to zero.
    /// The division operator instead carries that raw result in a [`Derivation`].
    #[inline]
    #[must_use]
    pub(crate) const fn checked_div(self, rhs: Self) -> Option<Self> {
        Self::new(self.0 / rhs.0)
    }
}

const impl PartialEq for DPositive {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // a unique bit pattern per value makes bit equality agree with numeric equality
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
        // hashing each value's unique bit pattern preserves agreement with `Eq`
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

const impl core::ops::Div<DPositive> for f64 {
    type Output = f64;

    /// Divides a raw reading by a finite nonzero divisor.
    ///
    /// The divisor is never zero or NaN. The quotient is NaN only for a NaN numerator. An infinite
    /// numerator or overflow of a finite quotient produces infinity.
    #[inline]
    fn div(self, rhs: DPositive) -> f64 {
        self / rhs.0
    }
}

const impl core::ops::DivAssign<DPositive> for f64 {
    #[inline]
    fn div_assign(&mut self, rhs: DPositive) {
        *self /= rhs.0;
    }
}

const impl core::ops::Sub for DPositive {
    type Output = DFinite;

    /// Subtracts, into the finite domain.
    ///
    /// The difference of two positive finite values has a magnitude that never exceeds the larger
    /// operand. The subtraction cannot overflow and requires no re-validation. Equal operands give
    /// `+0.0`.
    #[inline]
    fn sub(self, rhs: Self) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Div<DNonNegative> for DPositive {
    type Output = Derivation<DNonNegative>;

    #[inline]
    fn div(self, rhs: DNonNegative) -> Derivation<DNonNegative> {
        Derivation::raw(self.0 / rhs.get())
    }
}

const impl core::ops::Div<DPositive> for DPositive {
    type Output = Derivation<DPositive>;

    #[inline]
    fn div(self, rhs: DPositive) -> Derivation<DPositive> {
        Derivation::raw(self.0 / rhs.0)
    }
}

const impl core::ops::Mul<PositiveUnitFraction> for DPositive {
    type Output = Self;

    /// Scales by a positive fraction.
    ///
    /// The rounded product must remain positive. For in-domain operands it cannot exceed the
    /// positive value or become NaN, but underflow can round it to zero.
    #[inline]
    fn mul(self, rhs: PositiveUnitFraction) -> Self {
        Self::new_unchecked(self.0 * rhs.get())
    }
}

const impl core::ops::Mul<DPositive> for OpenUnitFraction {
    type Output = DPositive;

    /// Scales a positive value toward zero.
    ///
    /// The rounded product must remain positive. For in-domain operands it cannot exceed the
    /// positive value or become NaN. Rounding can leave the value unchanged or underflow to zero.
    #[inline]
    fn mul(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.get() * rhs.0)
    }
}

const impl core::ops::Mul for DPositive {
    type Output = Derivation<Self>;

    #[inline]
    fn mul(self, rhs: Self) -> Self::Output {
        Derivation::raw(self.0 * rhs.0)
    }
}

const impl From<DPositive> for f64 {
    #[inline]
    fn from(value: DPositive) -> Self {
        value.0
    }
}

const impl core::ops::Add<f64> for DPositive {
    type Output = f64;

    #[inline]
    fn add(self, rhs: f64) -> f64 {
        self.0 + rhs
    }
}

const impl PartialEq<DNonNegative> for DPositive {
    #[inline]
    fn eq(&self, other: &DNonNegative) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DNonNegative> for DPositive {
    #[inline]
    fn partial_cmp(&self, other: &DNonNegative) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

const impl PartialEq<OpenUnitFraction> for DPositive {
    #[inline]
    fn eq(&self, other: &OpenUnitFraction) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<OpenUnitFraction> for DPositive {
    #[inline]
    fn partial_cmp(&self, other: &OpenUnitFraction) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

const impl TryFrom<DNonNegative> for DPositive {
    type Error = NotPositive;

    #[inline]
    fn try_from(value: DNonNegative) -> Result<Self, Self::Error> {
        let value = value.get();
        Self::new(value).ok_or(NotPositive(value))
    }
}

const impl From<Positive> for DPositive {
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

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (f64::from_bits(1)..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DPositive {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DPositive {
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

#[cfg(test)]
mod tests {
    use super::DPositive;
    use crate::math::{Positive, positive};

    #[test]
    fn narrow_subnormal_bounds() {
        let smallest = Positive::MIN.widen();
        assert_eq!(smallest.narrow(), Some(Positive::MIN));
        assert_eq!(
            (smallest / d_positive!(2.0))
                .finish()
                .expect("the half-subnormal is representable in f64")
                .narrow(),
            None
        );
        assert_eq!(
            DPositive::new(smallest.get() * 0.75)
                .expect("the value is positive")
                .narrow(),
            Some(Positive::MIN)
        );
    }

    #[test]
    fn narrow_overflow() {
        assert_eq!(Positive::MAX.widen().narrow(), Some(Positive::MAX));
        assert_eq!(
            (Positive::MAX.widen() * d_positive!(2.0))
                .finish()
                .expect("twice the f32 maximum is finite in f64")
                .narrow(),
            None
        );
        assert_eq!(d_positive!(1.5).narrow(), Some(positive!(1.5)));
    }
}
