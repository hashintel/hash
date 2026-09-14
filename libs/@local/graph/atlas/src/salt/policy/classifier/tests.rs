#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use super::{Applicability, Classifier, PredictError, Standardization};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{BoxedDVecN, BoxedVecN, DNonNegative},
    salt::policy::{GeometryClass, Posterior},
};

/// Builds an embedding with the leading components set.
fn embedding(leading: &[f32]) -> BoxedVecN<CANONICAL_DIMENSIONS> {
    let mut boxed = BoxedVecN::zero();
    boxed.as_array_mut()[..leading.len()].copy_from_slice(leading);
    boxed
}

/// Builds a coefficient row with the leading components set.
fn coefficients(leading: &[f64]) -> BoxedDVecN<CANONICAL_DIMENSIONS> {
    let mut boxed = BoxedDVecN::zero();
    boxed.as_array_mut()[..leading.len()].copy_from_slice(leading);
    boxed
}

/// A classifier with unit applicability scales and zero mean.
fn classifier(
    rows: [BoxedDVecN<CANONICAL_DIMENSIONS>; 3],
    intercepts: [f64; 3],
    temperature: f64,
    distances: &[f64],
) -> Classifier {
    let mut inverse_scales = BoxedDVecN::zero();
    inverse_scales.as_array_mut().fill(1.0);
    Classifier {
        coefficients: rows,
        intercepts,
        temperature,
        applicability: Applicability {
            standardization: Standardization {
                mean: BoxedDVecN::zero(),
                inverse_scales,
            },
            distances: distances
                .iter()
                .map(|&value| DNonNegative::new(value).expect("test distances are non-negative"))
                .collect(),
        },
    }
}

/// `Posterior::softmax` over equal logits is exactly uniform.
#[test]
fn softmax_of_equal_logits_is_uniform() {
    let uniform = Posterior::softmax([0.0, 0.0, 0.0], 1.0).to_array();
    assert_eq!(uniform, [1.0 / 3.0; 3]);
}

/// Agrees with the textbook softmax within `1e-15` at three temperatures.
///
/// The shift-stabilized softmax agrees with the textbook `exp / Σ exp` within `1e-15` at three
/// temperatures.
#[test]
fn softmax_matches_an_unshifted_reference() {
    /// Computes the textbook softmax of `logits` at `temperature`, without the stabilizing shift.
    fn reference(logits: [f64; 3], temperature: f64) -> [f64; 3] {
        let exponentials = logits.map(|value| (value / temperature).exp());
        let denominator = exponentials.iter().sum::<f64>();
        exponentials.map(|value| value / denominator)
    }

    for temperature in [0.5, 1.0, 2.0] {
        let actual = Posterior::softmax([0.5, -0.5, 0.0], temperature).to_array();
        let expected = reference([0.5, -0.5, 0.0], temperature);
        for (actual, expected) in actual.into_iter().zip(expected) {
            assert!((actual - expected).abs() < 1.0e-15);
        }
        assert!((actual.into_iter().sum::<f64>() - 1.0).abs() < 1.0e-15);
    }
}

/// Keeps the exact degenerate distribution for a logit near `f64::MAX`.
///
/// A logit near `f64::MAX` over a temperature below one still yields the exact degenerate
/// distribution, since the shift precedes the division.
#[test]
fn softmax_of_extreme_logits_stays_a_distribution() {
    // A logit near `f64::MAX` over a temperature below one overflows to `+∞` if divided
    // before the shift, and `∞ - ∞` then poisons every component with NaN. The shift-first
    // order keeps the quotient finite and the degenerate distribution exact.
    let posterior = Posterior::softmax([1.7e308, 0.0, 0.0], 0.5).to_array();
    assert_eq!(posterior, [1.0, 0.0, 0.0]);
}

/// A higher temperature lowers the top probability and raises the bottom one.
#[test]
fn temperature_flattens_the_distribution() {
    let raw = Posterior::softmax([2.0, 0.0, -1.0], 1.0).to_array();
    let calibrated = Posterior::softmax([2.0, 0.0, -1.0], 4.0).to_array();
    assert!(calibrated[0] < raw[0]);
    assert!(calibrated[2] > raw[2]);
}

/// Reads the standardized distance `√(9 / 3072)` exactly for a one-component embedding.
///
/// The standardized distance of a one-component embedding equals `√(9 / 3072)` exactly under zero
/// mean and unit inverse scales.
#[test]
fn standardized_distance_matches_the_definition() {
    let embedding = embedding(&[3.0]);
    let mut inverse_scales = BoxedDVecN::zero();
    inverse_scales.as_array_mut().fill(1.0);
    let standardization = Standardization {
        mean: BoxedDVecN::zero(),
        inverse_scales,
    };

    let distance = standardization.distance(&embedding);

    // 9 / 3072 = 3 / 1024 is exactly representable: both paths round identically.
    assert_eq!(
        distance.expect("the fixture distance is finite"),
        (9.0_f64 / 3072.0).sqrt()
    );
}

/// Checks the `predict` outputs on a fixture whose distance ties the middle training distance.
///
/// `predict` computes the logits as coefficient dot products plus intercepts, the raw and
/// temperature-calibrated posteriors, the standardized distance, and an applicability of `2/3` for
/// a distance tying the middle training distance.
#[test]
fn predict_computes_logits_posteriors_and_applicability() {
    let rows = [
        coefficients(&[1.0, 0.0]),
        coefficients(&[0.0, 1.0]),
        coefficients(&[]),
    ];
    let input = embedding(&[0.5, -0.5]);
    let expected_distance = (0.5_f64 / 3072.0).sqrt();
    let model = classifier(
        rows,
        [0.25, 0.0, 0.0],
        2.0,
        &[
            expected_distance / 2.0,
            expected_distance,
            expected_distance * 2.0,
        ],
    );

    let prediction = model.predict(&input).expect("finite inputs should predict");

    assert_eq!(prediction.logits, [0.75, -0.5, 0.0]);
    assert_eq!(prediction.raw, Posterior::softmax([0.75, -0.5, 0.0], 1.0));
    assert_eq!(
        prediction.calibrated,
        Posterior::softmax([0.75, -0.5, 0.0], 2.0),
    );
    assert_eq!(
        prediction.raw.probability(GeometryClass::Coincident),
        prediction.raw.to_array()[0],
    );
    // The distance ties the middle training distance; lower-bound rank
    // semantics keep the tie applicable.
    assert_eq!(prediction.distance, expected_distance);
    assert_eq!(prediction.applicability, 1.0 - 1.0 / 3.0);
}

/// An embedding far beyond every training distance predicts with applicability zero.
#[test]
fn predict_ranks_an_outlier_inapplicable() {
    let model = classifier(
        [coefficients(&[]), coefficients(&[]), coefficients(&[])],
        [0.0; 3],
        1.0,
        &[0.001, 0.002],
    );
    let far = embedding(&[100.0]);

    let prediction = model.predict(&far).expect("finite inputs should predict");

    assert_eq!(prediction.applicability, 0.0);
}

/// Overflows the logit with `f64::MAX` against `f32::MAX` and returns `PredictError`.
///
/// A coefficient of `f64::MAX` against an `f32::MAX` component overflows the logit and `predict`
/// returns `PredictError`.
#[test]
fn predict_rejects_overflow() {
    let model = classifier(
        [
            coefficients(&[f64::MAX]),
            coefficients(&[]),
            coefficients(&[]),
        ],
        [0.0; 3],
        1.0,
        &[1.0],
    );
    let large = embedding(&[f32::MAX]);

    assert_eq!(model.predict(&large), Err(PredictError));
}
