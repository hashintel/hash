//! Affine transformations of 2D vectors and batches of them.

use core::simd::Simd;

use super::{
    kernel::mul_add_f32x4,
    rotation::Rotation,
    translation::Translation,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// An affine transformation of 2D space: scale, rotation, and translation.
///
/// A transform maps a vector `p` to `x_axis * p.x + y_axis * p.y +
/// translation`, where `x_axis` and `y_axis` are the columns of a 2x2
/// linear part. This is the top of the usual 3x3 homogeneous matrix with
/// its constant `[0 0 1]` bottom row omitted, so a transform stores six
/// coefficients rather than nine. Perspective is intentionally out of
/// scope; every representable transform keeps parallel lines parallel.
///
/// Build transforms from the constructors ([`from_scale`](Self::from_scale),
/// [`from_rotation`](Self::from_rotation),
/// [`from_translation`](Self::from_translation), or
/// [`from_cols`](Self::from_cols) for the general case) and combine them
/// with [`then`](Self::then), which reads in application order. Apply a
/// transform to a single vector with [`apply`](Self::apply) or to a whole
/// [`Vec2x4T`] batch with [`apply_x4`](Self::apply_x4), which stays entirely
/// in SIMD registers.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Transform, Vec2};
///
/// // Scale by 2 around the origin, then move 10 to the right.
/// let transform = Transform::from_scale(Vec2::new(2.0, 2.0))
///     .then(Transform::from_translation(Vec2::new(10.0, 0.0)));
///
/// assert_eq!(transform.apply(Vec2::new(3.0, 4.0)), Vec2::new(16.0, 8.0));
/// ```
///
/// Rotations are exact only where sine and cosine are, so compare with a
/// tolerance:
///
/// ```
/// use hash_graph_atlas::math::{Rotation, Transform, Vec2};
///
/// let quarter_turn =
///     Transform::from_rotation(Rotation::from_radians(core::f32::consts::FRAC_PI_2));
/// let rotated = quarter_turn.apply(Vec2::new(1.0, 0.0));
///
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
pub struct Transform {
    x_axis: Vec2,
    y_axis: Vec2,
    translation: Vec2,
}

impl Transform {
    /// The transform that maps every vector to itself.
    pub const IDENTITY: Self = Self::from_cols(
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, 0.0),
    );

    /// Creates a transform from its two linear columns and translation.
    ///
    /// The resulting transform maps `p` to
    /// `x_axis * p.x + y_axis * p.y + translation`.
    #[inline]
    #[must_use]
    pub const fn from_cols(x_axis: Vec2, y_axis: Vec2, translation: Vec2) -> Self {
        Self {
            x_axis,
            y_axis,
            translation,
        }
    }

    /// Creates a transform that scales each axis independently around the
    /// origin.
    #[inline]
    #[must_use]
    pub const fn from_scale(scale: Vec2) -> Self {
        Self::from_cols(
            Vec2::new(scale.x(), 0.0),
            Vec2::new(0.0, scale.y()),
            Vec2::new(0.0, 0.0),
        )
    }

    /// Creates a transform that rotates around the origin.
    #[inline]
    #[must_use]
    pub const fn from_rotation(rotation: Rotation) -> Self {
        Self::from_cols(
            Vec2::new(rotation.cos(), rotation.sin()),
            Vec2::new(-rotation.sin(), rotation.cos()),
            Vec2::new(0.0, 0.0),
        )
    }

    /// Creates a transform that moves every vector by `translation`.
    #[inline]
    #[must_use]
    pub const fn from_translation(translation: Vec2) -> Self {
        Self::from_cols(Vec2::new(1.0, 0.0), Vec2::new(0.0, 1.0), translation)
    }

    /// Returns the transform equivalent to applying `self` first, then
    /// `next`.
    ///
    /// This reads in application order: `scale.then(translate)` scales
    /// before it translates. In matrix notation the result is
    /// `next * self`.
    ///
    /// `next` is anything convertible into a transform, so [`Rotation`]
    /// and [`Translation`] values compose directly without widening at the
    /// call site.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Rotation, Transform, Translation, Vec2};
    ///
    /// let transform = Transform::from_scale(Vec2::new(2.0, 2.0))
    ///     .then(Translation::new(10.0, 0.0))
    ///     .then(Rotation::from_radians(core::f32::consts::PI));
    ///
    /// let moved = transform.apply(Vec2::new(3.0, 4.0));
    /// assert!((moved.x() - -16.0).abs() < 1e-5);
    /// assert!((moved.y() - -8.0).abs() < 1e-5);
    /// ```
    #[inline]
    #[must_use]
    pub const fn then(self, next: impl [const] Into<Self>) -> Self {
        let next = next.into();

        Self::from_cols(
            next.apply_linear(self.x_axis),
            next.apply_linear(self.y_axis),
            next.apply(self.translation),
        )
    }

    /// Transforms a single vector.
    #[inline]
    #[must_use]
    pub const fn apply(self, vec: Vec2) -> Vec2 {
        let linear = self.apply_linear(vec);

        Vec2::new(
            linear.x() + self.translation.x(),
            linear.y() + self.translation.y(),
        )
    }

    /// Transforms four vectors at once, entirely in SIMD registers.
    ///
    /// Each coefficient is splat across a [`Simd<f32, 4>`](Simd) lane group
    /// and combined with the batch's axis groups, so the whole
    /// transformation is two fused multiply-adds per axis with no shuffles.
    /// Transform batches in the [`Vec2x4T`] layout inside hot loops.
    ///
    /// On targets with native FMA the per-axis results are computed with a
    /// single rounding per multiply-add, so they can differ from
    /// [`apply`](Self::apply) by up to one unit in the last place.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Transform, Vec2, Vec2x4T};
    ///
    /// let batch = Vec2x4T::from([
    ///     Vec2::new(1.0, 1.0),
    ///     Vec2::new(2.0, 1.0),
    ///     Vec2::new(3.0, 1.0),
    ///     Vec2::new(4.0, 1.0),
    /// ]);
    ///
    /// let transform = Transform::from_scale(Vec2::new(2.0, 3.0))
    ///     .then(Transform::from_translation(Vec2::new(0.5, 0.0)));
    /// let transformed = transform.apply_x4(batch);
    ///
    /// assert_eq!(transformed.get(0), Vec2::new(2.5, 3.0));
    /// assert_eq!(transformed.get(3), Vec2::new(8.5, 3.0));
    /// ```
    #[must_use]
    pub fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let xs = batch.xs();
        let ys = batch.ys();

        Vec2x4T::from_lanes(
            mul_add_f32x4(
                xs,
                Simd::splat(self.x_axis.x()),
                mul_add_f32x4(
                    ys,
                    Simd::splat(self.y_axis.x()),
                    Simd::splat(self.translation.x()),
                ),
            ),
            mul_add_f32x4(
                xs,
                Simd::splat(self.x_axis.y()),
                mul_add_f32x4(
                    ys,
                    Simd::splat(self.y_axis.y()),
                    Simd::splat(self.translation.y()),
                ),
            ),
        )
    }

    /// Returns the transform that undoes `self`, when one exists.
    ///
    /// The result maps every output of [`apply`](Self::apply) back to its
    /// input, up to floating-point rounding. The rounding grows with the
    /// condition of the linear part: a transform that nearly collapses an
    /// axis inverts with proportionally amplified error.
    ///
    /// Returns [`None`] when the determinant of the linear part is zero,
    /// subnormal, or not finite, in which case no usable inverse exists.
    /// Note that [`Rotation::inverse`] and [`Translation::inverse`] are
    /// infallible and exact; prefer them when the transform kind is known.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Transform, Vec2};
    ///
    /// let transform = Transform::from_scale(Vec2::new(2.0, 4.0))
    ///     .then(Transform::from_translation(Vec2::new(10.0, -2.0)));
    /// let inverse = transform.inverse().expect("scale is non-zero");
    ///
    /// let vec = Vec2::new(3.0, 4.0);
    /// assert_eq!(inverse.apply(transform.apply(vec)), vec);
    ///
    /// // A collapsed axis has no inverse.
    /// assert!(
    ///     Transform::from_scale(Vec2::new(0.0, 1.0))
    ///         .inverse()
    ///         .is_none()
    /// );
    /// ```
    #[must_use]
    pub fn inverse(self) -> Option<Self> {
        let determinant = self
            .y_axis
            .x()
            .mul_add(-self.x_axis.y(), self.x_axis.x() * self.y_axis.y());

        if !determinant.is_normal() {
            return None;
        }

        let inverse_determinant = determinant.recip();
        let linear = Self::from_cols(
            Vec2::new(
                self.y_axis.y() * inverse_determinant,
                -self.x_axis.y() * inverse_determinant,
            ),
            Vec2::new(
                -self.y_axis.x() * inverse_determinant,
                self.x_axis.x() * inverse_determinant,
            ),
            Vec2::new(0.0, 0.0),
        );
        let moved = linear.apply_linear(self.translation);

        Some(Self::from_cols(
            linear.x_axis,
            linear.y_axis,
            Vec2::new(-moved.x(), -moved.y()),
        ))
    }

    /// Applies only the 2x2 linear part, ignoring translation.
    #[inline]
    const fn apply_linear(self, vec: Vec2) -> Vec2 {
        Vec2::new(
            self.x_axis.x() * vec.x() + self.y_axis.x() * vec.y(),
            self.x_axis.y() * vec.x() + self.y_axis.y() * vec.y(),
        )
    }
}

const impl From<Rotation> for Transform {
    #[inline]
    fn from(rotation: Rotation) -> Self {
        Self::from_rotation(rotation)
    }
}

const impl From<Translation> for Transform {
    #[inline]
    fn from(translation: Translation) -> Self {
        Self::from_translation(translation.vector())
    }
}
