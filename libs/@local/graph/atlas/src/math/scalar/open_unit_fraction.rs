//! The open unit-interval fraction.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
};

use super::{DPositive, UnitFraction, raw_interop, unsafe_impl_try_from_bytes};

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

/// The rejected value of a failed [`OpenUnitFraction`] conversion.
///
/// [`TryFrom`] returns this error where [`OpenUnitFraction::new`] returns [`None`] - the value lies
/// outside `(0, 1)` or is NaN. The error carries the rejected value and displays it together with
/// the expected interval.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NotInOpenUnitInterval(pub f64);

impl fmt::Display for NotInOpenUnitInterval {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{} is not a fraction in (0, 1)", self.0)
    }
}

impl Error for NotInOpenUnitInterval {}

/// A fraction strictly between zero and one, valid by construction.
///
/// The open-interval sibling of [`UnitFraction`], for parameters whose semantics degenerate at an
/// endpoint. A contraction factor of zero collapses whatever it scales, and a factor of one
/// never contracts, so an acceptance threshold at either end stops being a threshold. The
/// exclusion rides in the type: division by a fraction needs no zero check, and its logarithm
/// needs no domain check. A strict comparison against either endpoint still divides the domain
/// in two.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value, so
/// fractions sort and key ordered maps with no NaN case.
///
/// # Examples
///
/// ```ignore
/// let shrink = OpenUnitFraction::new(0.25).expect("a quarter contracts");
/// assert_eq!(shrink.get(), 0.25);
///
/// // Both endpoints lie outside the domain.
/// assert_eq!(OpenUnitFraction::new(0.0), None);
/// assert_eq!(OpenUnitFraction::new(1.0), None);
/// ```
#[derive(Debug, Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub struct OpenUnitFraction(f64);

impl OpenUnitFraction {
    /// Validates a fraction strictly inside the unit interval.
    ///
    /// Returns [`None`] outside `(0, 1)`: both endpoints are refused, NaN fails both bounds, and
    /// `-0.0` fails strict positivity.
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if value > 0.0 && value < 1.0 {
            Some(Self(value))
        } else {
            None
        }
    }

    /// Returns whether `value`'s exact bits are a stored fraction.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the domain
    /// holds no zero of either sign and accepted values store bit for bit, so the bits are
    /// valid exactly when [`new`](Self::new) accepts the value.
    #[inline]
    #[must_use]
    pub const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // Compare against what construction stored, so the check follows any future
            // normalization.
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Creates a fraction from a value the caller proves lies in `(0, 1)`.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong fraction
    // rather than UB.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value > 0.0 && value < 1.0,
            "the caller promised a value strictly inside (0, 1)",
        );
        // No normalization: the promised domain contains no zero of either sign, so a kept
        // promise is already canonical.
        Self(value)
    }

    /// Returns the fraction.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }

    /// Returns the complement `1 − self`, widened to [`UnitFraction`].
    ///
    /// The result can be exactly one, because `1 − x` rounds to `1.0` for every `x ≤ 2⁻⁵⁴`, so
    /// the complement of an open fraction lives in the closed type. It is never zero, bottoming
    /// out at `2⁻⁵³`, the complement of the largest fraction below one.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let kept = OpenUnitFraction::new(0.75).expect("0.75 lies inside (0, 1)");
    /// assert_eq!(
    ///     kept.complement(),
    ///     UnitFraction::new(0.25).expect("the complement is exact")
    /// );
    ///
    /// // A tiny fraction complements to exactly one - the open interval cannot hold the result.
    /// let sliver = OpenUnitFraction::new(1e-300).expect("1e-300 lies inside (0, 1)");
    /// assert_eq!(sliver.complement(), UnitFraction::ONE);
    /// ```
    #[inline]
    #[must_use]
    pub const fn complement(self) -> UnitFraction {
        // In range with no check: the real result lies in (0, 1) and rounding cannot escape
        // [0, 1]. Near one the subtraction is exact by Sterbenz, so the result is at least 2⁻⁵³;
        // a positive result needs no sign normalization.
        UnitFraction::new_unchecked(1.0 - self.0)
    }

    /// Computes `ln(1 - self)` without forming the rounded difference.
    ///
    /// Evaluates as `ln_1p(-self)`, which keeps relative precision where the fraction lies
    /// close to one and `1.0 - self` would round away everything the logarithm reads. The open
    /// interval excludes both endpoints, so the result is strictly negative and finite.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let confidence = OpenUnitFraction::new(0.999).expect("0.999 lies inside (0, 1)");
    /// assert!((confidence.ln_complement() - 0.001_f64.ln()).abs() < 1e-12);
    /// ```
    #[inline]
    #[must_use]
    pub fn ln_complement(self) -> f64 {
        (-self.0).ln_1p()
    }
}

const impl PartialEq for OpenUnitFraction {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for OpenUnitFraction {}

const impl PartialOrd for OpenUnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for OpenUnitFraction {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // strictly positive finite floats: the bit pattern is monotone in the value
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for OpenUnitFraction {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // canonical bits: equal fractions share one bit pattern, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Display for OpenUnitFraction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl TryFrom<UnitFraction> for OpenUnitFraction {
    type Error = NotInOpenUnitInterval;

    /// Narrows, rejecting both endpoints.
    #[inline]
    fn try_from(value: UnitFraction) -> Result<Self, Self::Error> {
        let raw = value.get();

        Self::new(raw).ok_or(NotInOpenUnitInterval(raw))
    }
}

const impl From<OpenUnitFraction> for f64 {
    #[inline]
    fn from(value: OpenUnitFraction) -> Self {
        value.get()
    }
}

const impl TryFrom<f64> for OpenUnitFraction {
    type Error = NotInOpenUnitInterval;

    /// Validates as [`OpenUnitFraction::new`] does, carrying the rejected value in the error.
    #[inline]
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(NotInOpenUnitInterval(value))
    }
}

const impl PartialEq<DPositive> for OpenUnitFraction {
    /// Compares across the scalar family, in one precision with no widening.
    #[inline]
    fn eq(&self, other: &DPositive) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DPositive> for OpenUnitFraction {
    /// Orders across the scalar family, in one precision with no widening.
    #[inline]
    fn partial_cmp(&self, other: &DPositive) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

#[cfg(test)]
#[expect(
    exported_private_dependencies,
    reason = "the impl exists only in test builds, which no downstream consumer compiles"
)]
impl proptest::arbitrary::Arbitrary for OpenUnitFraction {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole open interval: the range starts at the smallest positive value and
    /// excludes one.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (f64::from_bits(1)..1.0)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for OpenUnitFraction {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for OpenUnitFraction {
    /// Deserializes a plain number, refusing values outside the open unit interval.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a fraction in the open unit interval",
            )
        })
    }
}

raw_interop!(OpenUnitFraction[f64]);
unsafe_impl_try_from_bytes!(OpenUnitFraction[f64]);
