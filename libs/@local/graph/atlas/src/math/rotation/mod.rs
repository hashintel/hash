//! Rotations about the origin, stored in decomposed form.

use core::simd::Simd;

use super::{
    kernel::mul_add_f32x4,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// A rotation about the origin, stored as the unit vector `(cos, sin)`.
///
/// The decomposed representation is the contract of this type: the angle's cosine and sine are
/// computed once (or supplied directly) and every subsequent operation is plain arithmetic on them.
/// Composing two rotations via [`then`](Self::then) multiplies the unit vectors, which adds the
/// angles without any trigonometric calls, and [`inverse`](Self::inverse) negates the sine, which
/// is exact: no rounding occurs at all.
///
/// Angles follow the mathematical convention: radians, counterclockwise, with `x` growing right and
/// `y` growing up. In a `y`-down space (such as screen coordinates) the visual direction of
/// rotation is reversed.
///
/// Note that long chains of [`then`](Self::then) accumulate rounding in the stored vector, letting
/// it drift off the unit circle by roughly one unit in the last place per composition. Call
/// [`renormalize`](Self::renormalize) periodically when composing rotations incrementally; the
/// angle is unaffected, only the vector's length is corrected.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Rotation, Vec2};
///
/// let eighth = Rotation::from_radians(core::f32::consts::FRAC_PI_4);
/// let quarter = eighth.then(eighth);
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
pub struct Rotation(Vec2);

impl Rotation {
    /// The rotation by zero radians.
    pub const IDENTITY: Self = Self(Vec2::new(1.0, 0.0));

    /// Creates a rotation from an angle in radians.
    ///
    /// This is the only constructor that calls into trigonometry; the resulting cosine and sine are
    /// reused by every later operation.
    #[inline]
    #[must_use]
    pub fn from_radians(radians: f32) -> Self {
        let (sin, cos) = radians.sin_cos();

        Self(Vec2::new(cos, sin))
    }

    /// Creates a rotation directly from its cosine and sine.
    ///
    /// The pair must lie on the unit circle: `cos * cos + sin * sin == 1` up to rounding. This is
    /// useful when the pair is already available, for example from normalizing a direction vector,
    /// and avoids round-tripping through an angle.
    #[inline]
    #[must_use]
    pub const fn from_cos_sin(cos: f32, sin: f32) -> Self {
        Self(Vec2::new(cos, sin))
    }

    /// Returns the cosine of the rotation angle.
    #[inline]
    #[must_use]
    pub const fn cos(self) -> f32 {
        self.0.x()
    }

    /// Returns the sine of the rotation angle.
    #[inline]
    #[must_use]
    pub const fn sin(self) -> f32 {
        self.0.y()
    }

    /// Returns the rotation angle in radians, in `(-pi, pi]`.
    #[inline]
    #[must_use]
    pub fn radians(self) -> f32 {
        self.sin().atan2(self.cos())
    }

    /// Returns the rotation equivalent to applying `self` first, then `next`.
    ///
    /// Rotations commute, so the order only matters for consistency with the other transform types.
    /// The composition adds the two angles by multiplying the stored unit vectors; no trigonometric
    /// calls occur.
    #[inline]
    #[must_use]
    pub const fn then(self, next: Self) -> Self {
        Self(Vec2::new(
            self.cos() * next.cos() - self.sin() * next.sin(),
            self.sin() * next.cos() + self.cos() * next.sin(),
        ))
    }

    /// Rescales the stored vector back onto the unit circle.
    ///
    /// Composition accumulates rounding in the vector's length at roughly one unit in the last
    /// place per [`then`](Self::then); a drifted length scales every vector passed to
    /// [`apply`](Self::apply) by that factor. Renormalizing divides the drift out at the cost of
    /// one square root, leaving the angle unchanged up to rounding. Calling it once every few
    /// hundred compositions keeps the error invisible in `f32`.
    #[inline]
    #[must_use]
    pub fn renormalize(self) -> Self {
        let scale = self
            .sin()
            .mul_add(self.sin(), self.cos() * self.cos())
            .sqrt()
            .recip();

        Self(Vec2::new(self.cos() * scale, self.sin() * scale))
    }

    /// Returns the rotation by the negated angle.
    ///
    /// This negates the stored sine, which is exact: applying a rotation and then its inverse
    /// reproduces the rounding of the forward and backward applications only, never of the
    /// inversion itself.
    #[inline]
    #[must_use]
    pub const fn inverse(self) -> Self {
        Self(Vec2::new(self.cos(), -self.sin()))
    }

    /// Rotates a single vector about the origin.
    #[inline]
    #[must_use]
    pub const fn apply(self, vec: Vec2) -> Vec2 {
        Vec2::new(
            self.cos() * vec.x() - self.sin() * vec.y(),
            self.sin() * vec.x() + self.cos() * vec.y(),
        )
    }

    /// Rotates four vectors at once, entirely in SIMD registers.
    ///
    /// On targets with native FMA the results can differ from [`apply`](Self::apply) by up to one
    /// unit in the last place, because the fused operations round once instead of twice.
    #[inline]
    #[must_use]
    pub fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let xs = batch.xs();
        let ys = batch.ys();

        Vec2x4T::from_lanes(
            mul_add_f32x4(ys, Simd::splat(-self.sin()), xs * Simd::splat(self.cos())),
            mul_add_f32x4(ys, Simd::splat(self.cos()), xs * Simd::splat(self.sin())),
        )
    }
}
