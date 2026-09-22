//! General affine maps for composition, application and least-squares alignment.

use core::simd::Simd;

use super::{
    kernel::mul_add_f32x4,
    rotation::Rotation,
    translation::Translation,
    vec2::{Vec2, Vec2x4T},
};

mod fit;
#[cfg(test)]
mod tests;

/// An affine map of 2D space, including shear, reflection and axis collapse.
///
/// A transform maps a vector `p` to `x_axis · p.x + y_axis · p.y + translation`, where `x_axis` and
/// `y_axis` are the columns of a 2x2 linear part. In the usual 3x3 homogeneous matrix, the six
/// stored coefficients form the first two rows and the constant bottom row is `[0 0 1]`. This model
/// includes anisotropic scale, shear and reflection. A singular linear part can collapse lines or
/// the whole plane. Coefficients accept arbitrary `f32` values, and application rounds and can
/// overflow.
///
/// Build transforms from the constructors ([`from_scale`](Self::from_scale),
/// [`from_rotation`](Self::from_rotation), [`from_translation`](Self::from_translation), or
/// [`from_cols`](Self::from_cols) for the general case) and combine them with [`then`](Self::then),
/// which reads in application order. Apply a transform to a single vector with
/// [`apply`](Self::apply) or to a whole [`Vec2x4T`] batch with [`apply_x4`](Self::apply_x4).
///
/// # Example: scaling before translation
///
/// This example is ignored because [`Transform`] is crate-private.
///
/// ```ignore
/// use crate::math::{Transform, Vec2};
///
/// // Scale by 2 around the origin, then move 10 to the right.
/// let transform = Transform::from_scale(Vec2::new(2.0, 2.0))
///     .then(Transform::from_translation(Vec2::new(10.0, 0.0)));
///
/// assert_eq!(transform.apply(Vec2::new(3.0, 4.0)), Vec2::new(16.0, 8.0));
/// ```
///
/// # Example: applying a rotation
///
/// Trigonometric coefficients and application can round. Compare the result with a tolerance. This
/// example is ignored because [`Transform`] is crate-private.
///
/// ```ignore
/// use crate::math::{Rotation, Transform, Vec2};
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
pub(crate) struct Transform {
    x_axis: Vec2,
    y_axis: Vec2,
    translation: Vec2,
}

impl Transform {
    /// The identity linear map with zero translation.
    pub(crate) const IDENTITY: Self = Self::from_cols(
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, 0.0),
    );

    /// Creates a transform from its two linear columns and translation.
    ///
    /// The resulting transform maps `p` to `x_axis · p.x + y_axis · p.y + translation`.
    #[inline]
    #[must_use]
    pub(crate) const fn from_cols(x_axis: Vec2, y_axis: Vec2, translation: Vec2) -> Self {
        Self {
            x_axis,
            y_axis,
            translation,
        }
    }

    /// Creates a transform that scales each axis independently around the origin.
    #[inline]
    #[must_use]
    pub(crate) const fn from_scale(scale: Vec2) -> Self {
        Self::from_cols(
            Vec2::new(scale.x(), 0.0),
            Vec2::new(0.0, scale.y()),
            Vec2::new(0.0, 0.0),
        )
    }

    /// Creates a transform that rotates around the origin.
    #[inline]
    #[must_use]
    pub(crate) const fn from_rotation(rotation: Rotation) -> Self {
        Self::from_cols(
            Vec2::new(rotation.cos(), rotation.sin()),
            Vec2::new(-rotation.sin(), rotation.cos()),
            Vec2::new(0.0, 0.0),
        )
    }

    /// Creates an identity linear map with the given translation.
    #[inline]
    #[must_use]
    pub(crate) const fn from_translation(translation: Vec2) -> Self {
        Self::from_cols(Vec2::new(1.0, 0.0), Vec2::new(0.0, 1.0), translation)
    }

    /// Composes `self` followed by `next`.
    ///
    /// This reads in application order: `scale.then(translate)` scales before it translates. In
    /// homogeneous matrix notation the model is next · self. Coefficient rounding can make the
    /// result differ from sequential application.
    ///
    /// You can pass [`Rotation`] and [`Translation`] values directly as `next`.
    ///
    /// # Example
    ///
    /// This example is ignored because [`Transform`] is crate-private.
    ///
    /// ```ignore
    /// use crate::math::{Rotation, Transform, Vec2, translation::Translation};
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
    pub(crate) const fn then(self, next: impl [const] Into<Self>) -> Self {
        let next = next.into();

        Self::from_cols(
            next.apply_linear(self.x_axis),
            next.apply_linear(self.y_axis),
            next.apply(self.translation),
        )
    }

    /// Applies the linear part and translation with separate `f32` products and sums.
    #[inline]
    #[must_use]
    pub(crate) const fn apply(self, vec: Vec2) -> Vec2 {
        let linear = self.apply_linear(vec);

        Vec2::new(
            linear.x() + self.translation.x(),
            linear.y() + self.translation.y(),
        )
    }

    /// Applies the affine map to four vectors with SIMD arithmetic.
    ///
    /// Each axis uses two fused multiply-adds. Each fused operation rounds its product and addition
    /// once, independently of native FMA availability. Grouping and fusion differ from
    /// [`apply`](Self::apply), with no uniform result-relative ULP bound between paths, especially
    /// near cancellation or overflow.
    ///
    /// # Example
    ///
    /// This example is ignored because [`Transform`] is crate-private.
    ///
    /// ```ignore
    /// use crate::math::{Transform, Vec2, Vec2x4T};
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
    pub(crate) fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let (xs, ys) = batch.into_lanes();

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

    /// Forms an approximate inverse using the computed determinant.
    ///
    /// For a nonsingular linear part A and translation t, the inverse model is A⁻¹p − A⁻¹t. This
    /// computes A⁻¹ from its adjugate and a reciprocal determinant. Near-singular A amplifies
    /// errors, and application can already have lost information that inversion cannot recover.
    ///
    /// Returns [`None`] when the computed `f32` determinant is zero, subnormal or non-finite. This
    /// check does not establish exact invertibility: product rounding can leave a normal
    /// determinant for a singular matrix or reject an invertible matrix. Even [`Some`] can contain
    /// non-finite coefficients or translation after overflow. Use [`Rotation::inverse`] or
    /// [`Translation::inverse`] when the narrower model applies.
    ///
    /// # Example
    ///
    /// This example is ignored because [`Transform`] is crate-private.
    ///
    /// ```ignore
    /// use crate::math::{Transform, Vec2};
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
    pub(crate) fn inverse(self) -> Option<Self> {
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
            self.y_axis.x().mul_add(vec.y(), self.x_axis.x() * vec.x()),
            self.y_axis.y().mul_add(vec.y(), self.x_axis.y() * vec.x()),
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
