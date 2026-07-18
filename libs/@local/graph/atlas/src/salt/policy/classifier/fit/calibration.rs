//! Scalar temperature calibration over out-of-fold logits.
//!
//! [`fit_temperature`] minimizes weighted-mean soft-label cross-entropy
//! over `T` in `[0.05, 20]` by golden-section search in `ln T`, with
//! `T = 1` always among the final candidates; ties prefer the
//! temperature closest to one. [`metrics`] reports cross-entropy and
//! Brier score at `T = 1` and at the deployment temperature, so raw
//! and calibrated quality stay separately visible.

use super::TrainingRow;
use crate::salt::policy::{GeometryClass, classifier::softmax};

const TEMPERATURE_MINIMUM: f64 = 0.05;
const TEMPERATURE_MAXIMUM: f64 = 20.0;
const TEMPERATURE_ITERATIONS: usize = 96;
const GOLDEN_RATIO_CONJUGATE: f64 = 0.618_033_988_749_894_9;
/// Probability floor inside the cross-entropy logarithm.
const PROBABILITY_FLOOR: f64 = 1.0e-12;

/// Discrimination and calibration quality at both temperatures.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct ValidationMetrics {
    pub raw_cross_entropy: f64,
    pub calibrated_cross_entropy: f64,
    pub raw_brier: f64,
    pub calibrated_brier: f64,
}

/// Fits the deployment temperature on out-of-fold logits.
pub(super) fn fit_temperature(rows: &[TrainingRow], logits: &[[f64; GeometryClass::COUNT]]) -> f64 {
    let mut lower = TEMPERATURE_MINIMUM.ln();
    let mut upper = TEMPERATURE_MAXIMUM.ln();
    let mut left = upper - GOLDEN_RATIO_CONJUGATE * (upper - lower);
    let mut right = lower + GOLDEN_RATIO_CONJUGATE * (upper - lower);
    let mut left_value = cross_entropy(rows, logits, left.exp());
    let mut right_value = cross_entropy(rows, logits, right.exp());

    for _ in 0..TEMPERATURE_ITERATIONS {
        if (left_value, left.abs()) <= (right_value, right.abs()) {
            upper = right;
            right = left;
            right_value = left_value;
            left = upper - GOLDEN_RATIO_CONJUGATE * (upper - lower);
            left_value = cross_entropy(rows, logits, left.exp());
        } else {
            lower = left;
            left = right;
            left_value = right_value;
            right = lower + GOLDEN_RATIO_CONJUGATE * (upper - lower);
            right_value = cross_entropy(rows, logits, right.exp());
        }
    }

    [lower, left, 0.0, right, upper]
        .into_iter()
        .min_by(|left, right| {
            cross_entropy(rows, logits, left.exp())
                .total_cmp(&cross_entropy(rows, logits, right.exp()))
                .then_with(|| left.abs().total_cmp(&right.abs()))
                .then_with(|| left.total_cmp(right))
        })
        .unwrap_or_else(|| unreachable!("the candidate set is non-empty"))
        .exp()
}

/// Reports quality at the raw and deployment temperatures.
pub(super) fn metrics(
    rows: &[TrainingRow],
    logits: &[[f64; GeometryClass::COUNT]],
    temperature: f64,
) -> ValidationMetrics {
    ValidationMetrics {
        raw_cross_entropy: cross_entropy(rows, logits, 1.0),
        calibrated_cross_entropy: cross_entropy(rows, logits, temperature),
        raw_brier: brier(rows, logits, 1.0),
        calibrated_brier: brier(rows, logits, temperature),
    }
}

/// Weighted-mean soft-label cross-entropy at one temperature.
fn cross_entropy(
    rows: &[TrainingRow],
    logits: &[[f64; GeometryClass::COUNT]],
    temperature: f64,
) -> f64 {
    let mut loss = 0.0;
    let mut total_weight = 0.0;
    for (row, logits) in rows.iter().zip(logits) {
        let probabilities = softmax(*logits, temperature);
        let row_loss = row
            .target
            .into_iter()
            .zip(probabilities)
            .map(|(target, probability)| target * probability.max(PROBABILITY_FLOOR).ln())
            .sum::<f64>();
        loss -= row.weight * row_loss;
        total_weight += row.weight;
    }

    loss / total_weight
}

/// Weighted-mean Brier score at one temperature.
fn brier(rows: &[TrainingRow], logits: &[[f64; GeometryClass::COUNT]], temperature: f64) -> f64 {
    let mut loss = 0.0;
    let mut total_weight = 0.0;
    for (row, logits) in rows.iter().zip(logits) {
        let probabilities = softmax(*logits, temperature);
        let row_loss = probabilities
            .into_iter()
            .zip(row.target)
            .map(|(probability, target)| (probability - target).powi(2))
            .sum::<f64>();
        loss += row.weight * row_loss;
        total_weight += row.weight;
    }

    loss / total_weight
}
