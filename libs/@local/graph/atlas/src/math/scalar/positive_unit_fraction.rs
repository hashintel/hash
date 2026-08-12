//! The half-open unit-interval fraction.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
    ops::Mul,
};

use super::{UnitFraction, raw_interop, unsafe_impl_try_from_bytes};

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

/// A finite fraction in `(0, 1]`, valid by construction.
///
/// The half-open sibling of [`UnitFraction`], for factors whose lower endpoint alone degenerates:
/// a factor of zero silences whatever mass it scales, while a factor of one leaves it whole and
/// keeps its effect. The exclusion rides in the type, so dividing by the fraction needs no zero
/// check at the use site, and a product with the fraction vanishes only when the other operand
/// does.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value, so
/// fractions sort and key ordered maps with no NaN case.
///
/// # Examples
///
/// ```ignore
/// let share = PositiveUnitFraction::new(0.25).expect("0.25 lies inside (0, 1]");
/// assert_eq!(share.get(), 0.25);
///
/// // One is a factor, and zero is not.
/// assert!(PositiveUnitFraction::new(1.0).is_some());
/// assert_eq!(PositiveUnitFraction::new(0.0), None);
/// ```
#[derive(Debug, Copy, Clone, zerocopy::Immutable)]
#[repr(transparent)]
pub struct PositiveUnitFraction(f64);

impl PositiveUnitFraction {
    /// The fraction one, the identity factor.
    pub const ONE: Self = Self(1.0);

    /// Validates a fraction in the half-open unit interval.
    ///
    /// Returns [`None`] outside `(0, 1]`: zero of either sign is refused, one is admitted, and
    /// NaN fails both bounds.
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if value > 0.0 && value <= 1.0 {
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

    /// Creates a fraction from a value the caller proves lies in `(0, 1]`.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong fraction
    // rather than UB.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value > 0.0 && value <= 1.0,
            "the caller promised a value inside (0, 1]",
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
}

const impl PartialEq for PositiveUnitFraction {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for PositiveUnitFraction {}

const impl PartialOrd for PositiveUnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for PositiveUnitFraction {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // strictly positive finite floats: the bit pattern is monotone in the value
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for PositiveUnitFraction {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // canonical bits: equal fractions share one bit pattern, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Display for PositiveUnitFraction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl From<PositiveUnitFraction> for f64 {
    #[inline]
    fn from(value: PositiveUnitFraction) -> Self {
        value.get()
    }
}

const impl Mul<UnitFraction> for PositiveUnitFraction {
    type Output = UnitFraction;

    /// Multiplies a half-open fraction by a closed one, mirroring the closed-side product.
    #[inline]
    fn mul(self, rhs: UnitFraction) -> UnitFraction {
        rhs * self
    }
}

raw_interop!(PositiveUnitFraction[f64]);
unsafe_impl_try_from_bytes!(PositiveUnitFraction[f64]);
