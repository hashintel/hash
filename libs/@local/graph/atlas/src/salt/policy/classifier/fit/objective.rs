//! The regularized soft-target objective and its L-BFGS driver.
//!
//! Parameters are one flat vector `[w_C | w_P | w_O | b]`: the three
//! coefficient rows in class order followed by the three intercepts.
//! [`fit_model`] minimizes the weighted soft-label cross-entropy plus
//! the coefficient L2 penalty from zero initial parameters and returns
//! the parameters only when the Euclidean gradient norm reaches the
//! configured tolerance.
//!
//! The objective is evaluated in double precision; `f32` embeddings
//! enter through [`AlignedVecN::dot_wide`] and
//! [`DVecN::add_scaled`](crate::math::DVecN::add_scaled). A trial step
//! that overflows evaluates to `f64::INFINITY`, which the Armijo
//! condition rejects like any insufficient step, so the line search
//! backs off toward the finite region instead of aborting.

use argmin::{
    core::{CostFunction, Executor, Gradient, State as _},
    solver::{
        linesearch::{BacktrackingLineSearch, condition::ArmijoCondition},
        quasinewton::LBFGS,
    },
};

use super::{FitConfig, FitError, TrainingSet};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, AlignedVecN, BoxedDVecN, DVecN, VecN},
    salt::policy::GeometryClass,
};

/// Coefficient components ahead of the intercepts.
const COEFFICIENT_COUNT: usize = GeometryClass::COUNT * CANONICAL_DIMENSIONS;

/// Flat parameter dimension: coefficients plus intercepts.
pub(super) const PARAMETER_COUNT: usize = COEFFICIENT_COUNT + GeometryClass::COUNT;

/// The flat parameter and gradient vector.
pub(super) type Parameters = BoxedDVecN<PARAMETER_COUNT>;

/// Sufficient-decrease constant of the Armijo condition.
const ARMIJO: f64 = 1.0e-4;

/// Backtracking contraction factor.
const BACKTRACKING_FACTOR: f64 = 0.5;

/// The weighted objective over one training portion of the corpus.
///
/// Membership is a view: the objective sees every row whose fold is
/// not held out, and the full corpus when no fold is. Nothing is
/// materialized per fold.
#[derive(Debug, Copy, Clone)]
pub(super) struct Objective<'fit> {
    pub training: TrainingSet<'fit>,
    /// Fold assignment per training row.
    pub folds: &'fit [usize],
    /// The validation fold excluded from this fit, [`None`] for the
    /// full corpus.
    pub held_out: Option<usize>,
    pub regularization: f64,
}

/// The shared softmax quantities of one row evaluation.
struct RowSoftmax {
    logits: [f64; GeometryClass::COUNT],
    exponentials: [f64; GeometryClass::COUNT],
    denominator: f64,
    maximum: f64,
}

impl RowSoftmax {
    fn new(parameters: &Parameters, embedding: &AlignedVecN<CANONICAL_DIMENSIONS>) -> Self {
        let logits = logits(parameters, embedding);
        let maximum = logits.into_iter().fold(f64::NEG_INFINITY, f64::max);
        let exponentials = logits.map(|logit| (logit - maximum).exp());

        Self {
            logits,
            exponentials,
            denominator: exponentials.into_iter().sum(),
            maximum,
        }
    }
}

// The cost and gradient run the same per-row prelude twice per
// accepted step because argmin's traits evaluate them separately. The
// line search only evaluates the cost, so a fused evaluation would
// save one prelude per iteration at the price of caching state across
// trait calls; it is not worth it at corpus scale.
impl Objective<'_> {
    fn members(&self) -> impl Iterator<Item = usize> {
        let held_out = self.held_out;
        self.folds
            .iter()
            .enumerate()
            .filter(move |(_, fold)| held_out.is_none_or(|held_out| **fold != held_out))
            .map(|(row, _)| row)
    }

    /// Requires positive target mass for every class in the training
    /// portion.
    pub(super) fn validate_class_mass(&self) -> Result<(), FitError> {
        let mut masses = [0.0_f64; GeometryClass::COUNT];
        for row_index in self.members() {
            let row = self.training.rows()[row_index];
            for (mass, target) in masses.iter_mut().zip(row.target) {
                *mass = target.mul_add(row.weight, *mass);
            }
        }

        if let Some(class) = masses.iter().position(|mass| *mass <= 0.0) {
            return Err(FitError::MissingClassMass {
                class: GeometryClass::VARIANTS[class],
            });
        }
        Ok(())
    }

    pub(super) fn cost_value(&self, parameters: &Parameters) -> f64 {
        let mut objective = 0.0;
        for row_index in self.members() {
            let row = self.training.rows()[row_index];
            let softmax = RowSoftmax::new(parameters, self.training.embedding(row_index));
            let log_normalizer = softmax.maximum + softmax.denominator.ln();

            let target_logit = row
                .target
                .into_iter()
                .zip(softmax.logits)
                .map(|(target, logit)| target * logit)
                .sum::<f64>();

            let target_mass = row.target.into_iter().sum::<f64>();
            objective = row.weight.mul_add(
                target_mass.mul_add(log_normalizer, -target_logit),
                objective,
            );
        }

        let (rows, _) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
        for row in rows {
            objective =
                (0.5 * self.regularization).mul_add(DVecN::from_ref(row).norm_squared(), objective);
        }

        if objective.is_finite() {
            objective
        } else {
            f64::INFINITY
        }
    }

    pub(super) fn gradient_value(&self, parameters: &Parameters) -> Parameters {
        let mut gradient = Parameters::zero();
        for row_index in self.members() {
            let row = self.training.rows()[row_index];
            let embedding = self.training.embedding(row_index);
            let softmax = RowSoftmax::new(parameters, embedding);
            let target_mass = row.target.into_iter().sum::<f64>();

            let (rows, intercepts) = gradient
                .as_array_mut()
                .as_chunks_mut::<CANONICAL_DIMENSIONS>();
            for (((row_gradient, intercept), exponential), target) in rows
                .iter_mut()
                .zip(intercepts.iter_mut())
                .zip(softmax.exponentials)
                .zip(row.target)
            {
                let residual =
                    row.weight * target_mass.mul_add(exponential / softmax.denominator, -target);
                DVecN::from_mut(row_gradient)
                    .add_scaled(VecN::from_ref(embedding.as_array()), residual);
                *intercept += residual;
            }
        }

        let (parameter_rows, _) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
        let (gradient_rows, _) = gradient
            .as_array_mut()
            .as_chunks_mut::<CANONICAL_DIMENSIONS>();
        for (gradient_row, parameter_row) in gradient_rows.iter_mut().zip(parameter_rows) {
            for (gradient, parameter) in gradient_row.iter_mut().zip(parameter_row) {
                *gradient = self.regularization.mul_add(*parameter, *gradient);
            }
        }

        gradient
    }
}

impl CostFunction for Objective<'_> {
    type Output = f64;
    type Param = Parameters;

    fn cost(&self, param: &Self::Param) -> Result<Self::Output, argmin::core::Error> {
        Ok(self.cost_value(param))
    }
}

impl Gradient for Objective<'_> {
    type Gradient = Parameters;
    type Param = Parameters;

    fn gradient(&self, param: &Self::Param) -> Result<Self::Gradient, argmin::core::Error> {
        Ok(self.gradient_value(param))
    }
}

/// Class logits of one embedding under flat parameters.
pub(super) fn logits(
    parameters: &Parameters,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
) -> [f64; GeometryClass::COUNT] {
    let (rows, intercepts) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();

    core::array::from_fn(|class| {
        let coefficients = AlignedDVecN::from_ref(&rows[class]).unwrap_or_else(|| {
            unreachable!(
                "class rows start at multiples of `CANONICAL_DIMENSIONS * 8` bytes inside an \
                 allocation aligned for `f64x8`"
            )
        });

        embedding.dot_wide(coefficients) + intercepts[class]
    })
}

/// Fits one linear model over the rows outside the held-out fold.
///
/// Returns the converged flat parameters and the iteration count.
///
/// # Errors
///
/// Returns a [`FitError`] when a class has no target mass in the
/// training portion, the optimizer fails internally, or the iteration
/// bound is exhausted above the gradient tolerance.
pub(super) fn fit_model(
    training: TrainingSet<'_>,
    folds: &[usize],
    held_out: Option<usize>,
    config: FitConfig,
) -> Result<(Parameters, u64), FitError> {
    let objective = Objective {
        training,
        folds,
        held_out,
        regularization: config.regularization,
    };
    objective.validate_class_mass()?;

    let condition = ArmijoCondition::new(ARMIJO).map_err(FitError::Solver)?;
    let line_search = BacktrackingLineSearch::new(condition)
        .rho(BACKTRACKING_FACTOR)
        .map_err(FitError::Solver)?;

    // Cost-stall stopping is disabled: convergence is claimed by the gradient alone.
    let solver = LBFGS::new(line_search, config.history_size)
        .with_tolerance_grad(config.gradient_tolerance)?
        .with_tolerance_cost(0.0)?;

    let result = Executor::new(objective, solver)
        .configure(|state| {
            state
                .param(Parameters::zero())
                .max_iters(config.maximum_iterations)
        })
        .run()?;

    let mut state = result.state;
    let iterations = state.get_iter();
    let parameters = state.take_best_param().ok_or(FitError::NonFinite)?;

    let gradient_norm = objective.gradient_value(&parameters).norm_squared().sqrt();
    if !gradient_norm.is_finite() {
        return Err(FitError::NonFinite);
    }

    if gradient_norm > config.gradient_tolerance {
        return Err(FitError::DidNotConverge {
            iterations,
            gradient_norm,
        });
    }

    Ok((parameters, iterations))
}
