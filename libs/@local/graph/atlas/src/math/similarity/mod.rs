//! Orientation-preserving similarities: uniform scale, rotation, and
//! translation.
//!
//! A similarity is the transform family produced by Procrustes alignment:
//! it changes size, orientation, and position while preserving every
//! angle and every length ratio, so aligned layouts keep their shape.
//! [`Similarity`] restricts [`Transform`] to exactly this family, which
//! buys a guarantee the general type gives up: the inverse is total.
//! Where [`Transform::inverse`] returns an [`Option`] because an affine
//! map can collapse an axis, a similarity's scale is positive by
//! construction and [`Similarity::inverse`] always succeeds.
//!
//! Use [`Similarity`] when a value is known to be a rigid motion plus
//! uniform scaling, such as aligning one generation's layout onto the
//! previous one; widen to [`Transform`] (via [`From`]) only when
//! composing with general affine maps.

use core::simd::Simd;

use super::{
    kernel::mul_add_f32x4,
    rotation::Rotation,
    scalar::narrow_f32,
    transform::Transform,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// An orientation-preserving similarity of 2D space: uniform scale,
/// rotation, and translation.
///
/// A similarity maps a vector `p` to `scale * R * p + translation`, where
/// `R` is the rotation's matrix. Lengths scale uniformly and angles are
/// preserved, so shapes keep their proportions and their winding
/// direction.
///
/// Every value upholds one invariant: the scale is a finite, strictly
/// positive, normal number. [`new`](Self::new) and
/// [`from_array`](Self::from_array) enforce this by returning [`None`]
/// for invalid input, which makes [`inverse`](Self::inverse) total: every
/// similarity can be undone.
///
/// Obtain one from weighted point correspondences with
/// [`fit`](Self::fit), the closed-form Procrustes alignment. Combine
/// similarities with [`then`](Self::then), which reads in application
/// order. Apply one to a single vector with
/// [`apply`](Self::apply) or to a whole [`Vec2x4T`] batch with
/// [`apply_x4`](Self::apply_x4), which stays entirely in SIMD registers.
/// A similarity widens losslessly into a [`Transform`] via [`From`], so
/// it also composes with general affine transforms through
/// [`Transform::then`].
///
/// The five coefficients round-trip through [`to_array`](Self::to_array)
/// and [`from_array`](Self::from_array) in the persistence order
/// `[scale, cos, sin, x, y]`.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Rotation, Similarity, Vec2};
///
/// // Double the size, quarter-turn counterclockwise, then move right.
/// let similarity = Similarity::new(2.0, Rotation::from_cos_sin(0.0, 1.0), Vec2::new(10.0, 0.0))
///     .expect("scale is normal and positive");
///
/// assert_eq!(similarity.apply(Vec2::new(3.0, 4.0)), Vec2::new(2.0, 6.0));
///
/// let inverse = similarity.inverse();
/// assert_eq!(inverse.apply(Vec2::new(2.0, 6.0)), Vec2::new(3.0, 4.0));
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
pub struct Similarity {
    scale: f32,
    rotation: Rotation,
    translation: Vec2,
}

impl Similarity {
    /// The similarity that maps every vector to itself.
    pub const IDENTITY: Self = Self {
        scale: 1.0,
        rotation: Rotation::IDENTITY,
        translation: Vec2::ZERO,
    };

    /// Creates a similarity from its scale, rotation, and translation.
    ///
    /// Returns [`None`] unless `scale` is a finite, strictly positive,
    /// normal number. Every constructed value therefore has a total
    /// [`inverse`](Self::inverse).
    #[inline]
    #[must_use]
    pub const fn new(scale: f32, rotation: Rotation, translation: Vec2) -> Option<Self> {
        if !scale.is_normal() || scale <= 0.0 {
            return None;
        }

        Some(Self {
            scale,
            rotation,
            translation,
        })
    }

    /// Fits the weighted orientation-preserving Procrustes alignment of
    /// paired points.
    ///
    /// The result is the similarity minimizing the weighted squared
    /// error `sum(weights[i] * |apply(source[i]) - target[i]|^2)`, in
    /// closed form: the weighted covariance between the centered point
    /// sets determines the rotation and scale, and the translation
    /// recovers the target centroid from the transformed source
    /// centroid. The covariance sums are accumulated in double precision
    /// and the result narrows to the working `f32` coefficients.
    /// Zero-weight pairs leave the fit unchanged.
    ///
    /// Returns [`None`] when the slice lengths differ, fewer than two
    /// pairs are given, any coordinate or weight is not finite, any
    /// weight is negative, the total weight is not a normal positive
    /// number, the weighted source points are coincident, the pairs do
    /// not determine an orientation (the covariance cancels exactly), or
    /// the resulting coefficients leave the `f32` range that
    /// [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Rotation, Similarity, Vec2};
    ///
    /// let expected = Similarity::new(2.0, Rotation::from_cos_sin(0.0, 1.0), Vec2::new(1.0, -2.0))
    ///     .expect("scale 2.0 is normal and positive");
    /// let source = [
    ///     Vec2::new(0.0, 0.0),
    ///     Vec2::new(4.0, 0.0),
    ///     Vec2::new(0.0, 2.0),
    /// ];
    /// let target = source.map(|point| expected.apply(point));
    ///
    /// let fitted = Similarity::fit(&source, &target, &[1.0; 3]).expect("the pairs are exact");
    /// assert!((fitted.scale() - expected.scale()).abs() < 1e-5);
    /// ```
    #[must_use]
    pub fn fit(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Option<Self> {
        if source.len() != target.len() || source.len() != weights.len() {
            return None;
        }
        if source.len() < 2 {
            return None;
        }

        let mut total_weight = 0.0_f64;
        let mut source_sum = [0.0_f64; 2];
        let mut target_sum = [0.0_f64; 2];
        for ((&source, &target), &weight) in source.iter().zip(target).zip(weights) {
            if !weight.is_finite() || weight < 0.0 || !source.is_finite() || !target.is_finite() {
                return None;
            }
            let weight = f64::from(weight);
            source_sum[0] = weight.mul_add(f64::from(source.x()), source_sum[0]);
            source_sum[1] = weight.mul_add(f64::from(source.y()), source_sum[1]);
            target_sum[0] = weight.mul_add(f64::from(target.x()), target_sum[0]);
            target_sum[1] = weight.mul_add(f64::from(target.y()), target_sum[1]);
            total_weight += weight;
        }
        if !total_weight.is_normal() {
            return None;
        }

        let source_centroid = [source_sum[0] / total_weight, source_sum[1] / total_weight];
        let target_centroid = [target_sum[0] / total_weight, target_sum[1] / total_weight];
        // The pairs are centered in the working precision so the per-pair
        // products go through the `Vec2` operations; only the long
        // reductions over the pairs carry double-precision accumulators.
        let source_center = Vec2::new(
            narrow_f32(source_centroid[0])?,
            narrow_f32(source_centroid[1])?,
        );
        let target_center = Vec2::new(
            narrow_f32(target_centroid[0])?,
            narrow_f32(target_centroid[1])?,
        );

        let mut variance = 0.0_f64;
        let mut dot = 0.0_f64;
        let mut perp_dot = 0.0_f64;
        for ((&source, &target), &weight) in source.iter().zip(target).zip(weights) {
            let source = source - source_center;
            let target = target - target_center;
            let weight = f64::from(weight);
            variance = weight.mul_add(f64::from(source.length_squared()), variance);
            dot = weight.mul_add(f64::from(source.dot(target)), dot);
            perp_dot = weight.mul_add(f64::from(source.perp_dot(target)), perp_dot);
        }

        // Coincident (up to weight) source points give no scale.
        if !variance.is_normal() {
            return None;
        }
        // An exactly cancelling covariance gives no orientation.
        let covariance = dot.hypot(perp_dot);
        if !covariance.is_normal() {
            return None;
        }

        let scale = covariance / variance;
        let cos = dot / covariance;
        let sin = perp_dot / covariance;
        let rotated = [
            cos.mul_add(source_centroid[0], -sin * source_centroid[1]),
            sin.mul_add(source_centroid[0], cos * source_centroid[1]),
        ];

        Self::new(
            narrow_f32(scale)?,
            Rotation::from_cos_sin(narrow_f32(cos)?, narrow_f32(sin)?),
            Vec2::new(
                narrow_f32(scale.mul_add(-rotated[0], target_centroid[0]))?,
                narrow_f32(scale.mul_add(-rotated[1], target_centroid[1]))?,
            ),
        )
    }

    /// Returns the uniform scale factor.
    #[inline]
    #[must_use]
    pub const fn scale(self) -> f32 {
        self.scale
    }

    /// Returns the rotation about the origin.
    #[inline]
    #[must_use]
    pub const fn rotation(self) -> Rotation {
        self.rotation
    }

    /// Returns the translation applied after scale and rotation.
    #[inline]
    #[must_use]
    pub const fn translation(self) -> Vec2 {
        self.translation
    }

    /// Returns the similarity equivalent to applying `self` first, then
    /// `next`.
    ///
    /// This reads in application order. The scales multiply, the
    /// rotations compose via [`Rotation::then`], and `self`'s translation
    /// is carried through `next`. The product of the two scales must
    /// remain in the normal positive range to uphold the type's
    /// invariant.
    #[inline]
    #[must_use]
    pub const fn then(self, next: Self) -> Self {
        let moved = next.rotation.apply(self.translation);

        Self {
            scale: self.scale * next.scale,
            rotation: self.rotation.then(next.rotation),
            translation: Vec2::new(
                next.scale * moved.x() + next.translation.x(),
                next.scale * moved.y() + next.translation.y(),
            ),
        }
    }

    /// Returns the similarity that undoes `self`.
    ///
    /// The scale invariant keeps the divisor away from zero, so every
    /// similarity has an inverse: applying a similarity and then its
    /// inverse reproduces the input up to floating-point rounding. The
    /// reciprocal of the scale must itself be a normal number to uphold
    /// the type's invariant, which holds for scales up to roughly
    /// `8.5e37`.
    #[inline]
    #[must_use]
    pub const fn inverse(self) -> Self {
        let inverse_scale = 1.0 / self.scale;
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
    /// The vector is rotated about the origin, scaled uniformly, and then
    /// moved by the translation.
    #[inline]
    #[must_use]
    pub const fn apply(self, vec: Vec2) -> Vec2 {
        let rotated = self.rotation.apply(vec);

        Vec2::new(
            self.scale * rotated.x() + self.translation.x(),
            self.scale * rotated.y() + self.translation.y(),
        )
    }

    /// Transforms four vectors at once, entirely in SIMD registers.
    ///
    /// The scale is folded into the rotation coefficients, so each axis
    /// is two fused multiply-adds over the batch's lane groups with no
    /// shuffles. On targets with native FMA the results can differ from
    /// [`apply`](Self::apply) by up to one unit in the last place,
    /// because the fused operations round once instead of twice.
    #[inline]
    #[must_use]
    pub fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        let scaled_cos = self.scale * self.rotation.cos();
        let scaled_sin = self.scale * self.rotation.sin();
        let xs = batch.xs();
        let ys = batch.ys();

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
    /// The order is `[scale, cos, sin, x, y]`: the uniform scale, the
    /// rotation's cosine and sine, and the translation's components. The
    /// array round-trips through [`from_array`](Self::from_array) bit for
    /// bit.
    #[inline]
    #[must_use]
    pub const fn to_array(self) -> [f32; 5] {
        [
            self.scale,
            self.rotation.cos(),
            self.rotation.sin(),
            self.translation.x(),
            self.translation.y(),
        ]
    }

    /// Creates a similarity from its five coefficients.
    ///
    /// The array is read as `[scale, cos, sin, x, y]`, the layout
    /// produced by [`to_array`](Self::to_array). The cosine and sine must
    /// lie on the unit circle up to rounding, matching the caller
    /// contract of [`Rotation::from_cos_sin`].
    ///
    /// Returns [`None`] unless the scale is a finite, strictly positive,
    /// normal number.
    #[inline]
    #[must_use]
    pub const fn from_array(
        [scale, cos, sin, translation_x, translation_y]: [f32; 5],
    ) -> Option<Self> {
        Self::new(
            scale,
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
