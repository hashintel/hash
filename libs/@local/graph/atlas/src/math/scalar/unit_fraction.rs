//! The closed unit-interval fraction.

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    hash::{Hash, Hasher},
    ops::{Mul, MulAssign, Sub},
};

use super::{
    DFinite, OpenUnitFraction, PositiveUnitFraction, raw_interop, unsafe_impl_try_from_bytes,
};

/// Validates a unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`UnitFraction::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
macro_rules! unit_fraction {
    ($value:expr) => {
        const { $crate::math::UnitFraction::new($value).expect("the literal lies in [0, 1]") }
    };
}
pub(crate) use unit_fraction;

///
/// [`TryFrom`] returns this error where [`UnitFraction::new`] returns [`None`] - the value lies
/// outside `[0, 1]` or is NaN. The error carries the rejected value and displays it together with
/// the expected interval.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct NotInUnitInterval(pub f64);

impl fmt::Display for NotInUnitInterval {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{} is not a fraction in [0, 1]", self.0)
    }
}

impl Error for NotInUnitInterval {}

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
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    rkyv::bytecheck::CheckBytes,
)]
#[bytecheck(verify)]
#[repr(transparent)]
pub(crate) struct UnitFraction(f64);

impl UnitFraction {
    /// The fraction one half.
    pub(crate) const HALF: Self = Self(0.5);
    /// The fraction one, the multiplicative identity and the empty product.
    pub(crate) const ONE: Self = Self(1.0);
    /// The fraction zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a fraction.
    ///
    /// Returns [`None`] unless the value lies in `[0, 1]`. NaN fails both bounds. For a computed
    /// value whose rounding may drift just past an endpoint, use
    /// [`new_clamped`](Self::new_clamped); for a quotient of integer counts, use
    /// [`ratio`](Self::ratio).
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
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
    pub(crate) const fn new_unchecked(value: f64) -> Self {
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
    pub(crate) const fn new_clamped(value: f64) -> Option<Self> {
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
    pub(crate) const fn ratio(part: u64, total: u64) -> Option<Self> {
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
    pub(crate) const fn get(self) -> f64 {
        self.0
    }

    /// Returns `true` when the fraction is exactly zero.
    #[inline]
    #[must_use]
    pub(crate) const fn is_zero(self) -> bool {
        self.0 == 0.0
    }

    /// Returns `true` when the fraction is exactly one.
    #[expect(
        clippy::float_cmp,
        reason = "one is exactly representable and stored canonically, so equality is exact"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn is_one(self) -> bool {
        self.0 == 1.0
    }

    /// Returns the canonical bit pattern.
    ///
    /// Construction canonicalizes the sign of zero, so equal fractions share one bit pattern
    /// and the bits identify the fraction exactly: fit for reproducibility records and
    /// bit-exact pins.
    #[inline]
    #[must_use]
    pub(crate) const fn to_bits(self) -> u64 {
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
    pub(crate) const fn is_canonical(value: f64) -> bool {
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
    pub(crate) const fn complement(self) -> Self {
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
    pub(crate) fn sqrt(self) -> Self {
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

const impl PartialEq<PositiveUnitFraction> for UnitFraction {
    #[inline]
    fn eq(&self, other: &PositiveUnitFraction) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.get().to_bits() == other.get().to_bits()
    }
}

const impl PartialOrd<PositiveUnitFraction> for UnitFraction {
    #[inline]
    fn partial_cmp(&self, other: &PositiveUnitFraction) -> Option<Ordering> {
        // For canonical non-negative floats the bit pattern is monotone in the value.
        Some(self.get().to_bits().cmp(&other.get().to_bits()))
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

const impl Sub for UnitFraction {
    type Output = DFinite;

    /// The difference of two unit fractions.
    ///
    /// Both operands lie in [0, 1], so the difference lies in [−1, 1] and is always finite:
    /// the landing is total and the unchecked constructor rides that theorem. The typed
    /// carrier for the [−1, 1] landing itself does not exist yet, so the output claims
    /// finiteness alone.
    #[inline]
    fn sub(self, rhs: Self) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
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

impl<'row> tokio_postgres::types::FromSql<'row> for UnitFraction {
    fn from_sql(
        ty: &tokio_postgres::types::Type,
        raw: &'row [u8],
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

const impl From<OpenUnitFraction> for UnitFraction {
    /// Widens into the enclosing closed interval.
    #[inline]
    fn from(value: OpenUnitFraction) -> Self {
        // No normalization: the open domain contains no -0.0, so the value is already canonical.
        Self(value.get())
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

const impl Sub<UnitFraction> for f64 {
    type Output = f64;

    /// Subtracts a fraction from a raw `f64`.
    ///
    /// The raw operand is arbitrary, so the difference can leave any bounded domain and returns
    /// a raw float.
    #[inline]
    fn sub(self, rhs: UnitFraction) -> f64 {
        self - rhs.0
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
        Self(self.0 * rhs.get())
    }
}

raw_interop!(UnitFraction[f64]);
unsafe_impl_try_from_bytes!(UnitFraction[f64]);

// SAFETY: `repr(transparent)` over `f64` gives one stable layout - size 8, alignment 8, no
// padding - on every target, and the type has no interior mutability. The stored bits are the
// writer's native `f64`, so a reader on the other byte order computes a different value from
// the same bytes: every format that maps this type stamps its writer's byte order and refuses
// the other order at open, before any archived value is reached. This is also why `Archive`
// below is hand-written as the identity: the derive would route the field through the
// endian-tagged `Archived<f64>`, and native bits under a stamped manifest are the contract.
unsafe impl rkyv::Portable for UnitFraction {}

// SAFETY: `repr(transparent)` over `f64`, so every byte of a value is initialized.
unsafe impl rkyv::traits::NoUndef for UnitFraction {}

impl rkyv::Archive for UnitFraction {
    type Archived = Self;
    type Resolver = ();

    fn resolve(&self, (): Self::Resolver, out: rkyv::Place<Self>) {
        out.write(*self);
    }
}

impl<S: rkyv::rancor::Fallible + ?Sized> rkyv::Serialize<S> for UnitFraction {
    fn serialize(&self, _serializer: &mut S) -> Result<Self::Resolver, S::Error> {
        Ok(())
    }
}

// SAFETY: a unit fraction imposes no bit-validity condition, since every `f64` bit pattern is
// constructible. Its domain is instead a value condition, checked here after construction for the
// same reason `unchecked` construction is safe. Running the check through `&self` is therefore
// sound, and `verify` returning `Ok` is exactly [`UnitFraction::is_canonical`].
unsafe impl<C> rkyv::bytecheck::Verify<C> for UnitFraction
where
    C: rkyv::rancor::Fallible<Error: rkyv::rancor::Source> + ?Sized,
{
    fn verify(&self, _: &mut C) -> Result<(), <C as rancor::Fallible>::Error> {
        if !Self::is_canonical(self.0) {
            rkyv::rancor::fail!(NotInUnitInterval(self.0));
        }
        Ok(())
    }
}
