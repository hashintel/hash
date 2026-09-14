//! Finiteness-only guards that carry their domain in the type.
//!
//! [`Finite`] holds a finite `f32` and [`DFinite`] a finite `f64`, for quantities whose contract
//! is that they denote a real number and nothing further. Checked constructors such as
//! [`DFinite::new`] validate raw inputs. Unchecked constructors such as
//! [`DFinite::new_unchecked`] require a caller's proof, while widening conversions preserve a
//! narrower source domain's finiteness.
//!
//! Comparing, sorting and hashing a [`DFinite`] need no NaN case: [`Eq`], [`Ord`] and [`Hash`] are
//! total, agree with one another, and follow the IEEE total order restricted to finite values. Both
//! zeros are admitted with their sign bits intact. Under this order, `-0.0` and `+0.0` are distinct
//! readings with `-0.0 < +0.0`. A reading round-trips bit for bit.
//!
//! Negation and integer conversion preserve finiteness. Other operations may return a raw
//! float or [`Derivation`] for later validation. The `DFinite` sum and difference return the
//! domain type and require a finite rounded result. Serialization writes plain numbers and
//! deserialization validates them again.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{
    DNonNegative, DPositive, NonNegative, OpenUnitFraction, Positive, narrow_f32, raw_interop,
    unsafe_impl_try_from_bytes,
};
use crate::math::Derivation;

/// Validates a finite literal at compile time.
///
/// A `const` block validates the literal with [`Finite::new`] during compilation. A literal outside
/// the domain fails the build. Runtime values use the checked constructor.
#[cfg(test)]
macro_rules! finite {
    ($value:expr) => {
        const { $crate::math::Finite::new($value).expect("the literal is finite") }
    };
}
#[cfg(test)]
pub(crate) use finite;

/// Validates a finite double-precision literal at compile time.
///
/// A `const` block validates the literal with [`DFinite::new`] during compilation. A literal
/// outside the domain fails the build. Runtime values use the checked constructor.
macro_rules! d_finite {
    ($value:expr) => {
        const { $crate::math::DFinite::new($value).expect("the literal is finite") }
    };
}
pub(crate) use d_finite;

/// A finite `f32`, valid by construction.
///
/// Finiteness is the construction invariant. Quantities with an additional sign or interval bound
/// take the narrower [`Positive`], [`NonNegative`], or [`UnitFraction`](super::UnitFraction), which
/// states that bound too.
///
/// Both zeros are admitted with their sign bits intact. Serialization writes plain numbers. A
/// format whose number grammar covers exactly the finite values represents every inhabitant of this
/// type and reads it back through the same validation.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{Finite};
///
/// assert_eq!(Finite::new(-2.5).expect("-2.5 is finite").get(), -2.5);
/// assert_eq!(
///     Finite::new(f32::MIN).expect("the minimum is finite").get(),
///     f32::MIN
/// );
///
/// assert_eq!(Finite::new(f32::NAN), None);
/// assert_eq!(Finite::new(f32::INFINITY), None);
/// assert_eq!(Finite::new(f32::NEG_INFINITY), None);
/// ```
#[derive(Copy, Clone, PartialEq, PartialOrd, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct Finite(f32);

impl Finite {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a finite value.
    ///
    /// Returns [`None`] for NaN and for both infinities, and admits every other value of the
    /// type, including both zeros and either extreme.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !value.is_finite() {
            return None;
        }

        Some(Self(value))
    }

    /// Returns whether `value`'s exact bits are a stored finite value.
    ///
    /// Accepted values retain their bits, including both zeros. Persisted bits are valid exactly
    /// when [`new`](Self::new) accepts the corresponding value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f32) -> bool {
        match Self::new(value) {
            // compare with the constructed value to account for normalization
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Returns the absolute value.
    ///
    /// The magnitude of a finite value is finite and non-negative, with no re-validation, and
    /// the magnitude of either zero is the canonical `+0.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn abs(self) -> NonNegative {
        NonNegative::new_unchecked(self.0.abs())
    }

    /// Creates a value the caller proves finite.
    ///
    /// The sign bit of a promised zero is kept. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts finiteness, a broken promise yields a wrong reading
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f32) -> Self {
        debug_assert!(value.is_finite(), "the caller promised a finite value");

        Self(value)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }
}

impl fmt::Debug for Finite {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for Finite {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl From<Positive> for Finite {
    #[inline]
    fn from(value: Positive) -> Self {
        Self(value.get())
    }
}

const impl From<NonNegative> for Finite {
    #[inline]
    fn from(value: NonNegative) -> Self {
        Self(value.get())
    }
}

const impl From<Finite> for f64 {
    #[inline]
    fn from(value: Finite) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        value.0 as f64
    }
}

const impl core::ops::Neg for Finite {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self(-self.0)
    }
}

const impl<T> core::ops::Mul<T> for Finite
where
    T: [const] Into<Finite>,
{
    type Output = Derivation<Self>;

    #[inline]
    fn mul(self, rhs: T) -> Self::Output {
        Derivation::raw(self.0 * rhs.into().0)
    }
}

const impl core::ops::Div<Positive> for Finite {
    type Output = Derivation<Self>;

    /// Divides by a nonzero divisor with deferred validation of overflow.
    #[inline]
    fn div(self, rhs: Positive) -> Self::Output {
        Derivation::raw(self.0 / rhs.get())
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for Finite {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (-f32::MAX..=f32::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for Finite {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Finite {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f32::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(f64::from(value)),
                &"a finite number",
            )
        })
    }
}

/// A finite `f64`, valid by construction.
///
/// The double-precision twin of [`Finite`], for a quantity whose contract is that it denotes a
/// real number and nothing further. A quantity that also has a sign or interval bound carries
/// the narrower [`DPositive`], [`DNonNegative`], or [`UnitFraction`](super::UnitFraction).
///
/// Both zeros are admitted with their sign bits intact. Serialization writes plain numbers. A
/// format whose number grammar covers exactly the finite values represents every inhabitant of this
/// type and reads it back through the same validation.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow the IEEE total
/// order restricted to the finite values. Values sort and key ordered maps like the numbers
/// they hold, with one caveat the sign bit brings: `-0.0` and `+0.0` are distinct, and
/// `-0.0 < +0.0`.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DFinite};
///
/// assert_eq!(
///     DFinite::new(-1.0e-300)
///         .expect("a tiny negative is finite")
///         .get(),
///     -1.0e-300
/// );
///
/// assert_eq!(DFinite::new(f64::NAN), None);
/// assert_eq!(DFinite::new(f64::INFINITY), None);
/// assert_eq!(DFinite::new(f64::NEG_INFINITY), None);
/// ```
#[derive(Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub(crate) struct DFinite(f64);

impl DFinite {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a finite value.
    ///
    /// Returns [`None`] for NaN and for both infinities, and admits every other value of the
    /// type, including both zeros and either extreme.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !value.is_finite() {
            return None;
        }

        Some(Self(value))
    }

    /// Returns whether `value`'s exact bits are a stored finite value.
    ///
    /// Accepted values retain their bits, including both zeros. Persisted bits are valid exactly
    /// when [`new`](Self::new) accepts the corresponding value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // compare with the constructed value to account for normalization
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Creates a value the caller proves finite.
    ///
    /// The sign bit of a promised zero is kept. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{DFinite};
    ///
    /// let span = DFinite::new(3.0).expect("3.0 is finite");
    /// // A mean of finite values bounded far inside the exponent range cannot overflow.
    /// let mean = DFinite::new_unchecked((span.get() + span.get()) / 2.0);
    /// assert_eq!(mean.get(), 3.0);
    /// ```
    // Not `unsafe`: no unsafe code trusts finiteness, a broken promise yields a wrong reading
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f64) -> Self {
        debug_assert!(value.is_finite(), "the caller promised a finite value");

        Self(value)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }

    /// Returns the absolute value.
    ///
    /// The magnitude of a finite value is finite and non-negative, with no re-validation, and
    /// the magnitude of either zero is the canonical `+0.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn abs(self) -> DNonNegative {
        DNonNegative::new_unchecked(self.0.abs())
    }

    /// Narrows to the strictly positive domain.
    ///
    /// Returns [`None`] at zero and below.
    #[inline]
    #[must_use]
    pub(crate) const fn positive(self) -> Option<DPositive> {
        DPositive::new(self.0)
    }

    /// Narrows to working precision, refusing the overflow window.
    ///
    /// Converts with round-to-nearest and returns [`None`] where the rounded value overflows to
    /// `±∞`.
    #[inline]
    #[must_use]
    pub(crate) const fn narrow(self) -> Option<Finite> {
        match narrow_f32(self.0) {
            Some(narrowed) => Some(Finite::new_unchecked(narrowed)),
            None => None,
        }
    }

    /// Returns the total-order key: a bit pattern monotone in the value.
    ///
    /// Flipping a negative value's bits and setting a nonnegative value's sign bit maps IEEE
    /// ordering onto unsigned integer order for one integer comparison of every pair, without a NaN
    /// branch.
    #[inline]
    const fn order_key(self) -> u64 {
        let bits = self.0.to_bits();
        if bits >> 63 == 1 {
            !bits
        } else {
            bits | (1 << 63)
        }
    }
}

impl fmt::Debug for DFinite {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for DFinite {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl From<DFinite> for f64 {
    #[inline]
    fn from(value: DFinite) -> Self {
        value.0
    }
}

const impl From<DPositive> for DFinite {
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

const impl From<DNonNegative> for DFinite {
    #[inline]
    fn from(value: DNonNegative) -> Self {
        Self(value.get())
    }
}

const impl From<i64> for DFinite {
    /// Converts an integer, which is always finite.
    ///
    /// Magnitudes up to 2⁵³ convert exactly, and above that the conversion rounds to the
    /// nearest representable value with the `as` cast's own rounding. Every result stays
    /// finite because the whole `i64` range sits far inside the `f64` exponent range.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the cast is the operation, and the documented contract states the rounding"
    )]
    #[inline]
    fn from(value: i64) -> Self {
        Self(value as f64)
    }
}

const impl PartialEq for DFinite {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // unique finite total-order encodings make bit equality equivalent to total-order equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for DFinite {}

const impl PartialOrd for DFinite {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for DFinite {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.order_key().cmp(&other.order_key())
    }
}

impl Hash for DFinite {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing each finite total-order value's unique bit pattern preserves agreement with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

const impl core::ops::Add for DFinite {
    type Output = DFinite;

    /// Adds.
    ///
    /// The rounded sum must remain finite. Same-sign operands can overflow to infinity.
    #[inline]
    fn add(self, rhs: DFinite) -> DFinite {
        DFinite::new_unchecked(self.0 + rhs.0)
    }
}

const impl core::ops::AddAssign for DFinite {
    #[inline]
    fn add_assign(&mut self, rhs: DFinite) {
        *self = *self + rhs;
    }
}

const impl core::ops::Sub for DFinite {
    type Output = DFinite;

    /// Subtracts.
    ///
    /// The rounded difference must remain finite. Opposite-sign operands can overflow to infinity.
    #[inline]
    fn sub(self, rhs: DFinite) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Neg for DFinite {
    type Output = Self;

    /// Negates, exactly.
    ///
    /// The negation of a finite value is finite, with no re-validation.
    #[inline]
    fn neg(self) -> Self {
        Self(-self.0)
    }
}

const impl core::ops::Div<DPositive> for DFinite {
    type Output = Derivation<DFinite>;

    /// Divides by a positive divisor, which is never zero.
    ///
    /// Dividing a finite value by a small positive one can overflow to either infinity, following
    /// the numerator's sign. The derivation validates finiteness at its finish. The quotient is
    /// never NaN for in-domain operands: both are finite and the divisor is nonzero. A zero
    /// numerator is valid.
    #[inline]
    fn div(self, rhs: DPositive) -> Derivation<DFinite> {
        Derivation::raw(self.0 / rhs.get())
    }
}

const impl<T> core::ops::Mul<T> for DFinite
where
    T: [const] Into<DFinite>,
{
    type Output = Derivation<DFinite>;

    #[inline]
    fn mul(self, rhs: T) -> Derivation<DFinite> {
        Derivation::raw(self.0 * rhs.into().0)
    }
}

const impl PartialEq<OpenUnitFraction> for DFinite {
    #[inline]
    fn eq(&self, other: &OpenUnitFraction) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<OpenUnitFraction> for DFinite {
    #[inline]
    fn partial_cmp(&self, other: &OpenUnitFraction) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for DFinite {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (-f64::MAX..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DFinite {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DFinite {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(serde::de::Unexpected::Float(value), &"a finite number")
        })
    }
}

raw_interop!(Finite[f32], DFinite[f64]);
unsafe_impl_try_from_bytes!(Finite[f32], DFinite[f64]);
