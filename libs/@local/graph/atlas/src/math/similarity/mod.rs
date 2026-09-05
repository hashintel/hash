//! Orientation-preserving similarities: uniform scale, rotation, and translation.
//!
//! A similarity is the transform family produced by Procrustes alignment: it changes size,
//! orientation, and position while preserving every angle and every length ratio, so aligned
//! layouts keep their shape. [`Similarity`] restricts [`Transform`] to exactly this family, which
//! buys a guarantee the general type gives up, a total inverse. An affine map can collapse an
//! axis and lose its inverse. A similarity's scale is positive by construction, so every
//! similarity inverts.
//!
//! Use [`Similarity`] for a value that is a rigid motion plus uniform scaling (such as aligning one
//! generation's layout onto the previous one). Widen to [`Transform`] (via [`From`]) only when
//! composing with general affine maps.

use core::simd::Simd;

use super::{
    Positive,
    kernel::mul_add_f32x4,
    positive,
    rotation::Rotation,
    transform::Transform,
    vec2::{Vec2, Vec2x4T},
};

mod fit;
mod residual;

#[cfg(test)]
mod tests;

/// An orientation-preserving similarity of 2D space: uniform scale, rotation, and translation.
///
/// A similarity maps a vector `p` to `scale · R · p + translation`, where `R` is the rotation's
/// matrix. It scales lengths uniformly and preserves every angle, so shapes keep their proportions
/// and their winding direction.
///
/// The scale of every value and its reciprocal are both strictly positive normal numbers:
/// [`new`](Self::new) and [`from_array`](Self::from_array) return [`None`] for anything else.
/// Reciprocals of accepted scales are themselves accepted, so every similarity's inverse is
/// again a lawful similarity.
///
/// Obtain one from weighted point correspondences with [`fit`](Self::fit), the closed-form
/// Procrustes alignment, or with [`fit_par`](Self::fit_par) when the pairs number in the hundreds
/// of thousands. Apply one to a single vector with [`apply`](Self::apply). A similarity widens
/// losslessly into a [`Transform`] via [`From`], so it composes with general affine transforms
/// through [`Transform::then`].
///
/// The coefficients persist in the order `[scale, cos, sin, x, y]`, the layout
/// [`from_array`](Self::from_array) reads.
///
/// # Examples
///
/// ```ignore
/// // Double the size, quarter-turn counterclockwise, then move right.
/// let similarity =
///     Similarity::new(positive!(2.0), Rotation::from_cos_sin(0.0, 1.0), Vec2::new(10.0, 0.0))
///         .expect("scale is normal and positive");
///
/// assert_eq!(similarity.apply(Vec2::new(3.0, 4.0)), Vec2::new(2.0, 6.0));
/// ```
// No `FromBytes` and no `FromZeros`: byte-level construction could mint a
// zero, negative, subnormal, or non-finite scale in safe code, bypassing
// the validating constructors that keep `inverse` total.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
pub(crate) struct Similarity {
    scale: Positive,
    rotation: Rotation,
    translation: Vec2,
}

impl Similarity {
    /// The similarity that maps every vector to itself.
    pub(crate) const IDENTITY: Self = Self {
        scale: positive!(1.0),
        rotation: Rotation::IDENTITY,
        translation: Vec2::ZERO,
    };

    /// Creates a similarity from its scale, rotation, and translation.
    ///
    /// Returns [`None`] unless `scale` and its reciprocal are both strictly positive normal
    /// numbers, which accepts magnitudes from [`f32::MIN_POSITIVE`] up to about `8.5e37`. The
    /// reciprocal bound keeps inversion closed, because reciprocals of accepted scales are
    /// themselves accepted.
    #[inline]
    #[must_use]
    pub(crate) const fn new(
        scale: Positive,
        rotation: Rotation,
        translation: Vec2,
    ) -> Option<Self> {
        if !scale.is_normal() || !(1.0 / scale.get()).is_normal() {
            return None;
        }

        Some(Self {
            scale,
            rotation,
            translation,
        })
    }

    /// Returns the uniform scale factor.
    #[inline]
    #[must_use]
    pub(crate) const fn scale(self) -> Positive {
        self.scale
    }

    /// Returns the rotation about the origin.
    #[inline]
    #[must_use]
    pub(crate) const fn rotation(self) -> Rotation {
        self.rotation
    }

    /// Returns the translation applied after scale and rotation.
    #[inline]
    #[must_use]
    pub(crate) const fn translation(self) -> Vec2 {
        self.translation
    }

    /// Returns the similarity equivalent to applying `self` first, then `next`.
    ///
    /// This reads in application order. The scales multiply, the rotations compose via
    /// [`Rotation::then`], and `next` transforms `self`'s translation.
    ///
    /// Returns [`None`] when the product of the scales leaves the range [`new`](Self::new) accepts.
    /// Two accepted f32 scales can overflow to infinity or underflow past the normal range, so
    /// composition is not closed and the revalidation is what upholds the type's invariant.
    #[inline]
    #[must_use]
    pub(crate) const fn then(self, next: Self) -> Option<Self> {
        let moved = next.rotation.apply(self.translation);
        let scale = self.scale.checked_mul(next.scale)?;

        Self::new(
            scale,
            self.rotation.then(next.rotation),
            Vec2::new(
                next.scale * moved.x() + next.translation.x(),
                next.scale * moved.y() + next.translation.y(),
            ),
        )
    }

    /// Returns the similarity that undoes `self`.
    ///
    /// [`new`](Self::new) admits only scales whose reciprocal is also normal, so the inverse's
    /// scale satisfies the same invariant and inversion is total: applying a similarity and then
    /// its inverse reproduces the input up to floating-point rounding.
    #[inline]
    #[must_use]
    pub(crate) const fn inverse(self) -> Self {
        // In domain with no check: `new` admits only scales whose reciprocal is also normal.
        let inverse_scale = self.scale.recip();
        let rotation = self.rotation.inverse();
        let moved = rotation.apply(self.translation);

        Self {
            scale: inverse_scale,
            rotation,
            translation: Vec2::new(-(inverse_scale * moved.x()), -(inverse_scale * moved.y())),
        }
    }

    /// Transforms a single vector.
    ///
    /// This rotates the vector about the origin, then scales it uniformly and moves it by the
    /// translation.
    #[inline]
    #[must_use]
    pub(crate) const fn apply(self, vec: Vec2) -> Vec2 {
        let rotated = self.rotation.apply(vec);

        Vec2::new(
            self.scale * rotated.x() + self.translation.x(),
            self.scale * rotated.y() + self.translation.y(),
        )
    }

    /// Transforms four vectors at once, entirely in SIMD registers.
    ///
    /// This folds the scale into the rotation coefficients, so each axis is two fused multiply-adds
    /// over the batch's lane groups with no shuffles. On targets with native FMA those fused
    /// operations round once where [`apply`](Self::apply) rounds after each multiply and each add.
    /// Results differ by at most a few units in the last place of the intermediate terms, and by
    /// many units in the last place of the result itself where the terms cancel.
    #[inline]
    #[must_use]
    pub(crate) fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let scaled_cos = self.scale * self.rotation.cos();
        let scaled_sin = self.scale * self.rotation.sin();
        let (xs, ys) = batch.into_lanes();

        Vec2x4T::from_lanes(
            mul_add_f32x4(
                xs,
                Simd::splat(scaled_cos),
                mul_add_f32x4(
                    ys,
                    Simd::splat(-scaled_sin),
                    Simd::splat(self.translation.x()),
                ),
            ),
            mul_add_f32x4(
                xs,
                Simd::splat(scaled_sin),
                mul_add_f32x4(
                    ys,
                    Simd::splat(scaled_cos),
                    Simd::splat(self.translation.y()),
                ),
            ),
        )
    }

    /// Decomposes the similarity into its five coefficients.
    ///
    /// The order is `[scale, cos, sin, x, y]`: the uniform scale, the rotation's cosine and sine,
    /// and the translation's components. The array round-trips through
    /// [`from_array`](Self::from_array) bit for bit.
    #[inline]
    #[must_use]
    pub(crate) const fn to_array(self) -> [f32; 5] {
        [
            self.scale.get(),
            self.rotation.cos(),
            self.rotation.sin(),
            self.translation.x(),
            self.translation.y(),
        ]
    }

    /// Creates a similarity from its five coefficients.
    ///
    /// This reads the array as `[scale, cos, sin, x, y]`, the persisted coefficient layout. The
    /// caller keeps the cosine and sine on the unit circle up to rounding, matching
    /// the contract of [`Rotation::from_cos_sin`].
    ///
    /// Returns [`None`] unless the scale lies in the range [`new`](Self::new) accepts.
    #[inline]
    #[must_use]
    pub(crate) const fn from_array(
        [scale, cos, sin, translation_x, translation_y]: [f32; 5],
    ) -> Option<Self> {
        Self::new(
            Positive::new(scale)?,
            Rotation::from_cos_sin(cos, sin),
            Vec2::new(translation_x, translation_y),
        )
    }
}

const impl From<Similarity> for Transform {
    #[inline]
    fn from(similarity: Similarity) -> Self {
        let scaled_cos = similarity.scale * similarity.rotation.cos();
        let scaled_sin = similarity.scale * similarity.rotation.sin();

        Self::from_cols(
            Vec2::new(scaled_cos, scaled_sin),
            Vec2::new(-scaled_sin, scaled_cos),
            similarity.translation,
        )
    }
}
