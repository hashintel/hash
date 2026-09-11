//! Scalar temperature calibration over out-of-fold logits.
//!
//! [`fit_temperature`] minimizes weighted-mean soft-label cross-entropy over `T` in `[0.05, 20]` by
//! golden-section search in `ln T`, with `T = 1` always among the final candidates; ties prefer the
//! temperature closest to one. [`metrics`] reports cross-entropy and Brier score at `T = 1` and at
//! the deployment temperature, so raw and calibrated quality both stay visible.

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
// The bracket spans ln(400) ~ 6 nats and contracts by 0.618 per
// iteration, reaching f64 resolution near iteration 74; 96 bounds it
// with margin at negligible cost.
const TEMPERATURE_ITERATIONS: usize = 96;
// 1 / φ = φ - 1; the subtraction is exact (φ ∈ [1, 2]).
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
pub(super) fn fit_temperature(rows: &Rows, logits: &Logits) -> f64 {
    let mut lower = TEMPERATURE_MINIMUM.ln();
    let mut upper = TEMPERATURE_MAXIMUM.ln();

    let mut left = GOLDEN_RATIO_CONJUGATE.mul_add(lower - upper, upper);
    let mut right = GOLDEN_RATIO_CONJUGATE.mul_add(upper - lower, lower);

    let mut left_value = cross_entropy(rows, logits, left.exp());
    let mut right_value = cross_entropy(rows, logits, right.exp());

    for _ in 0..TEMPERATURE_ITERATIONS {
        // Equal values contract toward `ln T = 0`: the tie preference
        // for a temperature near one applies during the search too.
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

    // `0.0` is `ln 1`: the identity temperature always competes, so
    // calibration can never worsen the cross-entropy it minimizes.
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
/// Returns [`FitError::NonFinite`] when a weighted mean leaves the non-negative finite domain.
/// Both means are non-negative by derivation (targets and weights are validated at
/// `TrainingSet::new`, posteriors lie in the unit interval, and the cross-entropy logarithm is
/// floored), so the refusal names a weights defect.
pub(super) fn metrics(
    rows: &Rows,
    logits: &Logits,
    temperature: f64,
) -> Result<ValidationMetrics, FitError> {
    let admit = |value: f64| DNonNegative::new(value).ok_or(FitError::NonFinite);

    Ok(ValidationMetrics {
        raw_cross_entropy: admit(cross_entropy(rows, logits, 1.0))?,
        calibrated_cross_entropy: admit(cross_entropy(rows, logits, temperature))?,
        raw_brier: admit(brier(rows, logits, 1.0))?,
        calibrated_brier: admit(brier(rows, logits, temperature))?,
    })
}

/// Weighted-mean soft-label cross-entropy of the uncalibrated posteriors.
pub(super) fn raw_cross_entropy(rows: &Rows, logits: &Logits) -> f64 {
    cross_entropy(rows, logits, 1.0)
}

/// Weighted-mean soft-label cross-entropy at one temperature.
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

/// Weighted-mean Brier score at one temperature.
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
