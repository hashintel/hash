//! The finite, strictly positive `f64` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{Positive, raw_interop, unsafe_impl_try_from_bytes};

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
