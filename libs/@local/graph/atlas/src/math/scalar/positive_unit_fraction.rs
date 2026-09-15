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
/// A literal outside the domain fails the build. Use [`PositiveUnitFraction::new`] to check runtime
/// values.
macro_rules! positive_unit_fraction {
    ($value:expr) => {
        const {
            $crate::math::PositiveUnitFraction::new($value)
                .expect("the literal lies inside (0, 1]")
        }
    };
}
pub(crate) use positive_unit_fraction;

/// A finite fraction in `(0, 1]`, valid by construction.
///
/// The half-open sibling of [`UnitFraction`], for factors that may preserve a magnitude but
/// must be greater than zero. Dividing by the fraction needs no zero-divisor check. A product
/// of positive operands is positive in exact arithmetic, but it can underflow to zero in
/// floating-point arithmetic.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{PositiveUnitFraction};
///
/// let share = PositiveUnitFraction::new(0.25).expect("0.25 lies inside (0, 1]");
/// assert_eq!(share.get(), 0.25);
///
/// // One is a factor, and zero is not.
/// assert!(PositiveUnitFraction::new(1.0).is_some());
/// assert_eq!(PositiveUnitFraction::new(0.0), None);
/// ```
#[derive(Debug, Copy, Clone, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
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
    /// For validating persisted bytes, this accepts exactly the values accepted by
    /// [`new`](Self::new). The domain excludes both zeros and preserves accepted values bit for
    /// bit.
    #[inline]
    #[must_use]
    pub const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
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
        // excluding both zeros makes in-domain values canonical without normalization
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
        // a unique bit pattern per value makes bit equality agree with numeric equality
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

const impl PartialEq<UnitFraction> for PositiveUnitFraction {
    #[inline]
    fn eq(&self, other: &UnitFraction) -> bool {
        // both domains use the same unique representation for each shared value
        self.get().to_bits() == other.get().to_bits()
    }
}

const impl PartialOrd<UnitFraction> for PositiveUnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &UnitFraction) -> Option<Ordering> {
        // strictly positive finite floats: the bit pattern is monotone in the value
        Some(self.get().to_bits().cmp(&other.get().to_bits()))
    }
}

impl Hash for PositiveUnitFraction {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // hashing the unique representation agrees with numeric equality
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Display for PositiveUnitFraction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl serde::Serialize for PositiveUnitFraction {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for PositiveUnitFraction {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a fraction in the half-open unit interval",
            )
        })
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
