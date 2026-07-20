use crate::salt::representation::{
    CANONICAL_DIMENSIONS, CanonicalEmbedding, OwnedCanonicalEmbedding, PROJECTOR_DIMENSIONS,
    RepresentationError,
};

#[test]
fn normalizes_the_projector_prefix_without_touching_the_canonical_row() {
    let mut canonical = [0.0_f32; CANONICAL_DIMENSIONS];
    canonical[0] = 3.0;
    canonical[1] = 4.0;
    canonical[PROJECTOR_DIMENSIONS] = 12.0;
    let original = canonical;
    let embedding = CanonicalEmbedding::new(&canonical).expect("should validate the embedding");
    let mut projector = [f32::NAN; PROJECTOR_DIMENSIONS];

    let normalization = embedding.normalize_prefix(&mut projector);

    assert_eq!(normalization.norm, 5.0);
    assert_eq!(normalization.denominator, 5.0);
    assert!((projector[0] - 0.6).abs() <= f32::EPSILON);
    assert!((projector[1] - 0.8).abs() <= f32::EPSILON);
    assert!(projector[2..].iter().all(|value| *value == 0.0));
    assert_eq!(embedding.as_array(), &original);
}

#[test]
fn zero_prefix_uses_the_persisted_epsilon() {
    let canonical = [0.0_f32; CANONICAL_DIMENSIONS];
    let embedding = CanonicalEmbedding::new(&canonical).expect("should validate zeroes");
    let mut projector = [1.0_f32; PROJECTOR_DIMENSIONS];

    let normalization = embedding.normalize_prefix(&mut projector);

    assert_eq!(normalization.norm, 0.0);
    assert_eq!(normalization.denominator, 1.0e-12);
    assert!(projector.iter().all(|value| *value == 0.0));
}

#[test]
fn rejects_wrong_width_and_non_finite_components() {
    let short = [0.0_f32; CANONICAL_DIMENSIONS - 1];
    assert_matches!(
        CanonicalEmbedding::new(&short),
        Err(RepresentationError::Dimensions {
            expected: CANONICAL_DIMENSIONS,
            actual,
        }) if actual == short.len()
    ));

    let mut canonical = [0.0_f32; CANONICAL_DIMENSIONS];
    canonical[2_417] = f32::INFINITY;
    assert_matches!(
        CanonicalEmbedding::new(&canonical),
        Err(RepresentationError::NonFinite { index: 2_417 })
    ));
}

#[test]
fn owned_embedding_reuses_the_validated_vector_allocation() {
    let values = vec![0.25_f32; CANONICAL_DIMENSIONS];
    let allocation = values.as_ptr();

    let owned =
        OwnedCanonicalEmbedding::from_vec(values).expect("finite canonical vector should validate");

    assert_eq!(owned.as_array().as_ptr(), allocation);
    assert_eq!(
        owned.as_borrowed().as_array()[CANONICAL_DIMENSIONS - 1],
        0.25
    );
}

#[test]
fn simd_result_matches_a_scalar_f64_reference() {
    let mut canonical = [0.0_f32; CANONICAL_DIMENSIONS];
    for (index, value) in canonical.iter_mut().enumerate() {
        *value = ((index % 29) as f32 - 14.0) / 17.0;
    }
    let embedding = CanonicalEmbedding::new(&canonical).expect("should validate finite values");
    let mut projector = [0.0_f32; PROJECTOR_DIMENSIONS];

    let normalization = embedding.normalize_prefix(&mut projector);
    let expected_norm = canonical[..PROJECTOR_DIMENSIONS]
        .iter()
        .map(|value| f64::from(*value).powi(2))
        .sum::<f64>()
        .sqrt();

    assert!((normalization.norm - expected_norm).abs() <= 1.0e-12);
    for (actual, source) in projector.iter().zip(&canonical[..PROJECTOR_DIMENSIONS]) {
        let expected = f64::from(*source) / expected_norm;
        assert!((f64::from(*actual) - expected).abs() <= 1.0e-7);
    }
}
