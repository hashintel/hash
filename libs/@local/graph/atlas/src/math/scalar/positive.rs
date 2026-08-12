//! The finite, strictly positive `f32` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{raw_interop, unsafe_impl_try_from_bytes};

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

raw_interop!(Positive[f32]);
unsafe_impl_try_from_bytes!(Positive[f32]);
