//! Least-squares affine fitting of point correspondences.
//!
//! The closed-form solve consumes eleven raw moments that accumulate in one serial
//! double-precision pass. The Procrustes fit constrains its linear part to a rotation under one
//! scale. This fit releases both axes and therefore absorbs the anisotropic deformation a
//! similarity leaves in its residual, which is what makes the pair of fits a decomposition for
//! evidence.

use super::Transform;
use crate::math::{DNonNegative, dvec2::DVec2, vec2::Vec2};

impl Transform {
    /// Fits the unweighted least-squares affine map of paired points.
    ///
    /// The result is the transform minimizing `sum(|apply(source[i]) - target[i]|^2)` over all
    /// affine maps, in closed form: the centred normal equations give the linear part as the
    /// target-source cross-scatter times the inverse source scatter, and the translation
    /// recovers the target centroid from the mapped source centroid. Every moment accumulates
    /// serially in double precision. The fit reads gauge-population constellations, whose size
    /// sits far below the parallel Procrustes fold's break-even, so no parallel form exists
    /// until a corpus-scale consumer does.
    ///
    /// Returns [`None`] when the slice lengths differ, the caller passes fewer than three pairs
    /// (six coefficients need three correspondences, and two points are always collinear), any
    /// coordinate is not finite, the source scatter's determinant is not a normal positive
    /// number (coincident or collinear source points collapse an axis, the same degeneracy
    /// [`inverse`](Self::inverse) refuses), or a fitted coefficient leaves the finite `f32`
    /// range. A nearly collinear source constellation conditions the solve poorly and the
    /// coefficients grow accordingly, exactly as they do under a near-singular
    /// [`inverse`](Self::inverse).
    ///
    /// # Examples
    ///
    /// The example is `ignore`d because a doctest compiles as an external consumer of the crate,
    /// which cannot name this crate-internal function. The same fixture runs compiled in the
    /// module's test suite.
    ///
    /// ```ignore
    /// let expected = Transform::from_cols(
    ///     Vec2::new(2.0, 0.0),
    ///     Vec2::new(0.0, 0.5),
    ///     Vec2::new(1.0, -2.0),
    /// );
    /// let source = [
    ///     Vec2::new(1.0, 0.0),
    ///     Vec2::new(-1.0, 0.0),
    ///     Vec2::new(0.0, 1.0),
    ///     Vec2::new(0.0, -1.0),
    /// ];
    /// let target = source.map(|point| expected.apply(point));
    ///
    /// let fitted = Transform::fit_uniform(&source, &target).expect("the pairs are exact");
    /// assert_eq!(fitted.apply(Vec2::new(1.0, 1.0)), expected.apply(Vec2::new(1.0, 1.0)));
    /// ```
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "pair counts remain exactly representable in f64 far beyond any corpus"
    )]
    #[expect(
        clippy::similar_names,
        reason = "the raw moments carry their axis-pair names, which the closed form is written in"
    )]
    pub(crate) fn fit_uniform(source: &[Vec2], target: &[Vec2]) -> Option<Self> {
        if source.len() != target.len() || source.len() < 3 {
            return None;
        }

        let mut valid = true;
        let mut source_sum = DVec2::new(0.0, 0.0);
        let mut target_sum = DVec2::new(0.0, 0.0);
        let mut source_xx = 0.0_f64;
        let mut source_xy = 0.0_f64;
        let mut source_yy = 0.0_f64;
        let mut cross_xx = 0.0_f64;
        let mut cross_xy = 0.0_f64;
        let mut cross_yx = 0.0_f64;
        let mut cross_yy = 0.0_f64;

        for (&source, &target) in source.iter().zip(target) {
            valid &= source.is_finite() && target.is_finite();

            // `f32` values widen exactly and each product of two widened values fits in `f64`'s
            // 53-bit significand, so only the running additions round - the same exactness the
            // Procrustes accumulation relies on for its centred-moment cancellation.
            let source = DVec2::from(source);
            let target = DVec2::from(target);

            source_sum += source;
            target_sum += target;
            source_xx = source.x().mul_add(source.x(), source_xx);
            source_xy = source.x().mul_add(source.y(), source_xy);
            source_yy = source.y().mul_add(source.y(), source_yy);
            cross_xx = target.x().mul_add(source.x(), cross_xx);
            cross_xy = target.x().mul_add(source.y(), cross_xy);
            cross_yx = target.y().mul_add(source.x(), cross_yx);
            cross_yy = target.y().mul_add(source.y(), cross_yy);
        }

        if !valid {
            return None;
        }

        let count = source.len() as f64;
        let source_centroid = source_sum / count;
        let target_centroid = target_sum / count;

        // Centred moments follow from the raw ones by the parallel-axis identity, exactly as in
        // the Procrustes solve: expanding each centred product leaves cross terms that collapse
        // into one correction because the centred source sums to zero.
        let scatter_xx = source_xx - source_sum.x() * source_sum.x() / count;
        let scatter_xy = source_xy - source_sum.x() * source_sum.y() / count;
        let scatter_yy = source_yy - source_sum.y() * source_sum.y() / count;
        let centred_xx = cross_xx - target_sum.x() * source_sum.x() / count;
        let centred_xy = cross_xy - target_sum.x() * source_sum.y() / count;
        let centred_yx = cross_yx - target_sum.y() * source_sum.x() / count;
        let centred_yy = cross_yy - target_sum.y() * source_sum.y() / count;

        // The scatter matrix is positive semidefinite, so a mathematically singular determinant
        // can only round to a small value of either sign; the sign check rejects it together
        // with the non-normal cases.
        let determinant = scatter_xx.mul_add(scatter_yy, -(scatter_xy * scatter_xy));
        if !determinant.is_normal() || determinant <= 0.0 {
            return None;
        }

        // A = C · S⁻¹ with C the centred cross-scatter and S the centred source scatter,
        // written out through S's adjugate.
        let a11 = centred_xx.mul_add(scatter_yy, -(centred_xy * scatter_xy)) / determinant;
        let a12 = centred_xy.mul_add(scatter_xx, -(centred_xx * scatter_xy)) / determinant;
        let a21 = centred_yx.mul_add(scatter_yy, -(centred_yy * scatter_xy)) / determinant;
        let a22 = centred_yy.mul_add(scatter_xx, -(centred_yx * scatter_xy)) / determinant;

        let translation = DVec2::new(
            target_centroid.x() - a11.mul_add(source_centroid.x(), a12 * source_centroid.y()),
            target_centroid.y() - a21.mul_add(source_centroid.x(), a22 * source_centroid.y()),
        );

        Some(Self::from_cols(
            DVec2::new(a11, a21).narrow()?,
            DVec2::new(a12, a22).narrow()?,
            translation.narrow()?,
        ))
    }

    /// Returns the root-mean-square distance from transformed source points to their targets.
    ///
    /// Paired with [`fit_uniform`](Self::fit_uniform), the residual measures the movement no
    /// affine map explains. This applies the transform with coefficients widened to `f64`, and
    /// the squared distances accumulate serially in double precision.
    ///
    /// Returns [`None`] when the slice lengths differ, the caller passes no pairs, or any
    /// coordinate is not finite (a non-finite input surfaces as a non-finite sum, which the
    /// finishing step refuses).
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "pair counts remain exactly representable in f64 far beyond any corpus"
    )]
    pub(crate) fn rms_residual(self, source: &[Vec2], target: &[Vec2]) -> Option<DNonNegative> {
        if source.len() != target.len() || source.is_empty() {
            return None;
        }

        let x_axis = DVec2::from(self.x_axis);
        let y_axis = DVec2::from(self.y_axis);
        let translation = DVec2::from(self.translation);

        let mut squared = 0.0_f64;
        for (&source, &target) in source.iter().zip(target) {
            let source = DVec2::from(source);
            let target = DVec2::from(target);

            let residual = DVec2::new(
                x_axis
                    .x()
                    .mul_add(source.x(), y_axis.x().mul_add(source.y(), translation.x()))
                    - target.x(),
                x_axis
                    .y()
                    .mul_add(source.x(), y_axis.y().mul_add(source.y(), translation.y()))
                    - target.y(),
            );
            squared += residual.norm_squared();
        }

        DNonNegative::new((squared / source.len() as f64).sqrt())
    }
}
