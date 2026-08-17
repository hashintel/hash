//! The paired counterfactual-contraction violation and its exact partial derivatives.
//!
//! For an eligible pair read at the zero and canonical conditions, the violation is `v = (s·d_c −
//! d₀)/σ₀ + m`. The aligned canonical distance is compared against the zero distance in units of
//! the pair's frozen ruler `σ₀`, and the margin `m` offsets the comparison. Contraction means `v`
//! falls. Equality of the two distances is a failure to contract, and a non-negative margin keeps
//! it one. The penalty applied to `v` and the per-pair weight are the batch term's to fold - this
//! module owns the violation and its live partials, evaluated fused so the pair loops stay pure
//! plumbing.
//!
//! The fitted scale `s` is live. It comes from the similarity alignment of the canonical field
//! onto the zero field, refit whenever the fields move, so it carries a derivative: rotation and
//! translation cancel in pair distances, which concentrates the whole alignment orbit in this one
//! scalar and makes the violation invariant in value and derivative under translation, rotation,
//! and uniform scaling of the canonical field. The ruler `σ₀` is a declared constant of the
//! estimand, measured once on the zero-condition snapshot taken before the objective's first
//! gradient and frozen with the generation. No gradient exists through it, because nothing live
//! enters it. A live ruler would hand the optimizer its own unit of account, and a detached copy
//! of a live quantity would lie about the derivative. A frozen constant does neither.
//!
//! The zero-side partial `∂v/∂d₀ = −1/σ₀` is negative, so the optimizer is paid to inflate a
//! violating pair's zero distance. The reward is real and stays in the gradient. What holds it is
//! the per-row band projection on the zero field, never the derivative's absence, and an
//! implementation that detaches or drops the zero-side path optimizes a different objective whose
//! constraint claim is false. The hand derivation exists to keep these signs exact.
//!
//! At coincidence either distance's direction vector is undefined, and the coordinate fold treats
//! the contribution as zero: the value still counts, the pull has nowhere to point. The slopes
//! this module returns are direction-free scalars. Zeroing the fold at coincidence is the batch
//! term's contract, stated on [`ContrastEnergy::evaluate`].

use crate::math::{Negative, NonNegative, Positive};

/// The per-evaluation constants of the contrast violation.
///
/// The fitted scale is the similarity alignment's scalar for the evaluation being scored, and
/// the margin is the violation's offset at distance equality. Both are constant across the pairs of
/// one evaluation, so the per-pair loop carries one copy.
///
/// The margin's domain is non-negative because equality must stay a failure to contract: a
/// negative margin would score `s·d_c = d₀` as satisfied, and the objective's product meaning is
/// that an uncontracted pair is never satisfied. The margin's value is an open owner decision;
/// its domain is not.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ContrastEnergy {
    fitted_scale: Positive,
    margin: NonNegative,
}

/// One pair's violation and its three live partial derivatives, fused.
///
/// Every field is finite by construction of the inputs: the ruler is strictly positive, the
/// distances are finite and non-negative, and the fitted scale is finite and strictly positive.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ContrastEvaluation {
    /// The violation `v = (s·d_c − d₀)/σ₀ + m`.
    pub violation: f32,
    /// `∂v/∂d_c = s/σ₀`, strictly positive: shrinking the aligned canonical distance is the
    /// objective's productive direction.
    pub canonical_slope: Positive,
    /// `∂v/∂d₀ = −1/σ₀`, strictly negative: the reward for inflating the zero distance, present
    /// and honest, held by the band projection rather than hidden from the gradient.
    pub zero_slope: Negative,
    /// `∂v/∂s = d_c/σ₀`, non-negative, zero exactly at canonical coincidence. Its adjoint fans
    /// into the gauge anchors' canonical coordinates through the alignment fit.
    pub fitted_scale_slope: NonNegative,
}

impl ContrastEnergy {
    /// Binds the evaluation's fitted alignment scale to the margin.
    #[must_use]
    pub(crate) const fn new(fitted_scale: Positive, margin: NonNegative) -> Self {
        Self {
            fitted_scale,
            margin,
        }
    }

    /// Returns the fitted alignment scale `s`.
    #[inline]
    #[must_use]
    pub(crate) const fn fitted_scale(self) -> Positive {
        self.fitted_scale
    }

    /// Evaluates one pair's violation and its partials in the two distances and the scale.
    ///
    /// `ruler` is the pair's frozen `σ₀`, strictly positive by construction of the frozen table,
    /// so every quotient here is total. `canonical_distance` and `zero_distance` are the raw
    /// (unaligned) canonical and zero-frame pair distances.
    ///
    /// The returned slopes are scalars in the distances. Folding them into coordinate gradients
    /// multiplies by the pair's unit direction vectors, and at coincidence of either field's
    /// endpoints that direction is undefined: the caller folds a zero contribution there, keeping
    /// the value and dropping the pull, which is the continuous limit.
    #[must_use]
    pub(crate) const fn evaluate(
        self,
        ruler: Positive,
        canonical_distance: NonNegative,
        zero_distance: NonNegative,
    ) -> ContrastEvaluation {
        let scale = self.fitted_scale;
        let aligned = scale * canonical_distance;

        ContrastEvaluation {
            violation: ((aligned - zero_distance) / ruler) + self.margin,
            canonical_slope: scale / ruler,
            zero_slope: -ruler.recip(),
            fitted_scale_slope: canonical_distance / ruler,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ContrastEnergy, ContrastEvaluation};
    use crate::math::{NonNegative, Positive};

    /// Central finite difference of `function` at `at` with the given step.
    fn central_difference(function: impl Fn(f64) -> f64, at: f64, step: f64) -> f64 {
        (function(at + step) - function(at - step)) / (2.0 * step)
    }

    /// The violation stated verbatim, for finite differences.
    #[expect(
        clippy::suboptimal_flops,
        reason = "the mirror states the defining expression verbatim"
    )]
    fn violation(scale: f64, margin: f64, ruler: f64, canonical: f64, zero: f64) -> f64 {
        (scale * canonical - zero) / ruler + margin
    }

    fn evaluate(
        scale: f32,
        margin: f32,
        ruler: f32,
        canonical: f32,
        zero: f32,
    ) -> ContrastEvaluation {
        ContrastEnergy::new(
            Positive::new(scale).expect("test scale is positive"),
            NonNegative::new(margin).expect("test margin is non-negative"),
        )
        .evaluate(
            Positive::new(ruler).expect("test ruler is positive"),
            NonNegative::new(canonical).expect("test canonical distance is non-negative"),
            NonNegative::new(zero).expect("test zero distance is non-negative"),
        )
    }

    #[test]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the fixture constants are exactly representable in f32"
    )]
    fn partials_match_finite_differences() {
        let (scale, margin, ruler, canonical, zero) =
            (1.25_f64, 0.1_f64, 0.7_f64, 2.4_f64, 3.1_f64);
        let evaluation = evaluate(
            scale as f32,
            margin as f32,
            ruler as f32,
            canonical as f32,
            zero as f32,
        );
        let step = 1e-4;

        let canonical_reference = central_difference(
            |moved| violation(scale, margin, ruler, moved, zero),
            canonical,
            step,
        );
        let zero_reference = central_difference(
            |moved| violation(scale, margin, ruler, canonical, moved),
            zero,
            step,
        );
        let scale_reference = central_difference(
            |moved| violation(moved, margin, ruler, canonical, zero),
            scale,
            step,
        );

        assert!((f64::from(evaluation.canonical_slope) - canonical_reference).abs() < 1e-6);
        assert!((f64::from(evaluation.zero_slope) - zero_reference).abs() < 1e-6);
        assert!((f64::from(evaluation.fitted_scale_slope) - scale_reference).abs() < 1e-6);
    }

    #[test]
    fn sign_structure_holds() {
        let evaluation = evaluate(1.25, 0.1, 0.7, 2.4, 3.1);

        assert!(evaluation.canonical_slope > 0.0);
        assert!(evaluation.zero_slope < 0.0);
        assert!(evaluation.fitted_scale_slope > 0.0);
    }

    #[test]
    fn fitted_scale_slope_vanishes_only_at_canonical_coincidence() {
        let coincident = evaluate(1.25, 0.1, 0.7, 0.0, 3.1);
        assert_eq!(coincident.fitted_scale_slope, 0.0);

        let separated = evaluate(1.25, 0.1, 0.7, 1e-3, 3.1);
        assert!(separated.fitted_scale_slope > 0.0);
    }

    #[test]
    fn equality_reads_the_margin() {
        // s·d_c = 2.0 = d₀, so the violation is exactly the margin.
        let evaluation = evaluate(0.5, 0.25, 0.8, 4.0, 2.0);
        assert!((evaluation.violation - 0.25).abs() < 1e-6);
    }

    #[test]
    fn ruler_denominated_slopes_halve_when_the_ruler_doubles() {
        let narrow = evaluate(1.25, 0.1, 0.7, 2.4, 3.1);
        let wide = evaluate(1.25, 0.1, 1.4, 2.4, 3.1);

        assert!(
            (f64::from(wide.canonical_slope) - f64::from(narrow.canonical_slope) / 2.0).abs()
                < 1e-7
        );
        assert!((f64::from(wide.zero_slope) - f64::from(narrow.zero_slope) / 2.0).abs() < 1e-7);
        assert!(
            (f64::from(wide.fitted_scale_slope) - f64::from(narrow.fitted_scale_slope) / 2.0).abs()
                < 1e-7
        );
    }

    #[test]
    fn violation_value_is_invariant_along_the_scaling_orbit() {
        // A uniform canonical scaling by c with the fitted scale refit to s/c reads the same
        // violation: the orbit concentrates in the scalar, and the scalar compensates exactly.
        let base = evaluate(1.25, 0.1, 0.7, 2.4, 3.1);
        let factor = 8.0;
        let rescaled = evaluate(1.25 / factor, 0.1, 0.7, 2.4 * factor, 3.1);

        assert!((base.violation - rescaled.violation).abs() < 1e-6);
    }
}
