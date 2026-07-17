use super::*;

#[test]
fn recovers_weighted_rotation_scale_and_translation() {
    let source = [[-2.0, 1.0], [1.0, 3.0], [4.0, -1.0], [100.0, 100.0]];
    let angle = 0.7_f64;
    let expected = SimilarityTransform {
        scale: 2.25,
        cosine: angle.cos(),
        sine: angle.sin(),
        translation: [-4.0, 8.5],
    };
    let target = source.map(|coordinate| expected.apply(coordinate));
    let weights = [1.0, 3.0, 2.0, 0.0];

    let actual =
        fit_similarity(&source, &target, &weights).expect("non-degenerate anchors should align");

    assert!((actual.scale() - expected.scale()).abs() <= 1.0e-12);
    for (actual, expected) in actual.rotation().into_iter().zip(expected.rotation()) {
        assert!((actual - expected).abs() <= 1.0e-12);
    }
    for (actual, expected) in actual.translation().into_iter().zip(expected.translation()) {
        assert!((actual - expected).abs() <= 1.0e-12);
    }
    for (source, target) in source.into_iter().zip(target).take(3) {
        let aligned = actual.apply(source);
        assert!((aligned[0] - target[0]).abs() <= 1.0e-11);
        assert!((aligned[1] - target[1]).abs() <= 1.0e-11);
    }
}

#[test]
fn rejects_reflections_and_collapsed_source_anchors() {
    let square = [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]];
    let reflected = square.map(|[x, y]| [-x, y]);
    assert_eq!(
        fit_similarity(&square, &reflected, &[1.0; 4]),
        Err(AlignmentError::DegenerateOrientation)
    );

    assert_eq!(
        fit_similarity(&[[2.0, 3.0]; 2], &[[4.0, 5.0], [6.0, 7.0]], &[1.0; 2]),
        Err(AlignmentError::DegenerateSource)
    );
}

#[test]
fn rejects_invalid_weights_before_fitting() {
    let source = [[0.0, 0.0], [1.0, 1.0]];
    let target = [[1.0, 2.0], [2.0, 3.0]];

    assert_eq!(
        fit_similarity(&source, &target, &[0.0, 0.0]),
        Err(AlignmentError::ZeroTotalWeight)
    );
    assert_eq!(
        fit_similarity(&source, &target, &[1.0, -0.5]),
        Err(AlignmentError::InvalidWeight {
            row: 1,
            weight: -0.5
        })
    );
}
