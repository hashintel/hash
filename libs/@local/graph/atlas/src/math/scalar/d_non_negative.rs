//! The finite, non-negative `f64` scalar.

use core::{
    cmp::Ordering,
    fmt,
    hash::{Hash, Hasher},
};

use super::{
    DFinite, DPositive, NonNegative, OpenUnitFraction, Positive, PositiveUnitFraction,
    UnitFraction, raw_interop, unsafe_impl_try_from_bytes,
};

/// Validates a non-negative double-precision literal at compile time.
///
/// The expansion is a `const` block over [`DNonNegative::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! d_non_negative {
    ($value:expr) => {
        const {
            $crate::math::DNonNegative::new($value)
                .expect("the literal is finite and non-negative")
        }
    };
}
#[cfg(test)]
pub(crate) use d_non_negative;

/// A finite, non-negative `f64`, valid by construction.
///
/// The double-precision twin of [`NonNegative`]. Zero passes, so the type carries tolerances and
/// floors that may legitimately switch a check off, and measured magnitudes such as distances.
///
/// [`Eq`], [`Ord`] and [`Hash`] are total, agree with one another, and follow numeric value,
/// with `-0.0` and `+0.0` the same value: construction canonicalizes the sign of zero. Values
/// sort and key ordered maps like the numbers they hold, with no NaN case.
///
/// Arithmetic whose result provably stays in the domain stays in the type. The square root of a
/// non-negative value is non-negative ([`sqrt`](Self::sqrt)), while subtracting one non-negative
/// value from another leaves the domain yet provably stays finite, so `-` outputs [`DFinite`].
/// Serialization writes plain numbers and deserialization re-validates.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(
///     DNonNegative::new(0.0)
///         .expect("zero disables the floor")
///         .get(),
///     0.0
/// );
/// assert_eq!(DNonNegative::new(-1.0e-10), None);
/// assert_eq!(DNonNegative::new(f64::NAN), None);
/// ```
#[derive(Copy, Clone, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct DNonNegative(f64);

impl DNonNegative {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Views a slice of readings as raw `f64`s.
    ///
    /// The view is zero-cost: the type is `repr(transparent)` over `f64`, so the slices share one
    /// layout. It serves a boundary whose vocabulary is the raw primitive.
    #[inline]
    pub(crate) fn slice_as_raw(values: &[Self]) -> &[f64] {
        zerocopy::FromBytes::ref_from_bytes(zerocopy::IntoBytes::as_bytes(values))
            .expect("a `repr(transparent)` newtype slice shares its primitive's size and alignment")
    }

    /// Validates a non-negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and at least zero. A negative zero passes
    /// and is stored as `+0.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self::new_unchecked(value))
    }

    /// Converts a count into the domain.
    ///
    /// Counts at or below 2⁵³ convert exactly, and a larger count rounds to the nearest
    /// representable value, staying finite and non-negative.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the rounding above 2^53 is this constructor's stated contract"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn from_usize(value: usize) -> Self {
        Self(value as f64)
    }

    /// Returns whether `value`'s exact bits are a stored non-negative value.
    ///
    /// The bit-level twin of [`new`](Self::new), for validating persisted bytes: the value must
    /// be finite and at least zero, and a zero must be the canonical `+0.0` the constructors
    /// store, because admitting `-0.0` bits would produce a value whose bit-keyed equality,
    /// ordering and hashing disagree with its numeric value.
    #[inline]
    #[must_use]
    pub(crate) const fn is_canonical(value: f64) -> bool {
        match Self::new(value) {
            // The bit compare refuses `-0.0`, which construction stores as `+0.0`.
            Some(accepted) => accepted.0.to_bits() == value.to_bits(),
            None => false,
        }
    }

    /// Creates a value the caller proves finite and at least zero.
    ///
    /// A promised `-0.0` is stored as `+0.0`. Where the proof is not immediate,
    /// [`new`](Self::new) checks instead.
    // Not `unsafe`: no unsafe code trusts the range, a broken promise yields a wrong value
    // rather than UB. Revisit if the value ever feeds an unchecked index.
    #[inline]
    #[must_use]
    pub(crate) const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value.is_finite() && value >= 0.0,
            "the caller promised a finite non-negative value",
        );

        // `-0.0 + 0.0` is `+0.0` under round-to-nearest and every other in-range value is
        // unchanged: one add canonicalizes the sign of zero.
        Self(value + 0.0)
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }

    /// Returns the square root.
    ///
    /// The root of a non-negative value is non-negative, with no re-validation. The root of
    /// zero is zero.
    #[inline]
    #[must_use]
    pub(crate) fn sqrt(self) -> Self {
        // In domain with no check: `sqrt` over `[0, MAX]` is monotone into `[0, ~1.35e154]`,
        // never NaN for a non-negative operand, and `sqrt(+0.0)` is `+0.0`.
        Self(self.0.sqrt())
    }

    /// Fuses a multiply-add `self · factor + addend` with one rounding.
    ///
    /// Products and sums of non-negatives stay non-negative and are never NaN. Overflow escapes
    /// to `+∞` and asserts in debug builds, mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) fn mul_add(self, factor: Self, addend: Self) -> Self {
        let fused = self.0.mul_add(factor.0, addend.0);
        debug_assert!(fused.is_finite(), "the fused multiply-add overflowed");

        Self(fused)
    }

    /// Narrows to working precision with round-to-nearest.
    ///
    /// A value beyond the `f32` range overflows to `+∞` and asserts in debug builds through the
    /// constructor.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the rounding cast is the operation itself"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn narrow_lossy(self) -> NonNegative {
        NonNegative::new_unchecked(self.0 as f32)
    }

    /// Converts a count, exactly.
    ///
    /// Every `u16` is non-negative and far inside `f64`'s exact-integer range, so the conversion
    /// is total and no re-validation happens.
    #[inline]
    #[must_use]
    pub(crate) const fn from_u16(value: u16) -> Self {
        Self(value as f64)
    }

    /// Narrows to the strictly positive domain.
    ///
    /// Returns [`None`] exactly at zero, so an `if let` on the result is the zero guard and the
    /// positivity witness in one move.
    #[inline]
    #[must_use]
    pub(crate) const fn positive(self) -> Option<DPositive> {
        DPositive::new(self.0)
    }

    /// Returns whether the value is zero.
    #[inline]
    #[must_use]
    pub(crate) const fn is_zero(self) -> bool {
        self.0 == 0.0
    }

    /// Returns whether the value is subnormal.
    #[inline]
    #[must_use]
    pub(crate) const fn is_subnormal(self) -> bool {
        self.0.is_subnormal()
    }

    /// Returns whether the value stayed in domain.
    ///
    /// Construction admits only finite values and arithmetic escapes to `+∞` on overflow, so a
    /// non-finite reading is exactly an escaped one.
    ///
    /// The one caller shape is a validation point that rejects escaped readings before acting on
    /// a computed value. Anywhere else the query re-checks what construction already proved, and
    /// the check itself is the defect.
    #[inline]
    #[must_use]
    pub(crate) const fn is_finite(self) -> bool {
        self.0.is_finite()
    }

    /// Divides by a positive value, refusing the escape.
    ///
    /// The quotient of a non-negative by a positive is never NaN and never negative, and
    /// underflow rounds to zero, inside the domain. Returns [`None`] exactly when the quotient
    /// overflows, where the plain division would escape to `+∞`.
    #[inline]
    #[must_use]
    pub(crate) const fn checked_div(self, rhs: DPositive) -> Option<Self> {
        Self::new(self.0 / rhs.get())
    }

    /// Raises to a raw power, staying non-negative.
    ///
    /// A non-negative base admits no NaN from `powf`. Zero raised to a positive exponent is
    /// zero, and zero raised to the zero exponent is one. A positive base stays positive under
    /// any exponent. Zero to a negative power and an overflowing result escape to `+∞` - wrong
    /// readings rather than soundness breaks, since no unsafe code trusts the domain - and
    /// assert in debug builds through the constructor.
    #[inline]
    #[must_use]
    pub(crate) fn powf(self, exponent: f64) -> Self {
        Self::new_unchecked(self.0.powf(exponent))
    }
}

const impl Default for DNonNegative {
    fn default() -> Self {
        DNonNegative::ZERO
    }
}

impl fmt::Debug for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl fmt::LowerExp for DNonNegative {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::LowerExp::fmt(&self.0, fmt)
    }
}

const impl PartialEq for DNonNegative {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // one bit pattern per value, so bit equality is numeric equality
        self.0.to_bits() == other.0.to_bits()
    }
}

const impl Eq for DNonNegative {}

const impl PartialOrd for DNonNegative {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl Ord for DNonNegative {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        // For canonical non-negative floats the bit pattern is monotone in the value: a GPR
        // compare with no NaN branch and no panic path.
        self.0.to_bits().cmp(&other.0.to_bits())
    }
}

impl Hash for DNonNegative {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // canonical bits: equal values share one bit pattern, so `Hash` agrees with `Eq`
        state.write_u64(self.0.to_bits());
    }
}

const impl core::ops::Sub for DNonNegative {
    type Output = DFinite;

    /// Subtracts, into the finite domain.
    ///
    /// The difference of two non-negative finite values is finite, with no re-validation: its
    /// magnitude never exceeds the larger operand, so the subtraction cannot overflow. Equal
    /// operands give `+0.0`.
    #[inline]
    fn sub(self, rhs: Self) -> DFinite {
        DFinite::new_unchecked(self.0 - rhs.0)
    }
}

const impl core::ops::Neg for DNonNegative {
    type Output = f64;

    /// Negates, leaving the domain at the sign flip.
    ///
    /// The negation of a non-negative value is non-positive, so the result is a raw float.
    #[inline]
    fn neg(self) -> f64 {
        -self.0
    }
}

const impl core::ops::Add<f64> for DNonNegative {
    type Output = f64;

    /// Adds a raw offset.
    ///
    /// The raw operand is arbitrary, so the sum can leave any bounded domain and returns a raw
    /// float.
    #[inline]
    fn add(self, rhs: f64) -> f64 {
        self.0 + rhs
    }
}

const impl core::ops::Sub<f64> for DNonNegative {
    type Output = f64;

    /// Subtracts a raw offset.
    ///
    /// The raw operand is arbitrary, so the difference can leave any bounded domain and returns
    /// a raw float.
    #[inline]
    fn sub(self, rhs: f64) -> f64 {
        self.0 - rhs
    }
}

const impl core::ops::Add<DNonNegative> for f64 {
    type Output = f64;

    /// Adds a non-negative offset to a raw `f64`.
    ///
    /// The raw operand is arbitrary, so the sum can leave any bounded domain and returns a raw
    /// float.
    #[inline]
    fn add(self, rhs: DNonNegative) -> f64 {
        self + rhs.0
    }
}

const impl core::ops::Sub<DNonNegative> for f64 {
    type Output = f64;

    /// Subtracts a non-negative offset from a raw `f64`.
    ///
    /// The raw operand is arbitrary, so the difference can leave any bounded domain and returns
    /// a raw float.
    #[inline]
    fn sub(self, rhs: DNonNegative) -> f64 {
        self - rhs.0
    }
}

const impl core::ops::Sub<DPositive> for DNonNegative {
    type Output = f64;

    /// Subtracts a positive value, leaving the domain.
    ///
    /// The difference is negative whenever the positive operand exceeds the value, so the result
    /// is a raw float and the caller re-enters a domain at whichever boundary proves the bound.
    #[inline]
    fn sub(self, rhs: DPositive) -> f64 {
        self.0 - rhs.get()
    }
}

const impl core::ops::Add<OpenUnitFraction> for DNonNegative {
    type Output = Self;

    /// Accumulates a fraction: an open unit fraction is a finite non-negative value, and a sum
    /// with a value below one cannot overflow.
    #[inline]
    fn add(self, rhs: OpenUnitFraction) -> Self {
        Self(self.0 + rhs.get())
    }
}

const impl core::ops::AddAssign<OpenUnitFraction> for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: OpenUnitFraction) {
        self.0 += rhs.get();
    }
}

const impl core::ops::Add for DNonNegative {
    type Output = Self;

    /// Adds.
    ///
    /// A sum of non-negatives is never NaN and never `-0.0`. Overflow escapes to `+∞` - a
    /// wrong reading rather than a soundness break, since no unsafe code trusts the domain and
    /// a persisted value re-validates at construction - and asserts in debug builds, mirroring
    /// integer `+`.
    #[inline]
    fn add(self, rhs: Self) -> Self {
        let sum = self.0 + rhs.0;
        debug_assert!(sum.is_finite(), "non-negative addition overflowed");

        Self(sum)
    }
}

const impl core::ops::AddAssign for DNonNegative {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl core::ops::AddAssign<PositiveUnitFraction> for DNonNegative {
    /// Accumulates a fraction: a positive unit fraction is a finite non-negative value, and a
    /// sum with a value at most one cannot overflow.
    #[inline]
    fn add_assign(&mut self, rhs: PositiveUnitFraction) {
        *self = *self + Self(rhs.get());
    }
}

const impl core::ops::Div<DPositive> for DNonNegative {
    type Output = Self;

    /// Divides by a positive value.
    ///
    /// The quotient of a non-negative by a positive is never NaN and never negative. Overflow
    /// escapes to `+∞` - a wrong reading rather than a soundness break, since no unsafe code
    /// trusts the domain - and asserts in debug builds through the constructor.
    #[inline]
    fn div(self, rhs: DPositive) -> Self {
        Self::new_unchecked(self.0 / rhs.get())
    }
}

const impl core::ops::Add<DPositive> for DNonNegative {
    type Output = DPositive;

    /// Adds a positive value, into the positive domain.
    ///
    /// Rounding is monotone, so the sum is at least the positive operand and never reaches
    /// zero. Overflow escapes to `+∞` and asserts in debug builds through the constructor.
    #[inline]
    fn add(self, rhs: DPositive) -> DPositive {
        DPositive::new_unchecked(self.0 + rhs.get())
    }
}

const impl core::ops::Mul for DNonNegative {
    type Output = Self;

    /// Multiplies.
    ///
    /// A product of finite non-negatives is never NaN and never negative. Overflow escapes to
    /// `+∞` - a wrong reading rather than a soundness break, since no unsafe code trusts the
    /// domain - and asserts in debug builds through the constructor. Underflow rounds to zero,
    /// inside the domain.
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Self::new_unchecked(self.0 * rhs.0)
    }
}

const impl core::ops::Mul<DPositive> for DNonNegative {
    type Output = Self;

    /// Multiplies by a positive factor, staying non-negative.
    ///
    /// Zero stays exactly zero, and overflow escapes to `+∞` as the in-family product does.
    #[inline]
    fn mul(self, rhs: DPositive) -> Self {
        Self::new_unchecked(self.0 * rhs.get())
    }
}

const impl PartialEq<DPositive> for DNonNegative {
    /// Compares across the scalar family, in one precision with no widening.
    #[inline]
    fn eq(&self, other: &DPositive) -> bool {
        self.0 == other.get()
    }
}

const impl PartialOrd<DPositive> for DNonNegative {
    /// Orders across the scalar family, in one precision with no widening.
    #[inline]
    fn partial_cmp(&self, other: &DPositive) -> Option<Ordering> {
        self.0.partial_cmp(&other.get())
    }
}

#[cfg(test)]
impl proptest::arbitrary::Arbitrary for DNonNegative {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    /// Draws from the whole domain, zero and subnormals included.
    fn arbitrary_with((): Self::Parameters) -> Self::Strategy {
        use proptest::strategy::Strategy as _;

        (0.0..=f64::MAX)
            .prop_map(|value| Self::new(value).expect("the range covers exactly the domain"))
            .boxed()
    }
}

impl serde::Serialize for DNonNegative {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for DNonNegative {
    /// Deserializes a plain number, refusing values outside the finite non-negative range.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(value),
                &"a finite non-negative number",
            )
        })
    }
}

const impl From<DPositive> for DNonNegative {
    /// Widens into the enclosing domain: every positive value is non-negative.
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

const impl From<NonNegative> for DNonNegative {
    /// Widens into double precision, exactly: the canonical zero and the domain both survive.
    #[inline]
    fn from(value: NonNegative) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.get() as f64)
    }
}

const impl From<Positive> for DNonNegative {
    /// Widens into double precision and the enclosing domain, exactly: every positive value
    /// is non-negative.
    #[inline]
    fn from(value: Positive) -> Self {
        // `f64::from` is not const-callable. The widening cast is lossless.
        Self(value.get() as f64)
    }
}

const impl From<UnitFraction> for DNonNegative {
    /// [0, 1] is non-negative.
    #[inline]
    fn from(value: UnitFraction) -> Self {
        Self(value.get())
    }
}

const impl From<DNonNegative> for f64 {
    #[inline]
    fn from(value: DNonNegative) -> Self {
        value.0
    }
}

const impl core::ops::Mul<DNonNegative> for UnitFraction {
    type Output = DNonNegative;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> DNonNegative {
        // In domain with no check: a fraction in [0, 1] scales the magnitude toward zero, so the
        // product stays finite and non-negative, and a zero product keeps the canonical +0.0.
        DNonNegative(self.get() * rhs.0)
    }
}

const impl core::ops::Mul<DNonNegative> for OpenUnitFraction {
    type Output = DNonNegative;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> DNonNegative {
        // In domain with no check: a fraction in (0, 1) scales the magnitude toward zero, so the
        // product stays finite and non-negative, and a zero product keeps the canonical +0.0.
        DNonNegative(self.get() * rhs.0)
    }
}

raw_interop!(DNonNegative[f64]);
unsafe_impl_try_from_bytes!(DNonNegative[f64]);
