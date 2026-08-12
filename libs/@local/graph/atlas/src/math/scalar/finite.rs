//! Finiteness-only guards that carry their domain in the type.
//!
//! [`Finite`] holds a finite `f32` and [`DFinite`] a finite `f64`, for quantities whose contract
//! is that they denote a real number and nothing further. Validation happens once, at
//! construction - refusal ([`new`](DFinite::new)), a caller's proof
//! ([`new_unchecked`](DFinite::new_unchecked)), or a widening conversion from a narrower domain -
//! so a value that exists is finite and consuming code trusts the domain instead of re-checking
//! it.
//!
//! Comparing, sorting and hashing a [`DFinite`] need no NaN case: [`Eq`], [`Ord`] and [`Hash`]
//! are total, agree with one another, and follow the IEEE total order restricted to the finite
//! values. Both zeros are admitted and keep their sign bit, so under that order `-0.0` and
//! `+0.0` are distinct readings with `-0.0 < +0.0`, and a reading round-trips bit for bit.
//!
//! Arithmetic whose result provably stays finite stays in the type - negation, integer
//! conversion - with no run-time re-check. An operation that can leave the domain returns a
//! raw float instead, with the sum of two arbitrary finite values the plain case. The caller
//! re-enters through a constructor at whichever boundary proves the bound. Serialization writes
//! plain numbers and deserialization re-validates, so a persisted value is as trustworthy as a
//! constructed one.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{DNonNegative, DPositive, NonNegative, Positive, unsafe_impl_try_from_bytes};

/// Validates a finite literal at compile time.
///
/// The expansion is a `const` block over [`Finite::new`], so a literal outside the domain fails the
/// build instead of a test run. Runtime values keep the checked constructor.
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
/// The expansion is a `const` block over [`DFinite::new`], so a literal outside the domain fails
/// the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! d_finite {
    ($value:expr) => {
        const { $crate::math::DFinite::new($value).expect("the literal is finite") }
    };
}
#[cfg(test)]
pub(crate) use d_finite;

/// A finite `f32`, valid by construction.
///
/// A value that exists is finite, so the domain check lives at the constructor and nowhere
/// else. Quantities with a sign or interval bound on top of finiteness take the narrower
/// [`Positive`], [`NonNegative`], or [`UnitFraction`](super::UnitFraction) instead, which
/// states that bound in the same place.
///
/// Both zeros are admitted and keep their sign bit. The value serializes as a plain number, so
/// a format whose number grammar covers exactly the finite values represents every inhabitant
/// of this type and reads it back through the same validation.
///
/// # Examples
///
/// ```ignore
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
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: accepted
    /// values store bit for bit, both zeros included, so the bits are valid exactly when
    /// [`new`](Self::new) accepts the value.
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
    /// Widens into the enclosing domain: every positive value is finite.
    #[inline]
    fn from(value: Positive) -> Self {
        Self(value.get())
    }
}

const impl From<NonNegative> for Finite {
    /// Widens into the enclosing domain: every non-negative value is finite.
    #[inline]
    fn from(value: NonNegative) -> Self {
        Self(value.get())
    }
}

const impl core::ops::Div<Positive> for Finite {
    type Output = f32;

    /// Divides by a positive divisor, which is never zero.
    ///
    /// The result is a raw float: the quotient of a finite value by a small positive one can
    /// overflow to either infinity, following the numerator's sign. It is never NaN: that
    /// would take a zero or infinite operand, and both domains exclude them. The caller
    /// re-enters a domain at whichever boundary proves its bound.
    #[inline]
    fn div(self, rhs: Positive) -> f32 {
        self.0 / rhs.get()
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for Finite {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, both signs and subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (-f32::MAX..=f32::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for Finite {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Finite {
    /// Deserializes a plain number, refusing NaN and the infinities.
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
/// Both zeros are admitted and keep their sign bit. The value serializes as a plain number, so
/// a format whose number grammar covers exactly the finite values represents every inhabitant
/// of this type and reads it back through the same validation.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow the IEEE total
/// order restricted to the finite values. Values sort and key ordered maps like the numbers
/// they hold, with one caveat the sign bit brings: `-0.0` and `+0.0` are distinct, and
/// `-0.0 < +0.0`.
///
/// # Examples
///
/// ```ignore
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
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: accepted
    /// values store bit for bit, both zeros included, so the bits are valid exactly when
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

    /// Creates a value the caller proves finite.
    ///
    /// The sign bit of a promised zero is kept. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    ///
    /// # Examples
    ///
    /// ```ignore
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

    /// Returns the total-order key: a bit pattern monotone in the value.
    ///
    /// Flipping a negative value's bits and setting a non-negative value's sign bit maps the
    /// IEEE ordering onto unsigned integer order, so one integer compare decides every pair
    /// with no NaN branch.
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
    /// Widens into the enclosing domain: every positive value is finite.
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

const impl From<DNonNegative> for DFinite {
    /// Widens into the enclosing domain: every non-negative value is finite.
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
        // one bit pattern per finite value, so bit equality is total-order equality
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
        // one bit pattern per finite value, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for DFinite {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, both signs and subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (-f64::MAX..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DFinite {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DFinite {
    /// Deserializes a plain number, refusing NaN and the infinities.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(serde::de::Unexpected::Float(value), &"a finite number")
        })
    }
}

unsafe_impl_try_from_bytes!(Finite[f32], DFinite[f64]);
