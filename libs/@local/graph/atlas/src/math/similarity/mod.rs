//! Uniform scale, rotation and translation for shape-preserving alignment.
//!
//! In real arithmetic an orientation-preserving similarity preserves every angle and length ratio.
//! [`Similarity`] represents this model with `f32` coefficients and a checked positive scale.
//! Reciprocation preserves its scale range. Construction validates finite translation and an
//! approximately unit rotation, and composition and inversion reject invalid coefficients.
//! Transformed coordinates can still overflow. [`Similarity::fit`] estimates coefficients from
//! weighted point correspondences.
//!
//! Use [`Similarity`] for rigid motion with uniform scaling. Convert to [`Transform`] via [`From`]
//! when composing with general affine maps.

use core::simd::Simd;

use serde::de::Error as _;

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

/// An approximate orientation-preserving similarity of 2D space.
///
/// The model maps p ∈ ℝ² to aRp + t, where a is the positive scale, R is the [`Rotation`] matrix
/// and t is the translation. With a unit rotation pair this scales all lengths by a and preserves
/// angles and winding direction in real arithmetic. The `f32` evaluation rounds and can overflow.
///
/// [`new`](Self::new) and [`from_array`](Self::from_array) validate that the scale and its
/// reciprocal are both positive normal numbers. The rotation must satisfy |cos² + sin² − 1| ≤ 10⁻⁶,
/// evaluated in `f64`, and the translation must be finite. Construction enforces these conditions.
/// [`then`](Self::then) and [`inverse`](Self::inverse) reject results outside this domain.
///
/// Obtain a least-squares estimate from weighted point correspondences with [`fit`](Self::fit), or
/// use [`fit_par`](Self::fit_par) for parallel accumulation. Apply one to a single vector with
/// [`apply`](Self::apply). Conversion to [`Transform`] folds the scale into the rotation columns
/// with `f32` multiplication. It preserves the real-arithmetic model up to coefficient rounding,
/// and its application can differ from [`apply`](Self::apply).
///
/// The coefficients persist in the order `[scale, cos, sin, x, y]`, the layout
/// [`from_array`](Self::from_array) reads.
///
/// # Example
///
/// This example is ignored because [`Similarity`] is crate-private.
///
/// ```ignore
/// use crate::math::{Similarity, Rotation, Vec2, positive};
///
/// // Double the size, quarter-turn counterclockwise, then move right.
/// let similarity =
///     Similarity::new(positive!(2.0), Rotation::from_cos_sin(0.0, 1.0), Vec2::new(10.0, 0.0))
///         .expect("scale is normal and positive");
///
/// assert_eq!(similarity.apply(Vec2::new(3.0, 4.0)), Vec2::new(2.0, 6.0));
/// ```
// byte construction would bypass validation of the scale and its reciprocal
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    serde::Serialize,
)]
pub(crate) struct Similarity {
    scale: Positive,
    rotation: Rotation,
    translation: Vec2,
}

/// Similarity coefficients awaiting joint numerical validation.
#[derive(serde::Deserialize)]
#[serde(rename = "Similarity")]
struct UnvalidatedSimilarity {
    scale: Positive,
    rotation: Rotation,
    translation: Vec2,
}

impl Similarity {
    /// Unit scale, identity rotation and zero translation.
    pub(crate) const IDENTITY: Self = Self {
        scale: positive!(1.0),
        rotation: Rotation::IDENTITY,
        translation: Vec2::ZERO,
    };

    /// Creates a similarity from its scale, rotation, and translation.
    ///
    /// Returns [`None`] unless `scale` and its reciprocal are both strictly positive normal
    /// numbers, which accepts magnitudes from [`f32::MIN_POSITIVE`] up to about `8.5e37`. The
    /// reciprocal bound keeps the scale range closed under reciprocation. The rotation must satisfy
    /// |cos² + sin² − 1| ≤ 10⁻⁶, evaluated in `f64`, and the translation must be finite. Construction
    /// retains accepted coefficients without normalization.
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

        let cos = f64::from(rotation.cos());
        let sin = f64::from(rotation.sin());

        // products of finite widened f32 components are exact in f64. Only their sum rounds.
        let norm_squared = f64::mul_add(sin, sin, cos * cos);
        if !norm_squared.is_finite()
            || (norm_squared - 1.0).abs() > 1.0e-6
            || !translation.is_finite()
        {
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

    /// Composes `self` followed by `next`, validating the resulting coefficients.
    ///
    /// In real arithmetic the parameters are a₂a₁, R₂R₁ and a₂R₂t₁ + t₂. [`Rotation::then`]
    /// composes the rotation pair. Coefficient rounding can make the result differ from sequential
    /// application.
    ///
    /// Returns [`None`] when the rounded coefficients fail [`new`](Self::new), including scale
    /// overflow or underflow, rotation drift beyond the norm tolerance, or non-finite translation.
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

    /// Forms the inverse parameters using a reciprocal scale and conjugate rotation.
    ///
    /// For an exact unit rotation, the inverse model is a⁻¹Rᵀp − a⁻¹Rᵀt. The reciprocal scale
    /// remains in the accepted range. The rotation retains any norm drift described by
    /// [`Rotation::inverse`]. Inversion has no finite round-trip error guarantee.
    ///
    /// Returns [`None`] when the computed coefficients fail [`new`](Self::new), including overflow
    /// while rotating or scaling the inverse translation.
    #[inline]
    #[must_use]
    pub(crate) const fn inverse(self) -> Option<Self> {
        // In domain with no check: `new` admits only scales whose reciprocal is also normal.
        let inverse_scale = self.scale.recip();
        let rotation = self.rotation.inverse();
        let moved = rotation.apply(self.translation);

        Self::new(
            inverse_scale,
            rotation,
            Vec2::new(-(inverse_scale * moved.x()), -(inverse_scale * moved.y())),
        )
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

    /// Applies the similarity to four vectors with SIMD arithmetic.
    ///
    /// This folds the scale into the rotation coefficients before using two fused multiply-adds per
    /// axis. Each fused operation rounds its product and addition once, independently of native FMA
    /// availability. The coefficient products, grouping and fusion differ from
    /// [`apply`](Self::apply), with no uniform result-relative ULP bound between paths, especially
    /// near cancellation or overflow.
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
    /// and the translation's components. [`from_array`](Self::from_array) accepts an array returned
    /// from any similarity and preserves every component value.
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
    /// cosine and sine must satisfy the squared-norm tolerance in [`new`](Self::new), and the
    /// translation must be finite.
    ///
    /// Returns [`None`] unless every coefficient satisfies [`new`](Self::new).
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

impl<'de> serde::Deserialize<'de> for Similarity {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let coefficients = UnvalidatedSimilarity::deserialize(deserializer)?;
        Self::new(
            coefficients.scale,
            coefficients.rotation,
            coefficients.translation,
        )
        .ok_or_else(|| {
            D::Error::custom(
                "similarity requires a normal scale and reciprocal, a rotation squared-norm \
                 defect at most 1e-6, and finite translation",
            )
        })
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
