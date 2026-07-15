use super::{CLASS_COUNT, ClassifierTrainingRow};

const TEMPERATURE_MINIMUM: f64 = 0.05;
const TEMPERATURE_MAXIMUM: f64 = 20.0;
const TEMPERATURE_ITERATIONS: usize = 96;
const GOLDEN_RATIO_CONJUGATE: f64 = 0.618_033_988_749_894_9;
const PROBABILITY_FLOOR: f64 = 1.0e-12;

pub(super) struct ValidationMetrics {
    pub raw_cross_entropy: f64,
    pub calibrated_cross_entropy: f64,
    pub raw_brier: f64,
    pub calibrated_brier: f64,
}

pub(super) fn fit_temperature(
    rows: &[ClassifierTrainingRow],
    logits: &[[f64; CLASS_COUNT]],
) -> f64 {
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
        .expect("temperature candidate set should be non-empty")
        .exp()
}

pub(super) fn metrics(
    rows: &[ClassifierTrainingRow],
    logits: &[[f64; CLASS_COUNT]],
    temperature: f64,
) -> ValidationMetrics {
    ValidationMetrics {
        raw_cross_entropy: cross_entropy(rows, logits, 1.0),
        calibrated_cross_entropy: cross_entropy(rows, logits, temperature),
        raw_brier: brier(rows, logits, 1.0),
        calibrated_brier: brier(rows, logits, temperature),
    }
}

fn cross_entropy(
    rows: &[ClassifierTrainingRow],
    logits: &[[f64; CLASS_COUNT]],
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
        loss -= row.vote_weight * row_loss;
        total_weight += row.vote_weight;
    }
    loss / total_weight
}

fn brier(rows: &[ClassifierTrainingRow], logits: &[[f64; CLASS_COUNT]], temperature: f64) -> f64 {
    let mut loss = 0.0;
    let mut total_weight = 0.0;
    for (row, logits) in rows.iter().zip(logits) {
        let probabilities = softmax(*logits, temperature);
        let row_loss = probabilities
            .into_iter()
            .zip(row.target)
            .map(|(probability, target)| (probability - target).powi(2))
            .sum::<f64>();
        loss += row.vote_weight * row_loss;
        total_weight += row.vote_weight;
    }
    loss / total_weight
}

#[inline]
fn softmax(logits: [f64; CLASS_COUNT], temperature: f64) -> [f64; CLASS_COUNT] {
    let maximum = logits.into_iter().fold(f64::NEG_INFINITY, f64::max);
    let exponentials = logits.map(|value| ((value - maximum) / temperature).exp());
    let denominator = exponentials.into_iter().sum::<f64>();
    exponentials.map(|value| value / denominator)
}
