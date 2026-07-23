//! Numerically stable scalar special functions with validated domains.
//!
//! Checked float narrowing rides beside them.
//!
//! These formalize numeric patterns that recur across the crate: a stable softplus and the Huber
//! penalty for layout losses, checked `f64` to `f32` narrowing for persisted coordinates, and
//! [`UnitFraction`], the construction-validated `[0, 1]` scalar of configuration fields. Vector
//! reductions such as softmax and log-sum-exp live on [`DVecN`](super::DVecN).
#[cfg(test)]
mod tests;

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
/// ```
/// use hash_graph_atlas::math::Positive;
///
/// assert_eq!(Positive::new(2.5).expect("2.5 is positive").get(), 2.5);
/// assert_eq!(Positive::new(0.0), None);
/// assert_eq!(Positive::new(f32::NAN), None);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct Positive(f32);

impl Positive {
    /// The value one.
    pub const ONE: Self = Self(1.0);

    /// Validates a strictly positive finite value.
    ///
    /// Returns [`None`] unless the value is finite and greater than zero.
    #[inline]
    #[must_use]
    pub const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f32 {
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

/// A finite, non-negative `f32`, valid by construction.
///
/// The shared definition of the finite-and-non-negative check: zero is admitted, so the type
/// carries magnitudes and weights that may legitimately switch a term off.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::NonNegative;
///
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
pub struct NonNegative(f32);

impl NonNegative {
    /// The value one.
    pub const ONE: Self = Self(1.0);
    /// The value zero.
    pub const ZERO: Self = Self(0.0);

    /// Validates a non-negative finite value.
    ///
    /// Returns [`None`] unless the value is finite and at least zero.
    #[inline]
    #[must_use]
    pub const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the value.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f32 {
        self.0
    }
}

/// A finite fraction in `[0, 1]`, valid by construction.
///
/// Configuration fields whose domain is the closed unit interval carry this type instead of a raw
/// float, so an options value that exists is valid and the consuming stage validates nothing.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::UnitFraction;
///
/// let quarter = UnitFraction::new(0.25).expect("0.25 lies inside [0, 1]");
/// assert_eq!(quarter.get(), 0.25);
///
/// assert_eq!(UnitFraction::new(1.5), None);
/// assert_eq!(UnitFraction::new(f64::NAN), None);
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
pub struct UnitFraction(f64);

impl UnitFraction {
    /// The fraction one.
    pub const ONE: Self = Self(1.0);
    /// The fraction zero.
    pub const ZERO: Self = Self(0.0);

    /// Validates a fraction.
    ///
    /// Returns [`None`] unless the value is finite and lies in `[0, 1]`.
    #[inline]
    #[must_use]
    pub const fn new(value: f64) -> Option<Self> {
        if !(value >= 0.0 && value <= 1.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Wraps a fraction the caller proves lies in `[0, 1]`.
    ///
    /// The check is a debug assertion: release builds trust the caller's proof.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::UnitFraction;
    ///
    /// let preserved = 3_u32;
    /// let total = 4_u32;
    /// // A count over its own total cannot leave [0, 1].
    /// let fraction = UnitFraction::new_unchecked(f64::from(preserved) / f64::from(total));
    /// assert_eq!(fraction.get(), 0.75);
    /// ```
    // Not `unsafe`: no unsafe code trusts the range, so a broken promise is a
    // wrong fraction, not UB.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: f64) -> Self {
        debug_assert!(
            value >= 0.0 && value <= 1.0,
            "the caller promised a value inside [0, 1]",
        );
        Self(value)
    }

    /// Returns the fraction.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }
}

/// A power-of-two exponent below the `u64` shift width, valid by construction.
///
/// Configuration fields named `*_log2` carry this type instead of a raw `u8`: shifting a `u64` by
/// 64 or more panics in debug builds and masks in release, so the bound is checked where the
/// value is constructed and the shifting site validates nothing.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::Log2;
///
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
/// ```
/// use hash_graph_atlas::math::softplus;
///
/// // A naive `exp(50.0)` loses the asymptote; the stable form is exact.
/// assert_eq!(softplus(50.0), 50.0);
/// assert!(softplus(-50.0) < 1e-20);
/// assert!((softplus(0.0) - core::f32::consts::LN_2).abs() < 1e-7);
/// ```
#[inline]
#[must_use]
pub fn softplus(value: f32) -> f32 {
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
/// ```
/// use hash_graph_atlas::math::sigmoid;
///
/// assert_eq!(sigmoid(0.0), 0.5);
/// // A naive `exp(200.0)` overflows; the stable form saturates.
/// assert_eq!(sigmoid(200.0), 1.0);
/// assert!(sigmoid(-200.0) < 1e-30);
/// ```
#[inline]
#[must_use]
pub fn sigmoid(value: f32) -> f32 {
    let bounded = (-value.abs()).exp();
    if value >= 0.0 {
        (1.0 + bounded).recip()
    } else {
        // The direct ratio keeps relative precision where the
        // complement `1 - 1/(1 + bounded)` would round to zero.
        bounded / (1.0 + bounded)
    }
}

/// Computes the Huber penalty: quadratic below the threshold, linear above.
///
/// For `value ≤ threshold` the penalty is `value · value / 2`; above the threshold it continues
/// along the tangent line `threshold · (value - threshold / 2)`. The two pieces meet at
/// `threshold · threshold / 2` with matching first derivative `threshold`, so the penalty is
/// continuous with a continuous first derivative at the threshold. The comparison is signed;
/// callers pass non-negative magnitudes such as norms or distances.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::huber;
///
/// // Quadratic regime: 0.5 · 0.5 · 0.5.
/// assert_eq!(huber(0.5, 1.0), 0.125);
/// // Linear regime: 1.0 · (3.0 - 0.5).
/// assert_eq!(huber(3.0, 1.0), 2.5);
/// ```
#[inline]
#[must_use]
pub fn huber(value: f32, threshold: f32) -> f32 {
    if value <= threshold {
        0.5 * value * value
    } else {
        threshold.mul_add(-0.5, value) * threshold
    }
}

/// Narrows an `f64` to `f32`, permitting rounding.
///
/// The value is converted with round-to-nearest and returned whenever the result is finite. Inputs
/// whose magnitude exceeds the `f32` range, the infinities, and NaN all yield [`None`]. Negative
/// zero narrows to negative zero, preserving the sign bit.
///
/// For a conversion that also demands bit-exact representability, use [`narrow_f32_exact`].
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::narrow_f32;
///
/// // Rounds to the nearest `f32`.
/// assert_eq!(narrow_f32(0.1), Some(0.1_f32));
/// // Beyond the `f32` range.
/// assert_eq!(narrow_f32(1e300), None);
/// assert_eq!(narrow_f32(f64::NAN), None);
/// ```
#[inline]
#[must_use]
pub const fn narrow_f32(value: f64) -> Option<f32> {
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
/// ```
/// use hash_graph_atlas::math::narrow_f32_exact;
///
/// assert_eq!(narrow_f32_exact(0.25), Some(0.25_f32));
/// // 0.1 has no exact `f32` representation.
/// assert_eq!(narrow_f32_exact(0.1), None);
/// ```
#[inline]
#[must_use]
pub const fn narrow_f32_exact(value: f64) -> Option<f32> {
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
