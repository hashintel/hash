//! Least-squares fitting of the affinity curve to a membership falloff.
//!
//! The fit is a two-parameter Levenberg-Marquardt loop whose normal equations are a symmetric 2x2
//! system solved in closed form. The loop needs no matrix library and allocates nothing on any
//! path.

use core::num::NonZero;

use super::AffinityCurve;
use crate::math::{DNonNegative, DPositive, Positive, positive, scalar::narrow_f32};

/// The sample grid a fit runs over.
///
/// [`AffinityCurve::fit`] uses the default grid. [`AffinityCurve::fit_with`] accepts a custom one.
/// The grid determines which distances vote in the least-squares balance between the fitted curve
/// and the target falloff: its resolution around the membership breakpoint and how far into the
/// tail it reaches.
///
/// # Examples
///
/// ```ignore
/// let default = AffinityCurve::fit(positive!(1.0), positive!(0.1))
///     .expect("reference inputs are well-conditioned");
/// let fine = AffinityCurve::fit_with(
///     1.0,
///     0.1,
///     AffinityFitConfig {
///         samples: 600,
///         ..AffinityFitConfig::default()
///     },
/// )
/// .expect("a finer grid stays well-conditioned");
///
/// // Refining the grid moves the fit only slightly: the parameters are
/// // stable under discretization.
/// assert!((default.a() - fine.a()).abs() < 0.01);
/// ```
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct AffinityFitConfig {
    /// Number of evenly spaced sample distances for the least-squares target.
    ///
    /// More samples resolve the target falloff more finely, in particular around the
    /// `minimum_distance` breakpoint, at proportionally more work per solver pass. At least
    /// [`MIN_SAMPLES`](Self::MIN_SAMPLES).
    pub samples: u16 = 300,
    /// The sampled range extends this many spreads from zero.
    ///
    /// A wider range weights the tail of the falloff more: far samples gain votes in the
    /// least-squares balance, sharpening the fitted tail exponent `b` at the cost of fidelity near
    /// the breakpoint. Finite and strictly positive.
    pub range_in_spreads: Positive = positive!(3.0),
}

impl AffinityFitConfig {
    /// Fewest samples [`AffinityCurve::fit_with`] accepts.
    ///
    /// The two-parameter fit needs the grid to populate both regimes of the piecewise target (the
    /// flat membership plateau inside `minimum_distance` and the exponential tail beyond it) with a
    /// handful of points each. Below eight samples the grid underdetermines the fit against the
    /// target the curve traces.
    pub(crate) const MIN_SAMPLES: u16 = 8;
}

impl AffinityCurve {
    /// Fits a curve from the desired membership falloff.
    ///
    /// The falloff keeps membership at `1` inside `minimum_distance` and decays as `exp(-(d -
    /// minimum_distance) / spread)` beyond it. This method samples the falloff on the crate's
    /// default grid (300 evenly spaced distances over `[0, 3 · spread]`) and fits the curve to the
    /// samples by Levenberg-Marquardt least squares. The fit runs once at initialization in double
    /// precision and narrows the result to the working `f32` parameters.
    ///
    /// Returns [`None`] when `minimum_distance` exceeds `spread`, or when the least-squares fit
    /// fails to converge to parameters that [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```ignore
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
    /// The falloff keeps membership at `1` inside `minimum_distance` and decays as `exp(-(d -
    /// minimum_distance) / spread)` beyond it. This method samples it at
    /// [`samples`](AffinityFitConfig::samples) evenly spaced distances over `[0, range_in_spreads *
    /// spread]` and fits the curve to the samples by Levenberg-Marquardt least squares, in double
    /// precision, narrowing the result to the working `f32` parameters. [`fit`](Self::fit)
    /// delegates here with the default grid.
    ///
    /// Returns [`None`] when `minimum_distance` exceeds `spread`, when `config` holds fewer than
    /// [`MIN_SAMPLES`](AffinityFitConfig::MIN_SAMPLES) samples, or when the least-squares fit
    /// fails to converge to parameters that [`new`](Self::new) accepts.
    #[must_use]
    pub(crate) fn fit_with(
        spread: Positive,
        minimum_distance: Positive,
        config: AffinityFitConfig,
    ) -> Option<Self> {
        if minimum_distance > spread {
            return None;
        }

        if config.samples < AffinityFitConfig::MIN_SAMPLES {
            return None;
        }

        let spread = spread.widen();
        let minimum_distance = minimum_distance.widen();
        let grid = SampleGrid::new(
            config.samples,
            config.range_in_spreads.widen() * spread
                / DPositive::from_u16(NonZero::new(config.samples - 1)?),
        );

        let (a, b) = fit_curve(grid, |distance| {
            if distance < minimum_distance {
                1.0
            } else {
                (-(distance - minimum_distance) / spread).exp()
            }
        })?;

        Self::new(narrow_f32(a.get())?, narrow_f32(b.get())?)
    }
}

/// Initial Levenberg-Marquardt damping factor.
const INITIAL_DAMPING: f64 = 1e-3;
/// Multiplicative damping adjustment: accepted steps divide by it, rejected steps multiply.
const DAMPING_SCALE: f64 = 3.0;
/// Upper bound on accepted Levenberg-Marquardt iterations.
const MAX_ITERATIONS: u32 = 100;
/// Upper bound on consecutively rejected steps within one iteration.
const MAX_REJECTIONS: u32 = 16;
/// Relative tolerance below which a step or a cost improvement counts as converged.
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
    #[inline]
    #[must_use]
    pub(super) const fn new(samples: u16, step: DPositive) -> Self {
        Self { samples, step }
    }

    /// Returns the sample distance at an index.
    const fn distance(self, index: u16) -> DNonNegative {
        DNonNegative::from_u16(index) * self.step
    }
}

/// Sums of one solver pass: the least-squares objective and the terms of the 2x2 normal equations.
///
/// With the residual vector `r` and its Jacobian `J` in `(a, b)`, the `j_*` fields are the entries
/// of the normal matrix `J^T J` and the `g_*` fields the entries of the gradient `J^T r`.
#[derive(Debug, Copy, Clone)]
struct NormalEquations {
    /// Sum of squared residuals, the objective the fit minimizes.
    residual_sum_of_squares: f64,
    /// The `a`-`a` entry of the normal matrix.
    j_aa: f64,
    /// The symmetric off-diagonal entry of the normal matrix.
    j_ab: f64,
    /// The `b`-`b` entry of the normal matrix.
    j_bb: f64,
    /// The `a` component of the gradient.
    g_a: f64,
    /// The `b` component of the gradient.
    g_b: f64,
}

impl NormalEquations {
    /// The additive identity every accumulation pass starts from.
    const ZERO: Self = Self {
        residual_sum_of_squares: 0.0,
        j_aa: 0.0,
        j_ab: 0.0,
        j_bb: 0.0,
        g_a: 0.0,
        g_b: 0.0,
    };

    /// Returns whether every accumulated sum is finite.
    const fn is_finite(self) -> bool {
        self.residual_sum_of_squares.is_finite()
            && self.j_aa.is_finite()
            && self.j_ab.is_finite()
            && self.j_bb.is_finite()
            && self.g_a.is_finite()
            && self.g_b.is_finite()
    }
}

/// Fits the affinity curve `1 / (1 + a · d^(2b))` to a target sampled on a grid.
///
/// By Levenberg-Marquardt least squares.
///
/// Both parameters start at `1` and stay strictly positive throughout. Each iteration solves the
/// damped 2x2 normal equations of the analytic Jacobian in closed form and accepts the step when it
/// lowers the residual sum of squares. Rejected steps raise the damping and retry. Returns the
/// fitted `(a, b)`, or [`None`] when the initial evaluation is non-finite, when every damping retry
/// of an iteration fails, or when the iteration cap passes without convergence.
pub(super) fn fit_curve(
    grid: SampleGrid,
    target: impl Fn(DNonNegative) -> f64,
) -> Option<(DPositive, DPositive)> {
    // Both parameters start at 1, the neutral point of the curve's
    // O(1) parametrization. The damping retries absorb a rough start.
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

            // A negligible step means the damped gradient no longer
            // moves either parameter: a stationary point.
            if step_a.abs() <= CONVERGENCE_TOLERANCE * a
                && step_b.abs() <= CONVERGENCE_TOLERANCE * b
            {
                return Some((a, b));
            }

            // `AffinityCurve::new` accepts strictly positive parameters
            // only; a step that leaves the domain is a failed step, not
            // an error.
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
/// Computes the residual `1 / (1 + a · d^(2b)) - target(d)` and its analytic partial derivatives at
/// every grid distance, folding the residual sum of squares and the normal-equation sums in a
/// single pass, accumulated in double precision. `b` is strictly positive, so the zero-distance
/// sample contributes `d^(2b) = 0` to its residual; its partials are zero in both parameters, and
/// skipping them keeps `ln` off distance zero.
///
/// Returns [`None`] when any accumulated sum turns non-finite.
fn evaluate(
    grid: SampleGrid,
    target: &impl Fn(DNonNegative) -> f64,
    a: DPositive,
    b: DPositive,
) -> Option<NormalEquations> {
    let mut sums = NormalEquations::ZERO;

    for index in 0..grid.samples {
        let distance = grid.distance(index);
        let power = distance.powf(2.0 * b);
        let denominator = a.mul_add(power, DPositive::ONE);
        let residual = 1.0 / denominator - target(distance);
        sums.residual_sum_of_squares = residual.mul_add(residual, sums.residual_sum_of_squares);

        // The zero-distance sample contributes value alone; its partials vanish, and the
        // narrowing keeps `ln` off distance zero.
        let Some(distance) = distance.positive() else {
            continue;
        };

        let denominator_squared = denominator * denominator;
        let partial_a = -power / denominator_squared;
        let partial_b = -(2.0 * a * power * distance.ln()) / denominator_squared;
        sums.j_aa = partial_a.mul_add(partial_a, sums.j_aa);
        sums.j_ab = partial_a.mul_add(partial_b, sums.j_ab);
        sums.j_bb = partial_b.mul_add(partial_b, sums.j_bb);
        sums.g_a = partial_a.mul_add(residual, sums.g_a);
        sums.g_b = partial_b.mul_add(residual, sums.g_b);
    }

    sums.is_finite().then_some(sums)
}

/// Solves the damped normal equations for one Levenberg-Marquardt step in closed form.
///
/// Dampens each diagonal entry of `J^T J` by `1 + damping` and solves the symmetric 2x2 system `M *
/// step = -g` by Cramer's rule. Returns [`None`] when the damped determinant falls to the
/// cancellation floor (the system is numerically singular at this damping; a larger damping factor
/// restores diagonal dominance) or when the step is non-finite.
fn solve_damped(equations: NormalEquations, damping: f64) -> Option<(f64, f64)> {
    let damped_aa = equations.j_aa * (1.0 + damping);
    let damped_bb = equations.j_bb * (1.0 + damping);
    let determinant = damped_aa.mul_add(damped_bb, -(equations.j_ab * equations.j_ab));

    // The damped matrix is positive definite in exact arithmetic; at or
    // below the floor the closed form divides cancellation noise.
    if !determinant.is_finite() || determinant <= f64::EPSILON * damped_aa * damped_bb {
        return None;
    }

    let step_a = equations
        .j_ab
        .mul_add(equations.g_b, -(damped_bb * equations.g_a))
        / determinant;
    let step_b = equations
        .j_ab
        .mul_add(equations.g_a, -(damped_aa * equations.g_b))
        / determinant;
    (step_a.is_finite() && step_b.is_finite()).then_some((step_a, step_b))
}
