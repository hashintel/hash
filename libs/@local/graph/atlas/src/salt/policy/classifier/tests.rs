#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use super::{Applicability, Classifier, PredictError, softmax, standardized_distance};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{BoxedDVecN, BoxedVecN},
    salt::policy::GeometryClass,
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
    distances: Box<[f64]>,
) -> Classifier {
    let mut inverse_scales = BoxedDVecN::zero();
    inverse_scales.as_array_mut().fill(1.0);
    Classifier {
        coefficients: rows,
        intercepts,
        temperature,
        applicability: Applicability {
            mean: BoxedDVecN::zero(),
            inverse_scales,
            distances,
        },
    }
}

#[test]
fn softmax_of_equal_logits_is_uniform() {
    let uniform = softmax([0.0, 0.0, 0.0], 1.0);
    assert_eq!(uniform, [1.0 / 3.0; 3]);
}

#[test]
fn softmax_matches_an_unshifted_reference() {
    fn reference(logits: [f64; 3], temperature: f64) -> [f64; 3] {
        let exponentials = logits.map(|value| (value / temperature).exp());
        let denominator = exponentials.iter().sum::<f64>();
        exponentials.map(|value| value / denominator)
    }

    for temperature in [0.5, 1.0, 2.0] {
        let actual = softmax([0.5, -0.5, 0.0], temperature);
        let expected = reference([0.5, -0.5, 0.0], temperature);
        for (actual, expected) in actual.into_iter().zip(expected) {
            assert!((actual - expected).abs() < 1.0e-15);
        }
        assert!((actual.into_iter().sum::<f64>() - 1.0).abs() < 1.0e-15);
    }
}

#[test]
fn temperature_flattens_the_distribution() {
    let raw = softmax([2.0, 0.0, -1.0], 1.0);
    let calibrated = softmax([2.0, 0.0, -1.0], 4.0);
    assert!(calibrated[0] < raw[0]);
    assert!(calibrated[2] > raw[2]);
}

#[test]
fn standardized_distance_matches_the_definition() {
    let embedding = embedding(&[3.0]);
    let mut inverse_scales = BoxedDVecN::zero();
    inverse_scales.as_array_mut().fill(1.0);

    let distance = standardized_distance(&embedding, &BoxedDVecN::zero(), &inverse_scales);

    // 9 / 3072 is exactly representable, so both paths round identically.
    assert_eq!(distance, (9.0_f64 / 3072.0).sqrt());
}

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
        [
            expected_distance / 2.0,
            expected_distance,
            expected_distance * 2.0,
        ]
        .into(),
    );

    let prediction = model.predict(&input).expect("finite inputs should predict");

    assert_eq!(prediction.logits, [0.75, -0.5, 0.0]);
    assert_eq!(*prediction.raw.as_array(), softmax([0.75, -0.5, 0.0], 1.0));
    assert_eq!(
        *prediction.calibrated.as_array(),
        softmax([0.75, -0.5, 0.0], 2.0),
    );
    assert_eq!(
        prediction.raw.probability(GeometryClass::Coincident),
        prediction.raw.as_array()[0],
    );
    // The distance ties the middle training distance; lower-bound rank
    // semantics keep the tie applicable.
    assert_eq!(prediction.distance, expected_distance);
    assert_eq!(prediction.applicability, 1.0 - 1.0 / 3.0);
}

#[test]
fn predict_ranks_an_outlier_inapplicable() {
    let model = classifier(
        [coefficients(&[]), coefficients(&[]), coefficients(&[])],
        [0.0; 3],
        1.0,
        [0.001, 0.002].into(),
    );
    let far = embedding(&[100.0]);

    let prediction = model.predict(&far).expect("finite inputs should predict");

    assert_eq!(prediction.applicability, 0.0);
}

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
        [1.0].into(),
    );
    let large = embedding(&[f32::MAX]);

    assert_eq!(model.predict(&large), Err(PredictError));
}
