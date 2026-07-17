use core::simd::{f32x8, f64x8, num::SimdFloat as _};
use std::collections::VecDeque;

use super::{CLASS_COUNT, ClassifierFitConfig, ClassifierTrainingSet};
use crate::salt::{
    classifier::error::ClassifierFitError, representation::CANONICAL_DIMENSIONS,
    simd::mul_add_f64x8,
};

const SIMD_LANES: usize = 8;
const COEFFICIENT_COUNT: usize = CLASS_COUNT * CANONICAL_DIMENSIONS;
const PARAMETER_COUNT: usize = COEFFICIENT_COUNT + CLASS_COUNT;
const MAX_LINE_SEARCH_STEPS: usize = 48;
const ARMIJO: f64 = 1.0e-4;
const MIN_CURVATURE: f64 = 1.0e-12;

const _: () = assert!(CANONICAL_DIMENSIONS.is_multiple_of(SIMD_LANES));

pub(super) struct FittedLinearModel {
    pub coefficients: Box<[f64]>,
    pub intercepts: [f64; CLASS_COUNT],
    pub iterations: usize,
}

impl FittedLinearModel {
    pub(super) fn logits(&self, embedding: &[f32; CANONICAL_DIMENSIONS]) -> [f64; CLASS_COUNT] {
        core::array::from_fn(|class| {
            let offset = class * CANONICAL_DIMENSIONS;
            dot_embedding(
                embedding,
                &self.coefficients[offset..offset + CANONICAL_DIMENSIONS],
            ) + self.intercepts[class]
        })
    }
}

pub(super) fn fit_model(
    training: ClassifierTrainingSet<'_>,
    indices: &[usize],
    config: ClassifierFitConfig,
) -> Result<FittedLinearModel, ClassifierFitError> {
    validate_class_mass(training, indices)?;
    let regularization = config.regularization;
    let mut parameters = vec![0.0; PARAMETER_COUNT];
    let mut gradient = vec![0.0; PARAMETER_COUNT];
    let mut objective = evaluate(
        training,
        indices,
        regularization,
        &parameters,
        &mut gradient,
    )?;
    let mut history = VecDeque::<HistoryPair>::with_capacity(config.history_size.get());
    let mut trial_parameters = vec![0.0; PARAMETER_COUNT];
    let mut trial_gradient = vec![0.0; PARAMETER_COUNT];

    for iteration in 0..config.maximum_iterations.get() {
        let gradient_maximum = maximum_absolute(&gradient);
        if gradient_maximum <= config.gradient_tolerance {
            return Ok(finish(parameters, iteration.max(1)));
        }

        let mut direction = inverse_hessian_product(&gradient, &history);
        for value in &mut direction {
            *value = -*value;
        }
        let mut directional_derivative = dot(&gradient, &direction);
        if !directional_derivative.is_finite() || directional_derivative >= 0.0 {
            history.clear();
            direction.clone_from(&gradient);
            for value in &mut direction {
                *value = -*value;
            }
            directional_derivative = -dot(&gradient, &gradient);
        }

        let initial_step = if iteration == 0 {
            maximum_absolute(&gradient).max(1.0).recip()
        } else {
            1.0
        };
        let (next_objective, step) = line_search(
            training,
            indices,
            regularization,
            &parameters,
            objective,
            &gradient,
            &direction,
            directional_derivative,
            initial_step,
            &mut trial_parameters,
            &mut trial_gradient,
            iteration,
        )?;

        let mut parameter_delta = vec![0.0; PARAMETER_COUNT];
        let mut gradient_delta = vec![0.0; PARAMETER_COUNT];
        for index in 0..PARAMETER_COUNT {
            parameter_delta[index] = trial_parameters[index] - parameters[index];
            gradient_delta[index] = trial_gradient[index] - gradient[index];
        }
        let curvature = dot(&parameter_delta, &gradient_delta);
        let scale = dot(&parameter_delta, &parameter_delta)
            .sqrt()
            .mul_add(dot(&gradient_delta, &gradient_delta).sqrt(), 0.0);
        if curvature > MIN_CURVATURE * scale {
            if history.len() == config.history_size.get() {
                history.pop_front();
            }
            history.push_back(HistoryPair {
                parameter_delta: parameter_delta.into_boxed_slice(),
                gradient_delta: gradient_delta.into_boxed_slice(),
                inverse_curvature: curvature.recip(),
            });
        }

        parameters.clone_from(&trial_parameters);
        gradient.clone_from(&trial_gradient);
        objective = next_objective;
        debug_assert!(step > 0.0);
    }

    Err(ClassifierFitError::DidNotConverge {
        iterations: config.maximum_iterations.get(),
        gradient_maximum: maximum_absolute(&gradient),
    })
}

#[expect(
    clippy::too_many_arguments,
    reason = "line search mutates preallocated parameter and gradient buffers"
)]
fn line_search(
    training: ClassifierTrainingSet<'_>,
    indices: &[usize],
    regularization: f64,
    parameters: &[f64],
    objective: f64,
    _gradient: &[f64],
    direction: &[f64],
    directional_derivative: f64,
    initial_step: f64,
    trial_parameters: &mut [f64],
    trial_gradient: &mut [f64],
    iteration: usize,
) -> Result<(f64, f64), ClassifierFitError> {
    let mut step = initial_step;
    for _ in 0..MAX_LINE_SEARCH_STEPS {
        for index in 0..PARAMETER_COUNT {
            trial_parameters[index] = step.mul_add(direction[index], parameters[index]);
        }
        match evaluate(
            training,
            indices,
            regularization,
            trial_parameters,
            trial_gradient,
        ) {
            Ok(value) if value <= (ARMIJO * step).mul_add(directional_derivative, objective) => {
                return Ok((value, step));
            }
            Ok(_) | Err(ClassifierFitError::NonFiniteObjective) => {
                step *= 0.5;
            }
            Err(error) => return Err(error),
        }
    }
    Err(ClassifierFitError::LineSearchFailed { iteration })
}

fn evaluate(
    training: ClassifierTrainingSet<'_>,
    indices: &[usize],
    regularization: f64,
    parameters: &[f64],
    gradient: &mut [f64],
) -> Result<f64, ClassifierFitError> {
    gradient.fill(0.0);
    let mut objective = 0.0;
    for &row_index in indices {
        let row = training.rows()[row_index];
        let embedding = training.embedding(row_index);
        let logits: [f64; CLASS_COUNT] = core::array::from_fn(|class| {
            let offset = class * CANONICAL_DIMENSIONS;
            dot_embedding(
                embedding,
                &parameters[offset..offset + CANONICAL_DIMENSIONS],
            ) + parameters[COEFFICIENT_COUNT + class]
        });
        let maximum = logits.into_iter().fold(f64::NEG_INFINITY, f64::max);
        let exponentials = logits.map(|logit| (logit - maximum).exp());
        let denominator = exponentials.into_iter().sum::<f64>();
        let log_normalizer = maximum + denominator.ln();
        let target_logit = row
            .target
            .into_iter()
            .zip(logits)
            .map(|(target, logit)| target * logit)
            .sum::<f64>();
        let target_mass = row.target.into_iter().sum::<f64>();
        objective = row.vote_weight.mul_add(
            target_mass.mul_add(log_normalizer, -target_logit),
            objective,
        );

        for class in 0..CLASS_COUNT {
            let residual = row.vote_weight
                * target_mass.mul_add(exponentials[class] / denominator, -row.target[class]);
            let offset = class * CANONICAL_DIMENSIONS;
            accumulate_embedding_gradient(
                &mut gradient[offset..offset + CANONICAL_DIMENSIONS],
                embedding,
                residual,
            );
            gradient[COEFFICIENT_COUNT + class] += residual;
        }
    }

    for index in 0..COEFFICIENT_COUNT {
        objective =
            (0.5 * regularization * parameters[index]).mul_add(parameters[index], objective);
        gradient[index] = regularization.mul_add(parameters[index], gradient[index]);
    }
    if !objective.is_finite() || gradient.iter().any(|value| !value.is_finite()) {
        return Err(ClassifierFitError::NonFiniteObjective);
    }
    Ok(objective)
}

fn validate_class_mass(
    training: ClassifierTrainingSet<'_>,
    indices: &[usize],
) -> Result<(), ClassifierFitError> {
    let mut mass = [0.0; CLASS_COUNT];
    for &index in indices {
        let row = training.rows()[index];
        for (class, target) in row.target.into_iter().enumerate() {
            mass[class] = target.mul_add(row.vote_weight, mass[class]);
        }
    }
    mass.iter()
        .position(|value| *value <= 0.0)
        .map_or(Ok(()), |class| {
            Err(ClassifierFitError::MissingClassMass { class })
        })
}

fn inverse_hessian_product(gradient: &[f64], history: &VecDeque<HistoryPair>) -> Vec<f64> {
    let mut result = gradient.to_vec();
    let mut alphas = VecDeque::with_capacity(history.len());
    for pair in history.iter().rev() {
        let alpha = pair.inverse_curvature * dot(&pair.parameter_delta, &result);
        axpy(&mut result, &pair.gradient_delta, -alpha);
        alphas.push_front(alpha);
    }
    if let Some(last) = history.back() {
        let numerator = dot(&last.parameter_delta, &last.gradient_delta);
        let denominator = dot(&last.gradient_delta, &last.gradient_delta);
        let scale = numerator / denominator;
        for value in &mut result {
            *value *= scale;
        }
    }
    for (pair, alpha) in history.iter().zip(alphas) {
        let beta = pair.inverse_curvature * dot(&pair.gradient_delta, &result);
        axpy(&mut result, &pair.parameter_delta, alpha - beta);
    }
    result
}

fn finish(mut parameters: Vec<f64>, iterations: usize) -> FittedLinearModel {
    let intercepts = core::array::from_fn(|class| parameters[COEFFICIENT_COUNT + class]);
    parameters.truncate(COEFFICIENT_COUNT);
    FittedLinearModel {
        coefficients: parameters.into_boxed_slice(),
        intercepts,
        iterations,
    }
}

#[inline]
fn dot_embedding(embedding: &[f32; CANONICAL_DIMENSIONS], coefficients: &[f64]) -> f64 {
    let (embedding, remainder) = embedding.as_chunks::<SIMD_LANES>();
    debug_assert!(remainder.is_empty());
    let (coefficients, remainder) = coefficients.as_chunks::<SIMD_LANES>();
    debug_assert!(remainder.is_empty());
    let mut sum = [f64x8::splat(0.0); 2];
    for (index, (embedding, coefficients)) in embedding.iter().zip(coefficients).enumerate() {
        sum[index & 1] = mul_add_f64x8(
            f32x8::from_array(*embedding).cast(),
            f64x8::from_array(*coefficients),
            sum[index & 1],
        );
    }
    (sum[0] + sum[1]).reduce_sum()
}

#[inline]
fn accumulate_embedding_gradient(
    gradient: &mut [f64],
    embedding: &[f32; CANONICAL_DIMENSIONS],
    residual: f64,
) {
    let (gradient, remainder) = gradient.as_chunks_mut::<SIMD_LANES>();
    debug_assert!(remainder.is_empty());
    let (embedding, remainder) = embedding.as_chunks::<SIMD_LANES>();
    debug_assert!(remainder.is_empty());
    let residual = f64x8::splat(residual);
    for (gradient, embedding) in gradient.iter_mut().zip(embedding) {
        *gradient = (f64x8::from_array(*gradient)
            + f32x8::from_array(*embedding).cast() * residual)
            .to_array();
    }
}

#[inline]
fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}

#[inline]
fn axpy(output: &mut [f64], input: &[f64], scale: f64) {
    for (output, input) in output.iter_mut().zip(input) {
        *output = scale.mul_add(*input, *output);
    }
}

#[inline]
fn maximum_absolute(values: &[f64]) -> f64 {
    values
        .iter()
        .fold(0.0_f64, |maximum, value| maximum.max(value.abs()))
}

struct HistoryPair {
    parameter_delta: Box<[f64]>,
    gradient_delta: Box<[f64]>,
    inverse_curvature: f64,
}

#[cfg(test)]
mod tests {
    use core::num::NonZeroUsize;

    use super::*;
    use crate::salt::{classifier::ClassifierTrainingRow, hash::ContentHash};

    #[test]
    fn approximate_soft_target_mass_preserves_common_intercept_invariance() {
        let embeddings = vec![0.0_f32; CANONICAL_DIMENSIONS];
        let rows = [ClassifierTrainingRow {
            target: [0.2, 0.3, 0.500_000_000_5],
            vote_weight: 1.0,
            family: ContentHash::digest(b"family"),
        }];
        let training =
            ClassifierTrainingSet::new(&embeddings, &rows).expect("soft target should validate");
        let indices = [0];
        let zero = vec![0.0; PARAMETER_COUNT];
        let mut shifted = zero.clone();
        shifted[COEFFICIENT_COUNT..].fill(17.0);
        let mut zero_gradient = vec![0.0; PARAMETER_COUNT];
        let mut shifted_gradient = vec![0.0; PARAMETER_COUNT];

        let zero_objective = evaluate(training, &indices, 1.0, &zero, &mut zero_gradient)
            .expect("zero parameters should evaluate");
        let shifted_objective = evaluate(training, &indices, 1.0, &shifted, &mut shifted_gradient)
            .expect("common intercept shift should evaluate");

        assert!((zero_objective - shifted_objective).abs() <= 1.0e-12);
        for (zero, shifted) in zero_gradient[COEFFICIENT_COUNT..]
            .iter()
            .zip(&shifted_gradient[COEFFICIENT_COUNT..])
        {
            assert!((zero - shifted).abs() <= 1.0e-12);
        }
    }

    #[test]
    fn larger_regularization_reduces_the_fitted_coefficient_norm() {
        let mut embeddings = vec![0.0_f32; CLASS_COUNT * CANONICAL_DIMENSIONS];
        for class in 0..CLASS_COUNT {
            embeddings[class * CANONICAL_DIMENSIONS + class] = 1.0;
        }
        let rows: [ClassifierTrainingRow; CLASS_COUNT] =
            core::array::from_fn(|class| ClassifierTrainingRow {
                target: core::array::from_fn(|target| if target == class { 1.0 } else { 0.0 }),
                vote_weight: 1.0,
                family: ContentHash::digest(&[u8::try_from(class).expect("class should fit u8")]),
            });
        let training =
            ClassifierTrainingSet::new(&embeddings, &rows).expect("fixture should validate");
        let indices = [0, 1, 2];
        let config = |regularization| ClassifierFitConfig {
            regularization,
            maximum_iterations: NonZeroUsize::new(100).expect("iterations should be non-zero"),
            gradient_tolerance: 1.0e-10,
            history_size: NonZeroUsize::new(10).expect("history should be non-zero"),
            folds: NonZeroUsize::new(2).expect("folds should be non-zero"),
            seed: 0,
        };

        let weak = fit_model(training, &indices, config(0.1)).expect("weak fit should converge");
        let strong =
            fit_model(training, &indices, config(10.0)).expect("strong fit should converge");
        let norm = |model: &FittedLinearModel| {
            model
                .coefficients
                .iter()
                .map(|coefficient| coefficient * coefficient)
                .sum::<f64>()
                .sqrt()
        };

        assert!(norm(&strong) < norm(&weak));
    }
}
