//! Scalar temperature calibration over out-of-fold logits.
//!
//! [`fit_temperature`] searches for a temperature T ∈ [0.05, 20] minimizing weighted-mean
//! soft-label cross-entropy. Golden-section search in ln T uses a fixed iteration budget. The final
//! candidates always include T = 1, and equal losses prefer smaller |ln T|, then smaller ln T.
//! [`metrics`] reports cross-entropy and Brier score at T = 1 and at the deployment temperature to
//! compare raw and calibrated quality.

use hashql_core::id::IdSlice;

use super::{FitError, TrainingRow};
use crate::{
    identity::CardRow,
    math::DNonNegative,
    salt::policy::{GeometryClass, Posterior},
};

/// The card-row-aligned out-of-fold logit column calibration reads.
type Logits = IdSlice<CardRow, [f64; GeometryClass::COUNT]>;
/// The card-row-aligned training-row column calibration reads.
type Rows = IdSlice<CardRow, TrainingRow>;

const TEMPERATURE_MINIMUM: f64 = 0.05;
const TEMPERATURE_MAXIMUM: f64 = 20.0;
// in exact arithmetic, the bracket width after n iterations is ln(400) · (φ − 1)ⁿ, where φ is the
// golden ratio. At n = 96 this is below f64::EPSILON. The budget permits that contraction without
// requiring floating-point loss comparisons to locate the minimizer to the same precision.
const TEMPERATURE_ITERATIONS: usize = 96;
// 1/φ = φ − 1. Subtracting 1 from the stored φ is exact: both operands are within a factor of two.
const GOLDEN_RATIO_CONJUGATE: f64 = core::f64::consts::GOLDEN_RATIO - 1.0;
/// Probability floor inside the cross-entropy logarithm.
const PROBABILITY_FLOOR: f64 = 1.0e-12;

/// Discrimination and calibration quality at both temperatures.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct ValidationMetrics {
    pub raw_cross_entropy: DNonNegative,
    pub calibrated_cross_entropy: DNonNegative,
    pub raw_brier: DNonNegative,
    pub calibrated_brier: DNonNegative,
}

/// Fits the deployment temperature on out-of-fold logits.
///
/// # Panics
///
/// In debug builds, panics if [`Posterior::softmax`] produces a component outside `[0, 1]`,
/// including NaN. Finite logits and positive finite search temperatures produce components in that
/// interval.
pub(super) fn fit_temperature(rows: &Rows, logits: &Logits) -> f64 {
    let mut lower = TEMPERATURE_MINIMUM.ln();
    let mut upper = TEMPERATURE_MAXIMUM.ln();

    let mut left = GOLDEN_RATIO_CONJUGATE.mul_add(lower - upper, upper);
    let mut right = GOLDEN_RATIO_CONJUGATE.mul_add(upper - lower, lower);

    let mut left_value = cross_entropy(rows, logits, left.exp());
    let mut right_value = cross_entropy(rows, logits, right.exp());

    for _ in 0..TEMPERATURE_ITERATIONS {
        // equal losses prefer the point with smaller |ln T|, applying the identity-temperature
        // preference during the search.
        if (left_value, left.abs()) <= (right_value, right.abs()) {
            upper = right;
            right = left;
            right_value = left_value;
            left = GOLDEN_RATIO_CONJUGATE.mul_add(lower - upper, upper);
            left_value = cross_entropy(rows, logits, left.exp());
        } else {
            lower = left;
            left = right;
            left_value = right_value;
            right = GOLDEN_RATIO_CONJUGATE.mul_add(upper - lower, lower);
            right_value = cross_entropy(rows, logits, right.exp());
        }
    }

    // the minimum of a finite candidate set is at most each member. Including ln T = 0 makes the
    // raw computed loss one candidate. Therefore the selected computed cross-entropy can never
    // exceed the raw computed cross-entropy when all candidate losses are finite.
    [lower, left, 0.0, right, upper]
        .into_iter()
        .map(|candidate| (cross_entropy(rows, logits, candidate.exp()), candidate))
        .min_by(|(left_value, left), (right_value, right)| {
            left_value
                .total_cmp(right_value)
                .then_with(|| left.abs().total_cmp(&right.abs()))
                .then_with(|| left.total_cmp(right))
        })
        .unwrap_or_else(|| unreachable!("the candidate set is non-empty"))
        .1
        .exp()
}

/// Reports quality at the raw and deployment temperatures.
///
/// # Errors
///
/// Returns [`FitError::NonFinite`] when any resulting weighted mean is negative or non-finite,
/// including a mean over no paired rows.
///
/// # Panics
///
/// In debug builds, panics if [`Posterior::softmax`] produces a component outside `[0, 1]`,
/// including NaN. Finite logits and a positive finite `temperature` produce components in that
/// interval.
pub(super) fn metrics(
    rows: &Rows,
    logits: &Logits,
    temperature: f64,
) -> Result<ValidationMetrics, FitError> {
    // for target q and posterior p in [0, 1], −q ln(max(p, 10⁻¹²)) and (p − q)² are finite and
    // non-negative. Positive finite weights can still overflow the weighted loss or total weight.
    // Therefore each resulting mean must be finite and non-negative for admission.
    let admit = |value: f64| DNonNegative::new(value).ok_or(FitError::NonFinite);

    Ok(ValidationMetrics {
        raw_cross_entropy: admit(cross_entropy(rows, logits, 1.0))?,
        calibrated_cross_entropy: admit(cross_entropy(rows, logits, temperature))?,
        raw_brier: admit(brier(rows, logits, 1.0))?,
        calibrated_brier: admit(brier(rows, logits, temperature))?,
    })
}

/// Computes weighted-mean soft-label cross-entropy at the identity temperature.
///
/// # Panics
///
/// In debug builds, panics if [`Posterior::softmax`] produces a component outside `[0, 1]`,
/// including NaN. Finite logits produce components in that interval at T = 1.
pub(super) fn raw_cross_entropy(rows: &Rows, logits: &Logits) -> f64 {
    cross_entropy(rows, logits, 1.0)
}

/// Computes weighted-mean soft-label cross-entropy at one temperature.
fn cross_entropy(rows: &Rows, logits: &Logits, temperature: f64) -> f64 {
    let mut loss = 0.0;
    let mut total_weight = 0.0;

    for (row, logits) in rows.iter().zip(logits) {
        let probabilities = Posterior::softmax(*logits, temperature).to_array();
        let row_loss = row
            .target
            .into_iter()
            .zip(probabilities)
            .map(|(target, probability)| target * probability.max(PROBABILITY_FLOOR).ln())
            .sum::<f64>();

        loss = row.weight.mul_add(-row_loss, loss);
        total_weight += row.weight;
    }

    loss / total_weight
}

/// Computes the weighted-mean Brier score at one temperature.
fn brier(rows: &Rows, logits: &Logits, temperature: f64) -> f64 {
    let mut loss = 0.0;
    let mut total_weight = 0.0;

    for (row, logits) in rows.iter().zip(logits) {
        let probabilities = Posterior::softmax(*logits, temperature).to_array();
        let row_loss = probabilities
            .into_iter()
            .zip(row.target)
            .map(|(probability, target)| (probability - target).powi(2))
            .sum::<f64>();
        loss = row.weight.mul_add(row_loss, loss);
        total_weight += row.weight;
    }

    loss / total_weight
}
