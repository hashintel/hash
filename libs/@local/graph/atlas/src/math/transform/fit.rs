//! Least-squares affine alignment, including anisotropic deformation.
//!
//! For paired points pᵢ, qᵢ ∈ ℝ², the model minimizes E(A, t) = Σᵢ‖Apᵢ + t − qᵢ‖² over a real 2x2
//! matrix A and translation t. Let p̄ and q̄ be the point means, S = Σᵢ(pᵢ − p̄)(pᵢ − p̄)ᵀ the source
//! scatter and C = Σᵢ(qᵢ − q̄)(pᵢ − p̄)ᵀ the target-source cross-scatter. The centred normal equation
//! is AS = C. When S is nonsingular, A = CS⁻¹ and t = q̄ − Ap̄ give the unique minimizer. The fitted
//! A may itself be singular.
//!
//! A serial pass accumulates eleven raw scalar moments in `f64`, then centres them and solves the
//! 2x2 system before narrowing coefficients to `f32`. Raw-moment subtraction and a near-singular
//! source scatter can amplify rounding. The determinant check tests the computed system, without
//! certifying exact source rank.
//!
//! A general affine fit can absorb shear and anisotropic scale that a
//! [`Similarity`](crate::math::Similarity) cannot represent. Comparing their residuals measures the
//! additional error explained by that broader family, subject to the fits' numerical errors.

use hashql_core::id::Id;

use super::Transform;
use crate::math::{DNonNegative, Derivation, FinitePointField, dvec2::DVec2};

impl Transform {
    /// Estimates the unweighted least-squares affine map of paired fields.
    ///
    /// The centred normal equations determine the linear part and translation as described by the
    /// [affine fitting model](crate::math::transform::fit). Moments accumulate serially in `f64`,
    /// then the coefficients narrow to `f32`. Large offsets relative to point spread can make
    /// raw-moment centring inaccurate. Near-collinearity also makes the solve sensitive to
    /// perturbations.
    ///
    /// Returns [`None`] for unequal field lengths or fewer than three pairs. Three noncollinear
    /// source points are needed to determine all six affine coefficients. The computed
    /// source-scatter determinant must be positive and normal, and every fitted coefficient must
    /// narrow to finite `f32`. These checks can reject an exactly full-rank input or accept an
    /// exactly singular one because the scatter and determinant have already rounded.
    ///
    /// # Complexity
    ///
    /// O(n) time and constant additional storage for n pairs.
    ///
    /// # Example
    ///
    /// This example is ignored because [`Transform`] and [`FinitePointField`] are crate-private.
    ///
    /// ```ignore
    /// use hashql_core::id::IdSlice;
    /// use crate::math::{FinitePointField, Transform, Vec2};
    /// # hashql_core::id::newtype! { struct RowId(u32) }
    ///
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
    /// let source = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&source))
    ///     .expect("the sources are finite");
    /// let target = FinitePointField::new(IdSlice::from_raw(&target))
    ///     .expect("exact images of finite points are finite");
    /// let fitted = Transform::fit_uniform(source, target).expect("the pairs are exact");
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
    pub(crate) fn fit_uniform<I: Id>(
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> Option<Self> {
        if source.len() != target.len() || source.len() < 3 {
            return None;
        }

        let mut source_sum = DVec2::new(0.0, 0.0);
        let mut target_sum = DVec2::new(0.0, 0.0);
        let mut source_xx = 0.0_f64;
        let mut source_xy = 0.0_f64;
        let mut source_yy = 0.0_f64;
        let mut cross_xx = 0.0_f64;
        let mut cross_xy = 0.0_f64;
        let mut cross_yx = 0.0_f64;
        let mut cross_yy = 0.0_f64;

        for (&source, &target) in source.iter().zip(target.iter()) {
            // Finite f32 values widen exactly. Their products need at most 48 significand bits and
            // fit f64's exponent range. Each moment update therefore rounds only when adding to the
            // accumulator. Subsequent centring can still cancel most of the significand bits.
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

        let count = source.len() as f64;
        let source_centroid = source_sum / count;
        let target_centroid = target_sum / count;

        // In real arithmetic, centred deviations sum to zero. Writing mₚ = Σᵢ pᵢ and m_q = Σᵢ qᵢ
        // gives S = Σᵢ pᵢpᵢᵀ − mₚmₚᵀ/n and C = Σᵢ qᵢpᵢᵀ − m_qmₚᵀ/n. Therefore the raw moments
        // determine both centred matrices without another input pass. Subtraction uses rounded
        // sums, and converting n to f64 can round above 2⁵³.
        let scatter_xx = source_xx - source_sum.x() * source_sum.x() / count;
        let scatter_xy = source_xy - source_sum.x() * source_sum.y() / count;
        let scatter_yy = source_yy - source_sum.y() * source_sum.y() / count;
        let centred_xx = cross_xx - target_sum.x() * source_sum.x() / count;
        let centred_xy = cross_xy - target_sum.x() * source_sum.y() / count;
        let centred_yx = cross_yx - target_sum.y() * source_sum.x() / count;
        let centred_yy = cross_yy - target_sum.y() * source_sum.y() / count;

        // The exact source scatter is positive semidefinite and is invertible precisely for
        // noncollinear points. Rounded moments need not retain that property. A singular scatter
        // can leave a positive normal determinant, including through the residual of the fused
        // product minus the separately rounded square. This check rejects nonpositive and
        // non-normal computed values only.
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
    /// For n > 0 pairs, the model is RMS = √(Σᵢ‖Apᵢ + t − qᵢ‖² / n). At the least-squares fit it
    /// measures the error left after affine alignment. Coefficients widen to `f64`, and squared
    /// distances accumulate serially in `f64`. This can differ from measuring the `f32` outputs of
    /// [`apply`](Self::apply).
    ///
    /// Every transform coefficient must be finite. A successful [`fit_uniform`](Self::fit_uniform)
    /// establishes this condition, but arbitrary construction and inverse/composition operations
    /// may not. Together with finite field coordinates, this keeps the squared sum and RMS finite
    /// on 32-bit and 64-bit targets.
    ///
    /// # Panics
    ///
    /// This panics when the field lengths differ or the fields are empty, because the residual
    /// is defined over matched pairs and an empty set has no mean.
    ///
    /// # Complexity
    ///
    /// O(n) time and constant additional storage for n pairs.
    #[must_use]
    pub(crate) fn rms_residual<I: Id>(
        self,
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> DNonNegative {
        assert_eq!(
            source.len(),
            target.len(),
            "paired fields must cover the same rows"
        );
        assert!(
            !source.is_empty(),
            "an RMS residual needs at least one pair"
        );

        let x_axis = DVec2::from(self.x_axis);
        let y_axis = DVec2::from(self.y_axis);
        let translation = DVec2::from(self.translation);

        let mut squared = Derivation::<DNonNegative>::ZERO;
        for (&source, &target) in source.iter().zip(target.iter()) {
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

        // Finite f32 coefficients and coordinates have magnitude below 2¹²⁸. Each residual
        // component has two products below 2²⁵⁶, plus translation and target terms. Allowing for
        // fixed-operation rounding, the nonnegative squared error of one pair is below B = 2⁵¹⁸.
        // On 32-bit and 64-bit targets, an 8-byte-point slice contains n < 2⁶⁰ pairs. Adding the
        // initial zero is exact for these nonnegative finite terms. Along any term's path, fewer
        // than n additions combine contributions. With binary64 unit roundoff u = 2⁻⁵³, those
        // additions amplify the term by at most (1 + u)ⁿ < exp(128) < 2¹⁸⁵. Thus the rounded sum is
        // below nB · 2¹⁸⁵ < 2⁷⁶³. Subnormal additions cannot threaten this upper bound.
        // Division by the positive converted count and the square root preserve finiteness
        // and nonnegativity. Therefore the final value satisfies DNonNegative's numerical
        // domain.
        (squared / DNonNegative::from_usize(source.len()))
            .sqrt()
            .finish_unchecked()
    }
}
