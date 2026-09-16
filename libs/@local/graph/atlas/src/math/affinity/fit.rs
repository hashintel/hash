//! Least-squares fitting of the affinity curve to a membership falloff.
//!
//! For spread σ > 0 and minimum distance δ ∈ (0, σ], the target is h(d) = 1 for 0 ≤ d < δ and h(d)
//! = exp(−(d − δ)/σ) otherwise. A grid of m ≥ 8 distances uses dᵢ = i · rσ/(m − 1) for i from 0
//! through m − 1, where r > 0 is the range multiplier. The objective is Σᵢ(q(dᵢ) − h(dᵢ))², with
//! q(d) = 1 / (1 + a · d^(2b)).
//!
//! A two-parameter Levenberg-Marquardt iteration solves a symmetric damped 2x2 system in closed
//! form. It uses `f64` arithmetic and constant storage without a matrix library. Relative step and
//! cost-improvement thresholds terminate the search heuristically. Neither threshold certifies a
//! stationary point or a global minimum, and grid refinement can change the sampled optimum.

use core::num::NonZero;

use super::AffinityCurve;
use crate::math::{
    DFinite, DNonNegative, DPositive, Derivation, Positive, d_finite, d_positive, positive,
};

/// Sample count and distance range for the least-squares target.
///
/// [`AffinityCurve::fit`] uses the default grid. [`AffinityCurve::fit_with`] accepts a custom one.
/// Sample spacing determines resolution near the membership breakpoint, while the range determines
/// how much of the tail contributes to the objective.
///
/// # Example
///
/// This example is ignored because the fitting API and configuration are crate-private.
///
/// ```ignore
/// use crate::math::{AffinityCurve, affinity::fit::AffinityFitConfig, positive};
///
/// let default = AffinityCurve::fit(positive!(1.0), positive!(0.1))
///     .expect("reference inputs are well-conditioned");
/// let fine = AffinityCurve::fit_with(
///     positive!(1.0),
///     positive!(0.1),
///     AffinityFitConfig {
///         samples: 600,
///         ..AffinityFitConfig::default()
///     },
/// )
/// .expect("the solver accepts this grid and target");
///
/// // Compare the grid refinement on this particular target.
/// assert!((default.a() - fine.a()).abs() < 0.01);
/// ```
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct AffinityFitConfig {
    /// Number of evenly spaced sample distances for the least-squares target.
    ///
    /// More samples resolve the target falloff more finely, in particular around the
    /// `minimum_distance` breakpoint, at proportionally more work per solver pass. The fit requires at least [`MIN_SAMPLES`](Self::MIN_SAMPLES). The grid has 300 samples by default.
    pub samples: u16 = 300,
    /// The sampled range extends this many spreads from zero.
    ///
    /// Finite and strictly positive, with a value of 3 by default. Increasing the range at a fixed sample count coarsens the spacing and includes more of the tail. It can change the fit without any guaranteed direction of change in b. A range ending below the membership breakpoint samples only the flat plateau.
    pub range_in_spreads: Positive = positive!(3.0),
}

impl AffinityFitConfig {
    /// Fewest samples [`AffinityCurve::fit_with`] accepts.
    ///
    /// The configured fitting entry point requires eight samples, a threshold that by itself
    /// neither establishes a well-conditioned system nor ensures that both target regimes are
    /// sampled.
    pub(crate) const MIN_SAMPLES: NonZero<u16> = NonZero::new(8).unwrap();
}

impl AffinityCurve {
    /// Fits a curve from the desired membership falloff.
    ///
    /// This uses the [membership-falloff model](crate::math::affinity::fit) with 300 evenly spaced
    /// distances over [0, 3σ], where σ is `spread`. Levenberg-Marquardt iteration estimates the
    /// parameters in `f64` before narrowing to `f32`.
    ///
    /// Returns [`None`] when `minimum_distance` exceeds `spread`, when the solver rejects an
    /// evaluation or exhausts its retry/iteration limits, or when the final parameters do not
    /// narrow to finite positive `f32` values. Successful termination follows relative step or
    /// cost-improvement thresholds, without certifying an optimum.
    ///
    /// # Example
    ///
    /// This example is ignored because [`AffinityCurve`] is crate-private.
    ///
    /// ```ignore
    /// use crate::math::{AffinityCurve, positive};
    ///
    /// // The reference inputs: spread 1.0, minimum distance 0.1.
    /// let curve = AffinityCurve::fit(positive!(1.0), positive!(0.1))
    ///     .expect("reference inputs are well-conditioned");
    ///
    /// assert!((curve.a() - 1.577).abs() < 0.01);
    /// assert!((curve.b() - 0.895).abs() < 0.01);
    /// ```
    #[must_use]
    pub(crate) fn fit(spread: Positive, minimum_distance: Positive) -> Option<Self> {
        Self::fit_with(spread, minimum_distance, AffinityFitConfig::default())
    }

    /// Fits a curve from the desired membership falloff over a configured sample grid.
    ///
    /// This uses [`fit`](Self::fit)'s target and stopping criteria with
    /// [`config`](AffinityFitConfig)'s sample count and range. The grid covers [0, rσ], where r is
    /// [`range_in_spreads`](AffinityFitConfig::range_in_spreads) and σ is `spread`. Each solver
    /// evaluation takes O(m) time for m samples, with constant additional storage.
    ///
    /// Returns [`None`] when `minimum_distance` exceeds `spread`, when `config` has fewer than
    /// [`MIN_SAMPLES`](AffinityFitConfig::MIN_SAMPLES) samples, or when the solver or final
    /// parameter narrowing fails as described by [`fit`](Self::fit).
    #[must_use]
    pub(crate) fn fit_with(
        spread: Positive,
        minimum_distance: Positive,
        config: AffinityFitConfig,
    ) -> Option<Self> {
        if minimum_distance > spread {
            return None;
        }

        let samples_zero_based = NonZero::new(config.samples.saturating_sub(1))?;
        if samples_zero_based.saturating_add(1) < AffinityFitConfig::MIN_SAMPLES {
            return None;
        }

        let minimum_distance = minimum_distance.widen();

        // Positive f32 factors lie in [2⁻¹⁴⁹, 2¹²⁸), and their exact product lies in [2⁻²⁹⁸, 2²⁵⁶).
        // The guard puts the exact integer divisor in [7, 65534]. The quotient is therefore
        // positive and finite in f64, well above underflow.
        let step = (config.range_in_spreads.mul_wide(spread)
            / DPositive::from_u16(samples_zero_based))
        .finish_unchecked();

        let grid = SampleGrid::new(config.samples, step);

        let (a, b) = fit_curve(grid, |distance| {
            if distance < minimum_distance {
                1.0
            } else {
                ((-(distance - minimum_distance) / spread.widen()).into_raw()).exp()
            }
        })?;

        Some(Self::new(a.narrow()?, b.narrow()?))
    }
}

/// Initial Levenberg-Marquardt damping factor.
const INITIAL_DAMPING: f64 = 1e-3;
/// Multiplicative damping adjustment for accepted and rejected steps.
const DAMPING_SCALE: f64 = 3.0;
/// Upper bound on Levenberg-Marquardt outer iterations.
const MAX_ITERATIONS: u32 = 100;
/// Upper bound on consecutively rejected steps within one iteration.
const MAX_REJECTIONS: u32 = 16;
/// Relative step or cost-improvement threshold for successful termination.
const CONVERGENCE_TOLERANCE: f64 = 1e-10;

/// Evenly spaced sample distances of the fit target, starting at zero.
#[derive(Debug, Copy, Clone)]
pub(super) struct SampleGrid {
    /// Number of sample distances.
    samples: u16,
    /// Spacing between consecutive sample distances.
    step: DPositive,
}

impl SampleGrid {
    /// Creates a grid of `samples` distances spaced `step` apart from zero.
    ///
    /// Every requested index-times-step product must remain finite. This requirement is numerical
    /// and is not validated here.
    #[inline]
    #[must_use]
    pub(super) const fn new(samples: u16, step: DPositive) -> Self {
        Self { samples, step }
    }

    /// Returns the index-times-spacing product.
    ///
    /// The product must be finite, including when `index` lies outside the configured sample count.
    const fn distance(self, index: u16) -> DNonNegative {
        // A nonnegative integer times a positive finite step is nonnegative. The grid's numerical
        // contract supplies finiteness. Therefore the product, including underflow to zero, is in
        // DNonNegative's domain.
        DNonNegative::new_unchecked(DNonNegative::from_u16(index).get() * self.step.get())
    }
}

/// Objective, normal matrix and right-hand-side terms from one solver evaluation.
///
/// With residual vector r and Jacobian J in parameters (a, b), the `j_*` fields hold `JᵀJ` and the
/// `g_*` fields hold Jᵀr. The latter is the gradient of half the residual sum of squares.
#[derive(Debug, Copy, Clone)]
struct NormalEquations {
    /// Sum of squared residuals, the objective the fit minimizes.
    residual_sum_of_squares: DFinite,
    /// The `a`-`a` entry of the normal matrix.
    j_aa: DFinite,
    /// The symmetric off-diagonal entry of the normal matrix.
    j_ab: DFinite,
    /// The `b`-`b` entry of the normal matrix.
    j_bb: DFinite,
    /// The `a` component of Jᵀr.
    g_a: DFinite,
    /// The `b` component of Jᵀr.
    g_b: DFinite,
}

/// Unvalidated sums for one objective and Jacobian evaluation.
struct NormalEquationsDerivation {
    residual_sum_of_squares: Derivation<DFinite>,
    j_aa: Derivation<DFinite>,
    j_ab: Derivation<DFinite>,
    j_bb: Derivation<DFinite>,
    g_a: Derivation<DFinite>,
    g_b: Derivation<DFinite>,
}

impl NormalEquationsDerivation {
    /// Empty sums before the first sample.
    const ZERO: Self = Self {
        residual_sum_of_squares: Derivation::ZERO,
        j_aa: Derivation::ZERO,
        j_ab: Derivation::ZERO,
        j_bb: Derivation::ZERO,
        g_a: Derivation::ZERO,
        g_b: Derivation::ZERO,
    };

    /// Validates the accumulated sums, returning [`None`] if any is non-finite.
    fn finish(self) -> Option<NormalEquations> {
        Some(NormalEquations {
            residual_sum_of_squares: self.residual_sum_of_squares.finish().ok()?,
            j_aa: self.j_aa.finish().ok()?,
            j_ab: self.j_ab.finish().ok()?,
            j_bb: self.j_bb.finish().ok()?,
            g_a: self.g_a.finish().ok()?,
            g_b: self.g_b.finish().ok()?,
        })
    }
}

/// Estimates positive affinity parameters for a sampled target.
///
/// Both parameters start at one and remain finite and strictly positive. Each iteration solves the
/// damped 2x2 normal equations of the analytic Jacobian, accepting a step only when it lowers the
/// computed residual sum of squares. Rejections multiply damping by three, and acceptance divides
/// it by three.
///
/// Returns the current parameters when both relative damped steps are at most 10⁻¹⁰, or when an
/// accepted relative cost improvement is at most 10⁻¹⁰. A small damped step can result from large
/// damping rather than stationarity. Returns [`None`] when the initial evaluation fails its
/// finiteness check, all 16 retries of an iteration fail, or 100 outer iterations finish without a
/// stopping criterion.
///
/// `grid` must satisfy its finite-distance contract, and `target` must return the same value for a
/// distance throughout the fit. It can be evaluated repeatedly at every grid point.
///
/// # Panics
///
/// Propagates a panic from `target`.
pub(super) fn fit_curve(
    grid: SampleGrid,
    target: impl Fn(DNonNegative) -> f64,
) -> Option<(DPositive, DPositive)> {
    // initialize at q(d) = 1 / (1 + d²)
    let (mut a, mut b) = (DPositive::ONE, DPositive::ONE);

    let mut equations = evaluate(grid, &target, a, b)?;
    let mut damping = INITIAL_DAMPING;

    for _ in 0..MAX_ITERATIONS {
        let mut stepped = false;

        for _ in 0..MAX_REJECTIONS {
            let step = solve_damped(equations, damping);
            let Some((step_a, step_b)) = step else {
                damping *= DAMPING_SCALE;
                continue;
            };

            // small damped steps terminate the search without a separate gradient-norm test
            if step_a.abs() <= CONVERGENCE_TOLERANCE * a
                && step_b.abs() <= CONVERGENCE_TOLERANCE * b
            {
                return Some((a, b));
            }

            // reject steps leaving the positive finite parameter domain
            let (Some(next_a), Some(next_b)) =
                (DPositive::new(a + step_a), DPositive::new(b + step_b))
            else {
                damping *= DAMPING_SCALE;
                continue;
            };

            let Some(next) = evaluate(grid, &target, next_a, next_b) else {
                damping *= DAMPING_SCALE;
                continue;
            };
            if next.residual_sum_of_squares >= equations.residual_sum_of_squares {
                damping *= DAMPING_SCALE;
                continue;
            }

            let improvement = equations.residual_sum_of_squares - next.residual_sum_of_squares;
            let converged =
                improvement <= CONVERGENCE_TOLERANCE * equations.residual_sum_of_squares;

            (a, b) = (next_a, next_b);
            equations = next;
            damping /= DAMPING_SCALE;

            if converged {
                return Some((a, b));
            }

            stepped = true;
            break;
        }

        if !stepped {
            return None;
        }
    }

    None
}

/// Accumulates one pass of the fit objective at the given parameters.
///
/// For P = d^(2b) and Z = 1 + aP, the residual is r = 1/Z − target(d). At d > 0 the analytic
/// partials are ∂r/∂a = −P/Z² and ∂r/∂b = −2aP ln(d)/Z². At d = 0, positive b gives P = 0 and both
/// partials vanish. Skipping those partials avoids evaluating ln(0).
///
/// The pass accumulates Σr², `JᵀJ` and Jᵀr in `f64`. Every grid distance must satisfy
/// [`DNonNegative`]'s finite-result contract. Returns [`None`] when 2b overflows or the final
/// accumulated sums include a non-finite value.
///
/// # Panics
///
/// Propagates a panic from `target`.
fn evaluate(
    grid: SampleGrid,
    target: &impl Fn(DNonNegative) -> f64,
    a: DPositive,
    b: DPositive,
) -> Option<NormalEquations> {
    let mut sums = NormalEquationsDerivation::ZERO;
    let exponent = (d_positive!(2.0) * b).finish().ok()?;

    for index in 0..grid.samples {
        let distance = grid.distance(index);
        let power = distance.powf(exponent.into());

        let denominator = Derivation::from(DNonNegative::from(a)).mul_add(power, DPositive::ONE);
        let residual = Derivation::from(DFinite::ONE) / denominator - target(distance);

        sums.residual_sum_of_squares = residual.mul_add(residual, sums.residual_sum_of_squares);

        // the zero-distance sample contributes residual error with zero parameter partials
        let Some(distance) = distance.positive() else {
            continue;
        };

        let denominator_squared = denominator * denominator;
        let partial_a = (Derivation::from(-DFinite::ONE) * power) / denominator_squared;
        let partial_b = (d_finite!(-2.0) * a * power * distance.ln()) / denominator_squared;

        sums.j_aa = partial_a.mul_add(partial_a, sums.j_aa);
        sums.j_ab = partial_a.mul_add(partial_b, sums.j_ab);
        sums.j_bb = partial_b.mul_add(partial_b, sums.j_bb);
        sums.g_a = partial_a.mul_add(residual, sums.g_a);
        sums.g_b = partial_b.mul_add(residual, sums.g_b);
    }

    sums.finish()
}

/// Solves the multiplicatively damped 2x2 normal system.
///
/// With H = `JᵀJ` and g = Jᵀr, the system is MΔ = −g, where M = H + λ diag(H) and λ is `damping`.
/// Cramer's rule gives each step component from the determinant. For exact positive-semidefinite H
/// with both diagonal entries positive, λ > 0 makes M positive definite. A zero diagonal remains
/// zero under this damping.
///
/// Returns [`None`] when the computed determinant is non-finite or at most ε · M₀₀ · M₁₁, where ε
/// is [`f64::EPSILON`], or when a computed step is non-finite. This numerical floor rejects
/// near-cancellation, without certifying exact conditioning.
fn solve_damped(equations: NormalEquations, damping: f64) -> Option<(f64, f64)> {
    let damped_aa = Derivation::from(equations.j_aa) * (1.0 + damping);
    let damped_bb = Derivation::from(equations.j_bb) * (1.0 + damping);
    let determinant = damped_aa
        .mul_add(damped_bb, -(equations.j_ab * equations.j_ab))
        .finish()
        .ok()?
        .positive()?;

    // compare determinant cancellation against the product scale of both damped diagonals
    let determinant_floor = (damped_aa * d_positive!(f64::EPSILON) * damped_bb)
        .finish()
        .ok()?;
    if DFinite::from(determinant) <= determinant_floor {
        return None;
    }

    let step_a = Derivation::from(equations.j_ab)
        .mul_add(equations.g_b, -(damped_bb * equations.g_a))
        / determinant;
    let step_b = Derivation::from(equations.j_ab)
        .mul_add(equations.g_a, -(damped_aa * equations.g_b))
        / determinant;
    Some((step_a.finish().ok()?.get(), step_b.finish().ok()?.get()))
}

#[cfg(test)]
mod tests {
    use super::{SampleGrid, evaluate};
    use crate::math::{DPositive, d_positive};

    #[test]
    fn evaluation_power_overflow() {
        // The affinity rounds to zero, but the parameter partials contain ∞/∞.
        let equations = evaluate(
            SampleGrid::new(2, d_positive!(1e200)),
            &|_| 0.0,
            DPositive::ONE,
            DPositive::ONE,
        );
        assert!(equations.is_none());
    }

    #[test]
    fn evaluation_exponent_overflow() {
        let equations = evaluate(
            SampleGrid::new(2, DPositive::ONE),
            &|_| 0.0,
            DPositive::ONE,
            d_positive!(f64::MAX),
        );
        assert!(equations.is_none());
    }
}
