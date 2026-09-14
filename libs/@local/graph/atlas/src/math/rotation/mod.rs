//! Rotations about the origin with arithmetic composition.
//!
//! [`Rotation`] retains cosine and sine to compose rotations without recovering their angles.

use core::simd::Simd;

use super::{
    kernel::mul_add_f32x4,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// A rotation about the origin represented by approximate cosine and sine.
///
/// For stored components c and s, application uses the matrix R = [[c, −s], [s, c]]. A rotation
/// requires finite components with c² + s² ≈ 1. [`from_radians`](Self::from_radians) computes them
/// from a finite angle, and [`from_cos_sin`](Self::from_cos_sin) accepts a caller-established pair.
/// Byte construction does not validate this numerical condition.
///
/// Composition multiplies the represented complex numbers, adding their angles in real arithmetic
/// without trigonometric calls. [`inverse`](Self::inverse) conjugates the pair by exactly negating
/// its finite sine. Application and composition still round in `f32`.
///
/// Angles follow the mathematical convention: radians, counterclockwise, with `x` growing right and
/// `y` growing up. In a `y`-down space (such as screen coordinates) the visual direction of
/// rotation reverses.
///
/// Composition can accumulate error in both length and angle. [`renormalize`](Self::renormalize)
/// corrects length drift up to rounding, but cannot recover an angle lost through earlier rounding.
/// The stored pair's length scales every applied vector in the real-arithmetic model.
///
/// # Example
///
/// This example is ignored because [`Rotation`] is crate-private.
///
/// ```ignore
/// use crate::math::{Rotation, Vec2};
///
/// let quarter = Rotation::from_radians(core::f32::consts::FRAC_PI_2);
///
/// let rotated = quarter.apply(Vec2::new(1.0, 0.0));
/// assert!(rotated.x().abs() < 1e-6);
/// assert!((rotated.y() - 1.0).abs() < 1e-6);
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct Rotation(Vec2);

impl Rotation {
    /// The rotation by zero radians.
    pub(crate) const IDENTITY: Self = Self(Vec2::new(1.0, 0.0));

    /// Creates a rotation from an angle in radians.
    ///
    /// `radians` must be finite. The stored components are the approximations returned by
    /// [`f32::sin_cos`].
    #[inline]
    #[must_use]
    pub(crate) fn from_radians(radians: f32) -> Self {
        let (sin, cos) = radians.sin_cos();

        Self(Vec2::new(cos, sin))
    }

    /// Creates a rotation directly from its cosine and sine.
    ///
    /// For a rotation, `cos` and `sin` must be finite with cos² + sin² ≈ 1. This avoids recovering
    /// an angle when a normalized direction is already available. A finite non-unit pair can
    /// instead be rescaled with [`renormalize`](Self::renormalize), subject to that method's
    /// numerical conditions.
    #[inline]
    #[must_use]
    pub(crate) const fn from_cos_sin(cos: f32, sin: f32) -> Self {
        Self(Vec2::new(cos, sin))
    }

    /// Returns the stored cosine component.
    #[inline]
    #[must_use]
    pub(crate) const fn cos(self) -> f32 {
        self.0.x()
    }

    /// Returns the stored sine component.
    #[inline]
    #[must_use]
    pub(crate) const fn sin(self) -> f32 {
        self.0.y()
    }

    /// Returns the angle of the stored pair in radians.
    ///
    /// For a finite nonzero pair, [`f32::atan2`] returns an approximation in [−π, π], with either
    /// endpoint possible according to the sine's sign, including signed zero.
    #[inline]
    #[must_use]
    pub(crate) fn radians(self) -> f32 {
        self.sin().atan2(self.cos())
    }

    /// Composes `self` followed by `next`.
    ///
    /// In real arithmetic the pair is (c₁c₂ − s₁s₂, s₁c₂ + c₁s₂), and rotations commute. Rounding
    /// these products and sums in `f32` can make application of the composed pair differ from
    /// sequential application.
    #[inline]
    #[must_use]
    pub(crate) const fn then(self, next: Self) -> Self {
        Self(Vec2::new(
            self.cos() * next.cos() - self.sin() * next.sin(),
            self.sin() * next.cos() + self.cos() * next.sin(),
        ))
    }

    /// Rescales the stored pair to approximately unit length.
    ///
    /// This multiplies both components by an approximation to 1 / √(c² + s²), using one square root
    /// and reciprocal. A positive common factor preserves the pair's direction in real arithmetic.
    /// The final products round separately.
    ///
    /// The components must be finite, and the computed squared length and reciprocal length must be
    /// finite and positive. Pairs near unit length satisfy these conditions. A zero pair or an
    /// extreme non-unit pair can produce NaNs or infinities instead of a normalized rotation.
    #[inline]
    #[must_use]
    pub(crate) fn renormalize(self) -> Self {
        let scale = self
            .sin()
            .mul_add(self.sin(), self.cos() * self.cos())
            .sqrt()
            .recip();

        Self(Vec2::new(self.cos() * scale, self.sin() * scale))
    }

    /// Conjugates the stored pair to represent the negated angle.
    ///
    /// Negating a finite sine introduces no rounding.
    ///
    /// The represented matrices satisfy `RᵀR = (c² + s²)I` in real arithmetic: any length drift
    /// remains in an inverse round trip, in addition to application rounding. This is an
    /// approximate inverse for a near-unit pair.
    #[inline]
    #[must_use]
    pub(crate) const fn inverse(self) -> Self {
        Self(Vec2::new(self.cos(), -self.sin()))
    }

    /// Applies the stored rotation matrix with separate `f32` products and sums.
    #[inline]
    #[must_use]
    pub(crate) const fn apply(self, vec: Vec2) -> Vec2 {
        Vec2::new(
            self.cos() * vec.x() - self.sin() * vec.y(),
            self.sin() * vec.x() + self.cos() * vec.y(),
        )
    }

    /// Applies the stored rotation matrix to four vectors with SIMD arithmetic.
    ///
    /// Each axis uses one rounded product and one fused multiply-add. Fusion rounds its product and
    /// addition once, independently of native FMA availability. This differs from
    /// [`apply`](Self::apply)'s separate operations, especially near cancellation or overflow. No
    /// uniform result-relative ULP bound relates the two paths.
    #[inline]
    #[must_use]
    pub(crate) fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let (xs, ys) = batch.into_lanes();

        Vec2x4T::from_lanes(
            mul_add_f32x4(ys, Simd::splat(-self.sin()), xs * Simd::splat(self.cos())),
            mul_add_f32x4(ys, Simd::splat(self.cos()), xs * Simd::splat(self.sin())),
        )
    }
}
