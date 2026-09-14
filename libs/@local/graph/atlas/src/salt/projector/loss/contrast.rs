//! The paired counterfactual-contraction violation and its exact partial derivatives.
//!
//! For an eligible pair read at the zero and canonical conditions, the violation is `v = (s·d_c −
//! d₀)/σ₀ + m`. The aligned canonical distance is compared against the zero distance in units of
//! the pair's frozen ruler `σ₀`, and the margin `m` offsets the comparison. Contraction means `v`
//! falls. Equality of the two distances is a failure to contract, and a non-negative margin keeps
//! it one. The penalty applied to `v` and the per-pair weight are the batch term's to fold. This
//! module owns the violation and its live partials, evaluated fused, and the pair loops apply
//! them without deriving anything themselves.
//!
//! The fitted scale `s` is live. It comes from the similarity alignment of the canonical field
//! onto the zero field, refit whenever the fields move, and it carries a derivative. Rotation and
//! translation cancel in pair distances, and the refit scale absorbs a uniform scaling, which
//! concentrates the whole alignment orbit in this one scalar. The violation's value is therefore
//! invariant under translation, rotation, and uniform scaling of the canonical field, and its
//! scalar partials in the distances and the scale are invariant under translation and rotation,
//! while the coordinate gradients transform with the coordinates. Under a uniform scaling of the
//! canonical field by `c > 0`, with the zero field and the ruler fixed, `d_c` becomes `c·d_c` and
//! the refit scale becomes `s/c`: the product `s·d_c` and `v` remain unchanged, `∂v/∂d_c = s/σ₀`
//! divides by `c`, `∂v/∂d₀ = −1/σ₀` remains unchanged, and `∂v/∂s = d_c/σ₀` multiplies by `c`.
//! These laws hold in exact real arithmetic, and a finite-precision refit and evaluation can round
//! differently after the transformation.
//!
//! The ruler `σ₀` is a declared constant of the estimand, measured once on the zero-condition
//! snapshot taken before the objective's first gradient and frozen with the generation. No
//! gradient exists through it, because nothing live enters it. A live ruler would hand the
//! optimizer its own unit of account, and a detached copy of a live quantity would lie about the
//! derivative. A frozen constant does neither.
//!
//! The zero-side partial `∂v/∂d₀ = −1/σ₀` is negative: the optimizer is paid to inflate a
//! violating pair's zero distance. The reward is real and stays in the gradient. What holds it is
//! the per-row band projection on the zero field, never the derivative's absence, and an
//! implementation that detaches or drops the zero-side path optimizes a different objective whose
//! constraint claim is false. The hand derivation exists to keep these signs exact.
//!
//! At coincidence either distance's direction vector is undefined, and the coordinate fold
//! deposits a zero contribution for that distance while the value still counts. The slopes this
//! module returns are direction-free scalars. Zeroing the fold at coincidence is the batch term's
//! contract, stated on [`ContrastEnergy::evaluate`].

use crate::math::{DNonNegative, DPositive, Negative, NonNegative, Positive};

/// The per-evaluation constants of the contrast violation.
///
/// The fitted scale is the similarity alignment's scalar for the evaluation being scored, and
/// the margin is the violation's offset at distance equality. Both are constant across the pairs of
/// one evaluation.
///
/// The margin's domain is non-negative because equality must stay a failure to contract: a
/// negative margin would score `s·d_c = d₀` as satisfied, and the objective's product meaning is
/// that an uncontracted pair is never satisfied. The margin's value remains an open choice. Its
/// domain does not.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ContrastEnergy {
    fitted_scale: Positive,
    margin: NonNegative,
}

/// One pair's violation and its three live partial derivatives, fused.
///
/// The widened slopes carry an unconditional finite-domain guarantee, the zero slope a conditional
/// one, and the violation none. The canonical and fitted-scale slopes are widened quotients of
/// in-domain `f32`-born values and never leave their domains. The zero slope is a negated `f32`
/// reciprocal, in domain for every ruler above `2⁻¹²⁸`. The violation is a raw `f32` that overflows
/// at inputs inside every documented domain: a fitted scale of `f32::MAX` with a canonical distance
/// of `2` under a ruler of `1` reads `+∞` with the zero distance and the margin at `0`.
/// [`ContrastEnergy::evaluate`] states the ranges.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ContrastEvaluation {
    /// The violation `v = (s·d_c − d₀)/σ₀ + m`, raw: it can overflow to either infinity.
    ///
    /// Every operation is `f32` arithmetic rounded to nearest, and an operation overflows when
    /// its rounded result exceeds `f32::MAX` in magnitude: an exact result less than half an ulp
    /// (`2¹⁰³`) beyond `f32::MAX` rounds back to it and remains finite, and one at least that far
    /// rounds to the infinity of its sign. Three of the four operations can overflow. The aligned
    /// product `s·d_c` overflows to `+∞`. The quotient by `σ₀` overflows to `+∞` or `−∞`,
    /// following the sign of the difference `s·d_c − d₀`, and with a finite product that needs a
    /// ruler below one. The final addition of the margin overflows to `+∞`: at `s = 1`,
    /// `d_c = m = f32::MAX`, `d₀ = 0` and `σ₀ = 1` the product and the quotient read `f32::MAX`
    /// and the sum reads `+∞`. The subtraction cannot overflow, because the difference of two
    /// non-negative values never exceeds the larger of them in magnitude. Every input is finite.
    /// The reading is therefore never NaN: an overflow yields an infinity, and every later operand
    /// is finite.
    pub violation: f32,
    /// The canonical slope `∂v/∂d_c = s/σ₀`, strictly positive.
    ///
    /// Shrinking the aligned canonical distance is the objective's productive direction. The
    /// slope is total: the widened quotient of two `f32`-born positives never leaves the domain.
    pub canonical_slope: DPositive,
    /// The zero slope `∂v/∂d₀ = −1/σ₀`, strictly negative.
    ///
    /// The reward for inflating the zero distance, present and honest, held by the band
    /// projection rather than hidden from the gradient. In domain for every ruler above `2⁻¹²⁸`.
    /// A ruler at or below it overflows the `f32` reciprocal, and the slope leaves its domain, as
    /// [`ContrastEnergy::evaluate`] states.
    pub zero_slope: Negative,
    /// The fitted-scale slope `∂v/∂s = d_c/σ₀`, zero exactly at canonical coincidence.
    ///
    /// Non-negative, and total by the same widened quotient as the canonical slope. Its adjoint
    /// fans into the gauge anchors' canonical coordinates through the alignment fit.
    pub fitted_scale_slope: DNonNegative,
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

    /// Evaluates one pair's violation and its partials in the two distances and the scale.
    ///
    /// `ruler` is the pair's frozen `σ₀`, strictly positive by construction of the frozen table.
    /// `canonical_distance` and `zero_distance` are the raw (unaligned) canonical and zero-frame
    /// pair distances, finite and non-negative in their typed domain. A distance whose `f32`
    /// computation escaped to `+∞` lies outside that domain, and the violation then follows the
    /// other operand. An infinite canonical distance reads an infinite fitted-scale slope and,
    /// against a finite zero distance, a `+∞` violation. An infinite zero distance against a
    /// finite aligned distance `s·d_c` reads a `−∞` violation. An infinite aligned distance
    /// against an infinite zero distance reads NaN, the difference `∞ − ∞`, whether the canonical
    /// distance escaped or the product `s·d_c` alone overflowed. The guarantees below, the
    /// violation's never-NaN reading included, hold inside the domain.
    ///
    /// Positivity defines every quotient here and makes the two widened ones total: `s/σ₀` and
    /// `d_c/σ₀` divide `f32`-born values in `f64` and stay in their domains at every input, with
    /// no condition on the ruler. The other two divisions run in `f32`, where positivity is not
    /// enough. The formula `−1/σ₀` is finite for every positive real ruler, and
    /// [`Positive::recip`] forms it as an `f32` division, which overflows for a ruler at or below
    /// `2⁻¹²⁸` (below `1/f32::MAX`, a subnormal such as `f32::from_bits(1)`). The zero slope's
    /// guarantee is therefore conditional. A ruler above `2⁻¹²⁸`, where every normal `f32` lies,
    /// keeps it in domain, and a ruler at or below that bound leaves the returned slope outside
    /// the [`Negative`] domain. The violation is raw at every ruler, as its field states.
    ///
    /// The returned slopes are scalars in the distances. A coordinate gradient multiplies a slope
    /// by the gradient of the pair distance `d = ‖y_source − y_target‖` between the endpoint
    /// coordinates, the unit direction `(y_source − y_target)/d`, defined wherever `d > 0`. At
    /// coincidence, `d = 0`, the norm has no gradient and its subdifferential is the closed unit
    /// ball: every vector of norm at most one is a subgradient. The caller folds the zero vector
    /// there, the symmetric choice among those subgradients rather than a continuous limit,
    /// keeping the value and dropping that distance's pull. The distance's scalar slope remains
    /// `s/σ₀` or `−1/σ₀` at coincidence, and the pull the caller deposits also carries the slope
    /// `φ′(v)` of the penalty `φ` applied to `v`, which the quadratic hinge sets to zero at or
    /// below a zero violation.
    #[must_use]
    pub(crate) const fn evaluate(
        self,
        ruler: Positive,
        canonical_distance: NonNegative,
        zero_distance: NonNegative,
    ) -> ContrastEvaluation {
        let scale = self.fitted_scale;
        // The aligned product and the violation are raw: two unbounded working-precision
        // factors can overflow, and the difference crosses signs. The estimator's fold finish
        // is the check.
        let aligned = scale.get() * canonical_distance;

        ContrastEvaluation {
            violation: (aligned - zero_distance.get()) / ruler + self.margin.get(),
            canonical_slope: scale.div_wide(ruler),
            // `Positive::recip` divides in `f32` and only debug-asserts finiteness: a ruler at or
            // below 2⁻¹²⁸ panics there with debug assertions enabled and reads `−∞` inside
            // `Negative` without them.
            zero_slope: -ruler.recip(),
            fitted_scale_slope: canonical_distance.div_wide(ruler),
        }
    }
}

#[cfg(test)]
mod tests {

    use super::{ContrastEnergy, ContrastEvaluation};
    use crate::math::{NonNegative, Positive};

    /// Estimates `function`'s derivative at `at` by a central difference of half-width `step`.
    fn central_difference(function: impl Fn(f64) -> f64, at: f64, step: f64) -> f64 {
        (function(at + step) - function(at - step)) / (2.0 * step)
    }

    /// Computes the violation in `f64` from its defining expression, for finite differences.
    #[expect(
        clippy::suboptimal_flops,
        reason = "the reference states the defining expression verbatim"
    )]
    fn violation(scale: f64, margin: f64, ruler: f64, canonical: f64, zero: f64) -> f64 {
        (scale * canonical - zero) / ruler + margin
    }

    /// Builds a contrast energy from raw values and evaluates it at the given ruler and distances.
    ///
    /// # Panics
    ///
    /// This panics when `scale` or `ruler` is not finite and positive, or when `margin`,
    /// `canonical` or `zero` is not finite and non-negative: the typed constructors refuse the
    /// value, and the `expect` names the argument.
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

    /// The slopes agree with central finite differences of the violation within `1e-6`.
    ///
    /// The violation is affine in each argument varied. The central difference is therefore the
    /// exact partial up to `f64` rounding. The implementation evaluates at the `f32`-rounded
    /// constants and the reference at the unrounded ones: at most two roundings of relative size
    /// `2⁻²⁴` on slopes below `3.5` keep every compared slope within `5·10⁻⁷`, inside the
    /// tolerance.
    #[test]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the fixture constants round to f32 at the cast, and the tolerance exceeds the \
                  slope error that rounding induces"
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

    /// The signs follow the formula: `s/σ₀ > 0`, `−1/σ₀ < 0` and `d_c/σ₀ > 0` off coincidence.
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
        // s·d_c = 2.0 = d₀: the violation is exactly the margin.
        let evaluation = evaluate(0.5, 0.25, 0.8, 4.0, 2.0);
        assert!((evaluation.violation - 0.25).abs() < 1e-6);
    }

    /// Doubling the ruler halves every slope within `1e-7`.
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

    /// Scaling `d_c` by `c` and `s` by `1/c` leaves the violation unchanged.
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
