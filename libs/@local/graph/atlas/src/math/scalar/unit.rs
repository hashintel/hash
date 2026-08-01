//! Unit-interval fractions that carry their domain in the type.
//!
//! [`UnitFraction`] holds a finite `f64` in `[0, 1]`; [`OpenUnitFraction`] holds one strictly
//! inside `(0, 1)`. Validation happens once, at construction - refusal
//! ([`new`](UnitFraction::new)), saturation ([`new_clamped`](UnitFraction::new_clamped)), a
//! quotient of counts ([`ratio`](UnitFraction::ratio)), a caller's proof
//! ([`new_unchecked`](UnitFraction::new_unchecked)), or a typed-error conversion ([`TryFrom`]) - so
//! a fraction that exists is valid and consuming code trusts the domain instead of re-checking it.
//!
//! Comparing, sorting and hashing need no NaN case: [`Eq`], [`Ord`] and [`Hash`] are total, agree
//! with one another, and follow numeric value, with `-0.0` and `+0.0` the same fraction. Fractions
//! sort and key ordered maps like the numbers they hold.
//!
//! Arithmetic whose result provably stays inside the interval stays inside the type - complements,
//! fraction products, count ratios - with no run-time re-check. Arithmetic that can leave the
//! interval, such as scaling an arbitrary `f64`, returns a raw `f64`. Serialization writes plain
//! numbers and deserialization re-validates, so a persisted fraction is as trustworthy as a
//! constructed one.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
    ops::{Mul, MulAssign},
};

/// The rejected value of a failed [`UnitFraction`] conversion.
///
/// [`TryFrom`] returns this error where [`UnitFraction::new`] returns [`None`] - the value lies
/// outside `[0, 1]` or is NaN. The error carries the rejected value and displays it together with
/// the expected interval.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NotInUnitInterval(pub f64);

impl fmt::Display for NotInUnitInterval {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{} is not a fraction in [0, 1]", self.0)
    }
}

impl Error for NotInUnitInterval {}

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

/// A finite fraction in `[0, 1]`, valid by construction.
///
/// A fraction that exists is valid, so the domain check lives at the constructor and nowhere else:
/// configuration knobs (thresholds, retained shares, rate fractions) and measured quantities
/// (recalls, admitted shares) both travel as this type, and the consuming site trusts the domain
/// instead of re-checking it.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value, with
/// `-0.0` and `+0.0` the same fraction. Fractions sort and key ordered maps with no NaN case.
///
/// Arithmetic that stays in `[0, 1]` stays in the type: [`complement`](Self::complement),
/// fraction-by-fraction `*` (with [`Product`](core::iter::Product) over iterators), and
/// [`ratio`](Self::ratio) construct valid fractions with no run-time re-check. Multiplying by a raw
/// `f64` returns a raw `f64`, and comparisons against raw floats follow IEEE semantics, so a
/// fraction never equals NaN.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::UnitFraction;
///
/// let quarter = UnitFraction::new(0.25).expect("0.25 lies inside [0, 1]");
/// assert_eq!(quarter.get(), 0.25);
///
/// // The domain is checked once, up front.
/// assert_eq!(UnitFraction::new(1.5), None);
/// assert_eq!(UnitFraction::new(f64::NAN), None);
///
/// // Closed arithmetic stays in the type; comparisons reach across to raw floats.
/// let three_quarters = quarter.complement();
/// assert!(three_quarters > 0.5);
/// assert_eq!(
///     three_quarters * quarter,
///     UnitFraction::new(0.1875).expect("the product is exact")
/// );
/// ```
// No `FromBytes` and no `FromZeros`: byte-level construction could mint NaN, a negative, or an
// out-of-range value in safe code, bypassing the validating constructors.
#[derive(Debug, Copy, Clone, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub struct UnitFraction(f64);

impl UnitFraction {
    /// The fraction one half.
    pub const HALF: Self = Self(0.5);
    /// The fraction one, the multiplicative identity and the empty product.
    pub const ONE: Self = Self(1.0);
    /// The fraction zero.
    pub const ZERO: Self = Self(0.0);

    /// Validates a fraction.
    ///
    /// Returns [`None`] unless the value lies in `[0, 1]`. NaN fails both bounds. For a computed
    /// value whose rounding may drift just past an endpoint, use
    /// [`new_clamped`](Self::new_clamped); for a quotient of integer counts, use
    /// [`ratio`](Self::ratio).
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if value >= 0.0 && value <= 1.0 {
            Some(Self::new_unchecked(value))
        } else {
            None
        }
    }

    /// Creates a fraction from a value the caller proves lies in `[0, 1]`.
    ///
    /// A promised `-0.0` is stored as `+0.0`. Where the proof is not immediate, [`new`](Self::new)
    /// checks instead.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::UnitFraction;
    ///
    /// let low = UnitFraction::HALF;
    /// let high = UnitFraction::new(0.75).expect("0.75 lies inside [0, 1]");
    /// // A midpoint of two fractions cannot leave [0, 1]: the sum rounds within
    /// // [0, 2] because both endpoints are representable, and halving is exact.
    /// let mid = UnitFraction::new_unchecked((low.get() + high.get()) / 2.0);
    /// assert_eq!(mid.get(), 0.625);
    /// ```
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong fraction
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value >= 0.0 && value <= 1.0,
            "the caller promised a value inside [0, 1]",
        );

        // `-0.0 + 0.0` is `+0.0` under round-to-nearest and every other in-range value is
        // unchanged: one add canonicalizes the sign of zero.
        Self(value + 0.0)
    }

    /// Clamps a value into `[0, 1]`.
    ///
    /// Saturates at the nearer endpoint - everything at or above `1.0` becomes [`ONE`](Self::ONE),
    /// everything below `0.0` becomes [`ZERO`](Self::ZERO), infinities included - and returns
    /// [`None`] only for NaN, which is near neither endpoint.
    ///
    /// This is the constructor for computed values whose mathematics keep them in the interval but
    /// whose floating-point evaluation may drift just past an endpoint, such as a cosine similarity
    /// landing at `1.0 + 2ε`. A value that is supposed to already be in range keeps
    /// [`new`](Self::new), which turns the drift into a visible refusal instead of absorbing it.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::UnitFraction;
    ///
    /// // Rounding drift saturates instead of failing.
    /// let similarity = UnitFraction::new_clamped(1.0 + f64::EPSILON).expect("only NaN is refused");
    /// assert_eq!(similarity, UnitFraction::ONE);
    /// assert_eq!(UnitFraction::new_clamped(-0.25), Some(UnitFraction::ZERO));
    ///
    /// // NaN is near neither endpoint.
    /// assert_eq!(UnitFraction::new_clamped(f64::NAN), None);
    /// ```
    #[inline]
    #[must_use]
    pub const fn new_clamped(value: f64) -> Option<Self> {
        if value >= 1.0 {
            Some(Self::ONE)
        } else if value >= 0.0 {
            // `value + 0.0` canonicalizes `-0.0`, which enters here because `-0.0 >= 0.0`
            Some(Self(value + 0.0))
        } else if value < 0.0 {
            Some(Self::ZERO)
        } else {
            None
        }
    }

    /// Returns the fraction of `part` in `total`.
    ///
    /// Returns [`None`] when `total` is zero or `part` exceeds `total`: a part measured against its
    /// own total is what keeps the quotient inside `[0, 1]`.
    ///
    /// The result is the correctly rounded quotient for counts up to 2⁵³. For larger counts it is
    /// approximate, within a relative error of `2⁻⁵¹` of the exact ratio.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::UnitFraction;
    ///
    /// let admitted = UnitFraction::ratio(34_317, 34_400).expect("the part is within its total");
    /// assert!(admitted > 0.99);
    ///
    /// assert_eq!(UnitFraction::ratio(3, 4).map(UnitFraction::get), Some(0.75));
    /// assert_eq!(UnitFraction::ratio(5, 4), None);
    /// assert_eq!(UnitFraction::ratio(0, 0), None);
    /// ```
    #[expect(
        clippy::cast_precision_loss,
        reason = "the cast is the operation: counts convert monotonically, and the documented \
                  contract states that counts above 2⁵³ round before the division"
    )]
    #[inline]
    #[must_use]
    pub const fn ratio(part: u64, total: u64) -> Option<Self> {
        if total == 0 || part > total {
            return None;
        }

        // Monotone casts keep the converted part at or below the converted total, a quotient of
        // non-negatives carries a positive sign, and a real quotient ≤ 1 rounds to at most the
        // representable 1.0: in range with no check, canonical with no normalization. Counts up to
        // 2⁵³ cast exactly, so one rounding remains and the quotient is correctly rounded; above,
        // three roundings compose to below 2⁻⁵¹ relative error.
        Some(Self(part as f64 / total as f64))
    }

    /// Returns the fraction.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }

    /// Returns `true` when the fraction is exactly zero.
    #[inline]
    #[must_use]
    pub const fn is_zero(self) -> bool {
        self.0 == 0.0
    }

    /// Returns `true` when the fraction is exactly one.
    #[expect(
        clippy::float_cmp,
        reason = "one is exactly representable and stored canonically, so equality is exact"
    )]
    #[inline]
    #[must_use]
    pub const fn is_one(self) -> bool {
        self.0 == 1.0
    }

    /// Returns the complement `1 − self`.
    ///
    /// The complement of a fraction is a fraction, with no re-validation. The subtraction is exact
    /// on `[0.5, 1]`, and the only zero result is the complement of one.
    ///
    /// Complementing twice reproduces fractions in `[0.5, 1]` exactly and elsewhere returns to
    /// within `2⁻⁵⁴` of the start, so a fraction below `2⁻⁵⁴` can come back as zero.
    #[inline]
    #[must_use]
    pub const fn complement(self) -> Self {
        // In range with no check: the real result lies in [0, 1] and rounding cannot escape an
        // interval whose endpoints are representable. Exact on [0.5, 1] by Sterbenz; the only
        // zero result is 1 - 1, whose sign is the canonical +0.0.
        Self(1.0 - self.0)
    }
}

const impl PartialEq for UnitFraction {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for UnitFraction {}

const impl PartialOrd for UnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for UnitFraction {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For canonical non-negative floats the bit pattern is monotone in the value: a GPR
        // compare with no NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for UnitFraction {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // canonical bits: equal fractions share one bit pattern, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

impl fmt::Display for UnitFraction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

const impl Mul for UnitFraction {
    type Output = Self;

    /// Multiplies two fractions.
    ///
    /// The product is a fraction, with no re-validation. A product of tiny fractions can underflow
    /// to [`UnitFraction::ZERO`].
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        // In range with no check: the real product of values in [0, 1] stays in [0, 1] and
        // rounding cannot escape an interval whose endpoints are representable. A product of
        // non-negatives keeps the positive sign even at underflow, so zero arrives as the
        // canonical +0.0.
        Self(self.0 * rhs.0)
    }
}

const impl MulAssign for UnitFraction {
    #[inline]
    fn mul_assign(&mut self, rhs: Self) {
        *self = *self * rhs;
    }
}

impl core::iter::Product for UnitFraction {
    /// Multiplies every fraction.
    ///
    /// An empty iterator yields [`UnitFraction::ONE`], the multiplicative identity.
    fn product<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ONE, Mul::mul)
    }
}

const impl From<UnitFraction> for f64 {
    #[inline]
    fn from(value: UnitFraction) -> Self {
        value.get()
    }
}

const impl TryFrom<f64> for UnitFraction {
    type Error = NotInUnitInterval;

    /// Validates as [`UnitFraction::new`] does, carrying the rejected value in the error.
    #[inline]
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(NotInUnitInterval(value))
    }
}

impl serde::Serialize for UnitFraction {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for UnitFraction {
    /// Deserializes a plain number, refusing values outside the closed unit interval.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a fraction in the closed unit interval",
            )
        })
    }
}

/// A fraction strictly between zero and one, valid by construction.
///
/// The open-interval sibling of [`UnitFraction`], for parameters whose semantics degenerate at an
/// endpoint: a contraction factor of zero collapses whatever it scales, a contraction factor of one
/// never contracts, and an acceptance threshold at either end stops being a threshold. The
/// exclusion travels in the type, so dividing by a fraction, taking its logarithm, and comparing it
/// strictly need no endpoint checks at the use site.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value, so
/// fractions sort and key ordered maps with no NaN case.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::OpenUnitFraction;
///
/// let shrink = OpenUnitFraction::new(0.25).expect("a quarter contracts");
/// assert_eq!(shrink.get(), 0.25);
///
/// // Both endpoints lie outside the domain.
/// assert_eq!(OpenUnitFraction::new(0.0), None);
/// assert_eq!(OpenUnitFraction::new(1.0), None);
/// ```
#[derive(Debug, Copy, Clone)]
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
    /// The result can be exactly one - `1 − x` rounds to `1.0` for every `x ≤ 2⁻⁵⁴` - so the
    /// complement of an open fraction lives in the closed type. It is never zero, bottoming out at
    /// `2⁻⁵³`, the complement of the largest fraction below one.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{OpenUnitFraction, UnitFraction};
    ///
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
        UnitFraction(1.0 - self.0)
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

const impl From<OpenUnitFraction> for UnitFraction {
    /// Widens into the enclosing closed interval.
    #[inline]
    fn from(value: OpenUnitFraction) -> Self {
        // No normalization: the open domain contains no -0.0, so the value is already canonical.
        Self(value.get())
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

macro_rules! f64_interop {
    ($ty:ty) => {
        const impl PartialEq<f64> for $ty {
            #[inline]
            fn eq(&self, other: &f64) -> bool {
                // numeric, not bitwise: the raw side may be `-0.0` or NaN, and the
                // comparison must follow IEEE semantics for both
                self.0 == *other
            }
        }

        const impl PartialEq<$ty> for f64 {
            #[inline]
            fn eq(&self, other: &$ty) -> bool {
                *self == other.0
            }
        }

        const impl PartialOrd<f64> for $ty {
            #[inline]
            fn partial_cmp(&self, other: &f64) -> Option<Ordering> {
                self.0.partial_cmp(other)
            }

            // one float compare each, no Option round-trip for LLVM to fold
            #[inline]
            fn lt(&self, other: &f64) -> bool {
                self.0 < *other
            }

            #[inline]
            fn le(&self, other: &f64) -> bool {
                self.0 <= *other
            }

            #[inline]
            fn gt(&self, other: &f64) -> bool {
                self.0 > *other
            }

            #[inline]
            fn ge(&self, other: &f64) -> bool {
                self.0 >= *other
            }
        }

        const impl PartialOrd<$ty> for f64 {
            #[inline]
            fn partial_cmp(&self, other: &$ty) -> Option<Ordering> {
                self.partial_cmp(&other.0)
            }

            #[inline]
            fn lt(&self, other: &$ty) -> bool {
                *self < other.0
            }

            #[inline]
            fn le(&self, other: &$ty) -> bool {
                *self <= other.0
            }

            #[inline]
            fn gt(&self, other: &$ty) -> bool {
                *self > other.0
            }

            #[inline]
            fn ge(&self, other: &$ty) -> bool {
                *self >= other.0
            }
        }

        const impl Mul<f64> for $ty {
            type Output = f64;

            /// Scales a raw `f64`.
            ///
            /// The product of a fraction and an arbitrary float can leave the unit interval, so the
            /// output is a raw `f64`.
            #[inline]
            fn mul(self, rhs: f64) -> f64 {
                self.0 * rhs
            }
        }

        const impl Mul<$ty> for f64 {
            type Output = f64;

            #[inline]
            fn mul(self, rhs: $ty) -> f64 {
                self * rhs.0
            }
        }

        const impl MulAssign<$ty> for f64 {
            /// Scales a raw `f64` in place.
            #[inline]
            fn mul_assign(&mut self, rhs: $ty) {
                *self *= rhs.0;
            }
        }
    };
}

f64_interop!(UnitFraction);
f64_interop!(OpenUnitFraction);
