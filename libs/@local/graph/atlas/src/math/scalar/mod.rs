//! Numerically stable scalar special functions, checked float narrowing,
//! and validated scalar domains.
//!
//! These formalize numeric patterns that recur across the crate: a stable
//! softplus and the Huber penalty for layout losses, checked `f64` to
//! `f32` narrowing for persisted coordinates, and [`UnitFraction`], the
//! construction-validated `[0, 1]` scalar of configuration fields. Vector
//! reductions such as softmax and log-sum-exp live on
//! [`DVecN`](super::DVecN).
#[cfg(test)]
mod tests;

/// A finite fraction in `[0, 1]`, valid by construction.
///
/// Configuration fields whose domain is the closed unit interval carry
/// this type instead of a raw float, so an options value that exists is
/// valid and the consuming stage validates nothing.
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
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
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

    /// Returns the fraction.
    #[inline]
    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }
}

/// Computes `ln(1 + exp(value))` in a numerically stable form.
///
/// The evaluation uses `max(value, 0) + ln_1p(exp(-|value|))`, which keeps
/// the intermediate exponent non-positive: the result is finite for every
/// finite input, approaching `value` itself for large positive inputs and
/// `0` for large negative inputs. The output is non-negative and satisfies
/// `softplus(value) - softplus(-value) == value` up to rounding.
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

/// Computes the Huber penalty: quadratic below the threshold, linear above.
///
/// For `value <= threshold` the penalty is `value * value / 2`; above the
/// threshold it continues along the tangent line
/// `threshold * (value - threshold / 2)`. The two pieces meet at
/// `threshold * threshold / 2` with matching first derivative `threshold`,
/// so the penalty is continuous with a continuous first derivative at the
/// threshold. The comparison is signed; callers pass non-negative
/// magnitudes such as norms or distances.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::huber;
///
/// // Quadratic regime: 0.5 * 0.5 * 0.5.
/// assert_eq!(huber(0.5, 1.0), 0.125);
/// // Linear regime: 1.0 * (3.0 - 0.5).
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
/// The value is converted with round-to-nearest and returned whenever the
/// result is finite. Inputs whose magnitude exceeds the `f32` range, the
/// infinities, and NaN all yield [`None`]. Negative zero narrows to
/// negative zero, preserving the sign bit.
///
/// For a conversion that also demands bit-exact representability, use
/// [`narrow_f32_exact`].
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
/// The conversion succeeds precisely when the input is finite and widening
/// the narrowed result back to `f64` reproduces the input bit for bit; the
/// returned `f32` therefore denotes the same real number as the input.
/// Values that would round, overflow the `f32` range, or fail to be finite
/// yield [`None`]. Negative zero is exactly representable and keeps its
/// sign bit.
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
