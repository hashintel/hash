//! Numerically stable scalar special functions with validated domains.
//!
//! Checked float narrowing rides beside them.
//!
//! These formalize numeric patterns that recur across the crate: a stable softplus and the Huber
//! penalty for layout losses, checked `f64` to `f32` narrowing for persisted coordinates, the
//! unit-interval fractions [`UnitFraction`] and [`OpenUnitFraction`], and the finiteness-only
//! guards [`Finite`] and [`DFinite`] for signed quantities, all validated once at construction and
//! carried by configuration knobs and measured shares alike. Vector reductions such as softmax and
//! log-sum-exp live on [`DVecN`](super::DVecN).
mod finite;
#[cfg(test)]
mod tests;
mod unit;

use core::{
    cmp::Ordering,
    hash::{Hash, Hasher},
};

pub(crate) use finite::{DFinite, Finite};
#[cfg(test)]
pub(crate) use finite::{d_finite, finite};
pub(crate) use unit::{OpenUnitFraction, UnitFraction};

/// Validates a positive literal at compile time.
///
/// The expansion is a `const` block over [`Positive::new`], so a literal outside the domain fails
/// the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! positive {
    ($value:expr) => {
        const { $crate::math::Positive::new($value).expect("the literal is finite and positive") }
    };
}
#[cfg(test)]
pub(crate) use positive;

/// Validates a non-negative literal at compile time.
///
/// The expansion is a `const` block over [`NonNegative::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! non_negative {
    ($value:expr) => {
        const {
            $crate::math::NonNegative::new($value).expect("the literal is finite and non-negative")
        }
    };
}
#[cfg(test)]
pub(crate) use non_negative;

/// Validates a positive double-precision literal at compile time.
///
/// The expansion is a `const` block over [`DPositive::new`], so a literal outside the domain fails
/// the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! d_positive {
    ($value:expr) => {
        const { $crate::math::DPositive::new($value).expect("the literal is finite and positive") }
    };
}
#[cfg(test)]
pub(crate) use d_positive;

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

/// Validates an open-unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`OpenUnitFraction::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! open_unit_fraction {
    ($value:expr) => {
        const { $crate::math::OpenUnitFraction::new($value).expect("the literal lies inside (0, 1)") }
    };
}
#[cfg(test)]
pub(crate) use open_unit_fraction;

/// Validates a greater-than-one literal at compile time.
///
/// The expansion is a `const` block over [`GreaterThanOne::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! greater_than_one {
    ($value:expr) => {
        const {
            $crate::math::GreaterThanOne::new($value)
                .expect("the literal is finite and greater than one")
        }
    };
}
#[cfg(test)]
pub(crate) use greater_than_one;

/// Validates a unit-fraction literal at compile time.
///
/// The expansion is a `const` block over [`UnitFraction::new`], so a literal outside the domain
/// fails the build instead of a test run. Runtime values keep the checked constructor.
#[cfg(test)]
macro_rules! unit_fraction {
    ($value:expr) => {
        const { $crate::math::UnitFraction::new($value).expect("the literal lies in [0, 1]") }
    };
}
#[cfg(test)]
pub(crate) use unit_fraction;

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
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
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

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }
}

/// A finite, non-negative `f32`, valid by construction.
///
/// The shared definition of the finite-and-non-negative check. Zero passes, so the type carries
/// magnitudes and weights that may legitimately switch a term off.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(NonNegative::new(0.0).expect("zero is admitted").get(), 0.0);
/// assert_eq!(NonNegative::new(-0.5), None);
/// assert_eq!(NonNegative::new(f32::INFINITY), None);
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    PartialOrd,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct NonNegative(f32);

impl NonNegative {
    /// The value one.
    pub(crate) const ONE: Self = Self(1.0);
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a non-negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and at least zero.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }
}

impl From<Positive> for NonNegative {
    /// Widens into the enclosing domain: every positive value is non-negative.
    #[inline]
    fn from(value: Positive) -> Self {
        Self(value.get())
    }
}

impl serde::Serialize for NonNegative {
    /// Serializes as the plain number.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for NonNegative {
    /// Deserializes a plain number, refusing values outside the finite non-negative range.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = f32::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Float(f64::from(value)),
                &"a finite non-negative number",
            )
        })
    }
}

/// A finite, strictly positive `f64`, valid by construction.
///
/// The double-precision twin of [`Positive`], named as [`DVecN`](super::DVecN) is to
/// [`VecN`](super::VecN): configuration fields that steer double-precision arithmetic carry their
/// domain in the type, and the consuming site validates nothing.
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
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct DPositive(f64);

impl DPositive {
    /// The value one.
    pub const ONE: Self = Self(1.0);

    /// Validates a strictly positive finite value.
    ///
    /// Returns [`None`] unless the value is finite and greater than zero.
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }
}

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
#[derive(Debug, Copy, Clone)]
#[repr(transparent)]
pub(crate) struct DNonNegative(f64);

impl DNonNegative {
    /// The value zero.
    pub(crate) const ZERO: Self = Self(0.0);

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

impl core::ops::Sub for DNonNegative {
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

impl From<DPositive> for DNonNegative {
    /// Widens into the enclosing domain: every positive value is non-negative.
    #[inline]
    fn from(value: DPositive) -> Self {
        Self(value.get())
    }
}

/// A finite `f64` strictly greater than one, valid by construction.
///
/// Growth and expansion factors whose semantics require actual growth - a factor of one never
/// expands - carry the bound in the type.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(
///     GreaterThanOne::new(2.0).expect("doubling expands").get(),
///     2.0
/// );
/// assert_eq!(GreaterThanOne::new(1.0), None);
/// assert_eq!(GreaterThanOne::new(f64::INFINITY), None);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub(crate) struct GreaterThanOne(f64);

impl GreaterThanOne {
    /// Validates a finite value strictly greater than one.
    ///
    /// Returns [`None`] unless the value is finite and greater than one.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value > 1.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

/// A power-of-two exponent below the `u64` shift width, valid by construction.
///
/// Configuration fields named `*_log2` carry this type instead of a raw `u8`. Shifting a `u64` by
/// 64 or more panics in debug builds and masks in release, so the constructor checks the bound and
/// the shifting site validates nothing.
///
/// # Examples
///
/// ```ignore
/// let span = Log2::new(6).expect("6 lies below the shift width");
/// assert_eq!(span.get(), 6);
/// assert_eq!(1_u64 << span.get(), 64);
///
/// // A hostile document's 200 refuses construction instead of panicking a later shift.
/// assert_eq!(Log2::new(200), None);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Log2(u8);

impl Log2 {
    /// Validates a shift exponent.
    ///
    /// Returns [`None`] unless the value lies below the `u64` shift width: 64 and above have no
    /// in-range power of two, and shifting by them panics in debug builds and masks in release.
    #[inline]
    #[must_use]
    pub const fn new(value: u8) -> Option<Self> {
        if u32::from(value) >= u64::BITS {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the exponent.
    #[inline]
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

/// Computes `ln(1 + exp(value))` in a numerically stable form.
///
/// The evaluation uses `max(value, 0) + ln_1p(exp(-|value|))`, which keeps the intermediate
/// exponent non-positive: the result is finite for every finite input, approaching `value` itself
/// for large positive inputs and `0` for large negative inputs. The output is non-negative and
/// satisfies `softplus(value) - softplus(-value) == value` up to rounding.
///
/// # Examples
///
/// ```ignore
/// // A naive `exp(50.0)` loses the asymptote. The stable form is exact.
/// assert_eq!(softplus(50.0), 50.0);
/// assert!(softplus(-50.0) < 1e-20);
/// assert!((softplus(0.0) - core::f32::consts::LN_2).abs() < 1e-7);
/// ```
#[inline]
#[must_use]
pub(crate) fn softplus(value: f32) -> f32 {
    value.max(0.0) + (-value.abs()).exp().ln_1p()
}

/// Computes the logistic function `1 / (1 + exp(-value))`.
///
/// The evaluation feeds the negated magnitude to `exp`, keeping the intermediate exponent
/// non-positive: the result is finite for every input, lies in `(0, 1)` for finite inputs, and
/// satisfies `sigmoid(-value) == 1 - sigmoid(value)` up to rounding. The sigmoid is the first
/// derivative of [`softplus`].
///
/// # Examples
///
/// ```ignore
/// assert_eq!(sigmoid(0.0), 0.5);
/// // A naive `exp(200.0)` overflows. The stable form saturates.
/// assert_eq!(sigmoid(200.0), 1.0);
/// assert!(sigmoid(-200.0) < 1e-30);
/// ```
#[inline]
#[must_use]
pub(crate) fn sigmoid(value: f32) -> f32 {
    let bounded = (-value.abs()).exp();
    if value >= 0.0 {
        (1.0 + bounded).recip()
    } else {
        // The direct ratio keeps relative precision where the
        // complement `1 - 1/(1 + bounded)` would round to zero.
        bounded / (1.0 + bounded)
    }
}

/// Computes the Huber penalty, quadratic below the threshold and linear above.
///
/// For `value ≤ threshold` the penalty is `value · value / 2`. Above the threshold it continues
/// along the tangent line `threshold · (value - threshold / 2)`. Both branches meet at `threshold ·
/// threshold / 2` with matching first derivative `threshold`, so the penalty is continuous with a
/// continuous first derivative at the threshold. The comparison uses the signed value, and callers
/// pass non-negative magnitudes such as norms or distances.
///
/// # Examples
///
/// ```ignore
/// // Quadratic regime: 0.5 · 0.5 · 0.5.
/// assert_eq!(huber(0.5, 1.0), 0.125);
/// // Linear regime: 1.0 · (3.0 - 0.5).
/// assert_eq!(huber(3.0, 1.0), 2.5);
/// ```
#[inline]
#[must_use]
pub(crate) fn huber(value: f32, threshold: f32) -> f32 {
    if value <= threshold {
        0.5 * value * value
    } else {
        threshold.mul_add(-0.5, value) * threshold
    }
}

/// Narrows an `f64` to `f32`, permitting rounding.
///
/// This converts with round-to-nearest and returns the result whenever it is finite. Inputs whose
/// magnitude exceeds the `f32` range, the infinities, and NaN all yield [`None`]. Negative zero
/// narrows to negative zero, preserving the sign bit.
///
/// For a conversion that also demands bit-exact representability, use [`narrow_f32_exact`].
///
/// # Examples
///
/// ```ignore
/// // Rounds to the nearest `f32`.
/// assert_eq!(narrow_f32(0.1), Some(0.1_f32));
/// // Beyond the `f32` range.
/// assert_eq!(narrow_f32(1e300), None);
/// assert_eq!(narrow_f32(f64::NAN), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  finiteness before being returned"
    )]
    let narrowed = value as f32;

    if narrowed.is_finite() {
        Some(narrowed)
    } else {
        None
    }
}

/// Narrows an `f64` to `f32` when the value is exactly representable.
///
/// The conversion succeeds precisely when the input is finite and widening the narrowed result back
/// to `f64` reproduces the input bit for bit; the returned `f32` therefore denotes the same real
/// number as the input. Values that would round, overflow the `f32` range, or fail to be finite
/// yield [`None`]. Negative zero is exactly representable and keeps its sign bit.
///
/// For a conversion that tolerates rounding, use [`narrow_f32`].
///
/// # Examples
///
/// ```ignore
/// assert_eq!(narrow_f32_exact(0.25), Some(0.25_f32));
/// // 0.1 has no exact `f32` representation.
/// assert_eq!(narrow_f32_exact(0.1), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32_exact(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  bit-exact round-tripping before being returned"
    )]
    let narrowed = value as f32;
    // `f64::from` is not callable in const contexts; the widening cast is
    // lossless.
    let widened = narrowed as f64;

    if narrowed.is_finite() && widened.to_bits() == value.to_bits() {
        Some(narrowed)
    } else {
        None
    }
}
