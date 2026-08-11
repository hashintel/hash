//! Unit-interval fractions that carry their domain in the type.
//!
//! [`UnitFraction`] holds a finite `f64` in `[0, 1]`. [`PositiveUnitFraction`] holds one in
//! `(0, 1]`, excluding zero alone. [`OpenUnitFraction`] holds one strictly inside `(0, 1)`.
//! Validation happens once, at construction - refusal
//! ([`new`](UnitFraction::new)), saturation ([`new_clamped`](UnitFraction::new_clamped)), a
//! quotient of counts ([`ratio`](UnitFraction::ratio)), a caller's proof
//! ([`new_unchecked`](UnitFraction::new_unchecked)), or a typed-error conversion ([`TryFrom`]).
//! A fraction that exists is therefore valid, and consuming code trusts the domain instead of
//! re-checking it.
//!
//! Comparing, sorting and hashing need no NaN case: [`Eq`], [`Ord`] and [`Hash`] are total, agree
//! with one another, and follow numeric value, with `-0.0` and `+0.0` the same fraction. Fractions
//! sort and key ordered maps like the numbers they hold.
//!
//! Arithmetic whose result provably stays inside the interval - a complement, a fraction
//! product, a count ratio, a square root - keeps the type with no run-time re-check, while
//! scaling an arbitrary `f64` can leave the interval and returns a raw `f64`. Serialization
//! writes plain numbers and deserialization re-validates, so a persisted fraction is as
//! trustworthy as a constructed one.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
    ops::{Mul, MulAssign},
};

use super::{DNonNegative, unsafe_impl_try_from_bytes};

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
/// ```ignore
/// let quarter = UnitFraction::new(0.25).expect("0.25 lies inside [0, 1]");
/// assert_eq!(quarter.get(), 0.25);
///
/// // The domain is checked once, up front.
/// assert_eq!(UnitFraction::new(1.5), None);
/// assert_eq!(UnitFraction::new(f64::NAN), None);
///
/// // Closed arithmetic stays in the type. Comparisons reach across to raw floats.
/// let three_quarters = quarter.complement();
/// assert!(three_quarters > 0.5);
/// assert_eq!(
///     three_quarters * quarter,
///     UnitFraction::new(0.1875).expect("the product is exact")
/// );
/// ```
// No `FromBytes` and no `FromZeros`: byte-level construction could produce NaN or a value
// outside the interval in safe code, bypassing the validating constructors.
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
    /// ```ignore
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
    /// ```ignore
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
    /// ```ignore
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

    /// Returns the canonical bit pattern.
    ///
    /// Construction canonicalizes the sign of zero, so equal fractions share one bit pattern
    /// and the bits identify the fraction exactly: fit for reproducibility records and
    /// bit-exact pins.
    #[inline]
    #[must_use]
    pub const fn to_bits(self) -> u64 {
        self.0.to_bits()
    }

    /// Returns whether `value`'s exact bits are a stored fraction.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the value must
    /// lie in `[0, 1]`, and a zero must be the canonical `+0.0` the constructors store, because
    /// admitting `-0.0` bits would produce a fraction whose bit-keyed equality, ordering and
    /// hashing disagree with its numeric value.
    #[inline]
    #[must_use]
    pub const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            Some(fraction) => fraction.to_bits() == value.to_bits(),
            None => false,
        }
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

    /// Returns the square root.
    ///
    /// The root of a fraction is a fraction, with no re-validation: the square root is monotone
    /// on `[0, 1]` with `√0 = 0` and `√1 = 1` exact. A correctly rounded root of a value just
    /// below one can round to exactly one, which the closed interval admits.
    #[inline]
    #[must_use]
    pub fn sqrt(self) -> Self {
        // In range with no check: sqrt is monotone into [0, 1] over this domain, never NaN for
        // a non-negative operand, and sqrt(+0.0) is +0.0.
        Self(self.0.sqrt())
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

#[cfg(test)]
#[expect(
    exported_private_dependencies,
    reason = "the impl exists only in test builds, which no downstream consumer compiles"
)]
impl proptest::arbitrary::Arbitrary for UnitFraction {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole closed interval, both endpoints included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (0.0..=1.0)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
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

impl<'a> tokio_postgres::types::FromSql<'a> for UnitFraction {
    fn from_sql(
        ty: &tokio_postgres::types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let value = f64::from_sql(ty, raw)?;

        if let Some(fraction) = Self::new(value) {
            return Ok(fraction);
        }

        tracing::warn!(
            value,
            "expected the value to be in the closed unit interval of 0..=1, clamping the value, \
             or returning zero on NaN"
        );

        Ok(Self::new_clamped(value).unwrap_or(Self::ZERO))
    }

    fn accepts(ty: &tokio_postgres::types::Type) -> bool {
        <f64 as tokio_postgres::types::FromSql>::accepts(ty)
    }
}

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
        UnitFraction(1.0 - self.0)
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

const impl From<PositiveUnitFraction> for UnitFraction {
    /// Widens into the enclosing closed interval.
    #[inline]
    fn from(value: PositiveUnitFraction) -> Self {
        // No normalization: the half-open domain contains no -0.0, so the value is already
        // canonical.
        Self(value.get())
    }
}

const impl From<PositiveUnitFraction> for f64 {
    #[inline]
    fn from(value: PositiveUnitFraction) -> Self {
        value.get()
    }
}

const impl Mul<PositiveUnitFraction> for UnitFraction {
    type Output = Self;

    /// Multiplies a closed fraction by a half-open one.
    ///
    /// The product is a closed fraction, with no re-validation. It vanishes when the closed
    /// operand is zero, and a product of small positives can underflow to
    /// [`UnitFraction::ZERO`], which is why the half-open type cannot hold the result.
    #[inline]
    fn mul(self, rhs: PositiveUnitFraction) -> Self {
        // In range with no check: the real product of values in [0, 1] stays in [0, 1] and
        // rounding cannot escape an interval whose endpoints are representable. A product of
        // non-negatives keeps the positive sign even at underflow, so zero arrives as the
        // canonical +0.0.
        Self(self.0 * rhs.0)
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

const impl Mul<DNonNegative> for UnitFraction {
    type Output = DNonNegative;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> DNonNegative {
        DNonNegative(self.0 * rhs.0)
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
f64_interop!(PositiveUnitFraction);
f64_interop!(OpenUnitFraction);

unsafe_impl_try_from_bytes!(
    UnitFraction[f64],
    PositiveUnitFraction[f64],
    OpenUnitFraction[f64]
);
