use std::{io::Write as _, num::NonZeroUsize};

use camino::Utf8PathBuf;
use tempfile::{NamedTempFile, tempdir};

use crate::salt::{
    classifier::{
        APPLICABILITY_INVERSE_SCALES, CLASSIFIER_FORMAT, COEFFICIENTS, ClassifierError,
        ClassifierFitConfig, ClassifierFitError, ClassifierTrainingRow, ClassifierTrainingSet,
        ClassifierView, fit_classifier, publish_fitted_classifier,
    },
    hash::ContentHash,
    policy::PlacementClass,
    representation::{CANONICAL_DIMENSIONS, CanonicalEmbedding},
    storage::mmap::{MappedArtifact, ScalarType},
};

const CLASS_ORDER_OFFSET: usize = 448;
const COEFFICIENTS_OFFSET: usize = 512;
const INTERCEPTS_OFFSET: usize = 74_240;
const TEMPERATURE_OFFSET: usize = 74_304;
const MEAN_OFFSET: usize = 74_368;
const INVERSE_SCALES_OFFSET: usize = 98_944;
const TRAINING_DISTANCES_OFFSET: usize = 123_520;
const TOTAL_BYTES: usize = 123_544;

#[test]
fn simd_inference_matches_independent_scalar_goldens() {
    let (_file, artifact) = map_fixture(&fixture()).expect("fixture should map");
    let classifier =
        ClassifierView::new(artifact.view()).expect("classifier sections should validate");
    let mut values = [0.0_f32; CANONICAL_DIMENSIONS];
    values[0] = 1.0;
    values[1] = 2.0;
    values[CANONICAL_DIMENSIONS - 1] = 4.0;
    let embedding = CanonicalEmbedding::new(&values).expect("embedding should validate");

    let prediction = classifier
        .predict(embedding)
        .expect("finite fixture should produce a prediction");

    assert_close(prediction.logits[0], 2.1, 1.0e-14);
    assert_close(prediction.logits[1], -1.8, 1.0e-14);
    assert_close(prediction.logits[2], 1.7, 1.0e-14);
    assert_close(
        prediction.raw.coincident.get(),
        0.591_519_284_800_288_9,
        1.0e-14,
    );
    assert_close(
        prediction.raw.proximal.get(),
        0.011_973_480_981_412_989,
        1.0e-14,
    );
    assert_close(
        prediction.raw.overlay.get(),
        0.396_507_234_218_298_03,
        1.0e-14,
    );
    assert_close(
        prediction.calibrated.coincident.get(),
        0.509_942_651_554_204_2,
        1.0e-14,
    );
    assert_close(
        prediction.calibrated.proximal.get(),
        0.072_551_617_312_239_37,
        1.0e-14,
    );
    assert_close(
        prediction.calibrated.overlay.get(),
        0.417_505_731_133_556_5,
        1.0e-14,
    );
    assert_close(prediction.distance, 0.082_679_728_470_768_46, 1.0e-14);
    assert_close(prediction.applicability.get(), 1.0 / 3.0, 1.0e-14);
    assert_eq!(
        prediction.calibrated.top_class(),
        PlacementClass::Coincident
    );
}

#[test]
fn python_export_matches_rust_classifier_artifact() {
    let bytes = include_bytes!("../../../fixtures/relation-classifier-python-v1.salt");
    assert_eq!(bytes.as_slice(), fixture());

    let (_file, artifact) = map_fixture(bytes).expect("Python fixture should map");
    let classifier = ClassifierView::new(artifact.view()).expect("Python fixture should validate");
    assert_close(classifier.temperature(), 2.0, f64::EPSILON);
}

#[test]
fn rejects_wrong_class_order_and_non_positive_scales() {
    let mut bytes = fixture();
    bytes[CLASS_ORDER_OFFSET..CLASS_ORDER_OFFSET + 3].copy_from_slice(&[1, 0, 2]);
    rehash(&mut bytes);
    let (_file, artifact) = map_fixture(&bytes).expect("generic artifact should remain valid");
    assert_matches!(
        ClassifierView::new(artifact.view()),
        Err(ClassifierError::ClassOrder)
    ));

    let mut bytes = fixture();
    put_f64(&mut bytes, INVERSE_SCALES_OFFSET + 19 * 8, -1.0);
    rehash(&mut bytes);
    let (_file, artifact) = map_fixture(&bytes).expect("generic artifact should remain valid");
    assert_matches!(
        ClassifierView::new(artifact.view()),
        Err(ClassifierError::NonPositive {
            section: APPLICABILITY_INVERSE_SCALES,
            index: 19,
        })
    ));
}

#[test]
fn rejects_unsorted_applicability_evidence_and_non_finite_parameters() {
    let mut bytes = fixture();
    put_f64(&mut bytes, TRAINING_DISTANCES_OFFSET + 8, 0.2);
    rehash(&mut bytes);
    let (_file, artifact) = map_fixture(&bytes).expect("generic artifact should remain valid");
    assert_matches!(
        ClassifierView::new(artifact.view()),
        Err(ClassifierError::Unsorted { index: 2, .. })
    ));

    let mut bytes = fixture();
    put_f64(&mut bytes, COEFFICIENTS_OFFSET + 71 * 8, f64::NAN);
    rehash(&mut bytes);
    let (_file, artifact) = map_fixture(&bytes).expect("generic artifact should remain valid");
    assert_matches!(
        ClassifierView::new(artifact.view()),
        Err(ClassifierError::NonFinite {
            section: COEFFICIENTS,
            index: 71,
        })
    ));
}

#[test]
fn fails_closed_when_finite_values_overflow_inference() {
    let mut bytes = fixture();
    put_f64(&mut bytes, COEFFICIENTS_OFFSET, f64::MAX);
    rehash(&mut bytes);
    let (_file, artifact) = map_fixture(&bytes).expect("generic artifact should remain valid");
    let classifier =
        ClassifierView::new(artifact.view()).expect("finite parameters should validate");
    let mut values = [0.0_f32; CANONICAL_DIMENSIONS];
    values[0] = f32::MAX;
    let embedding = CanonicalEmbedding::new(&values).expect("embedding should validate");

    assert_matches!(
        classifier.predict(embedding),
        Err(ClassifierError::NonFiniteOutput)
    ));
}

#[test]
fn rust_fit_separates_soft_targets_without_splitting_families() {
    let (embeddings, rows) = fitting_fixture();
    let training =
        ClassifierTrainingSet::new(&embeddings, &rows).expect("training data should be valid");
    let fitted = fit_classifier(training, fitting_config(2)).expect("classifier should converge");

    for family in 0..4 {
        let fold = fitted.validation.folds[family * 3];
        assert_eq!(
            &fitted.validation.folds[family * 3..family * 3 + 3],
            &[fold; 3]
        );
    }
    assert!(
        fitted.validation.calibrated_cross_entropy <= fitted.validation.raw_cross_entropy + 1.0e-12
    );
    for class in 0..3 {
        let logits = fitted_logits(&fitted, &embeddings[class * CANONICAL_DIMENSIONS..]);
        let predicted = (0..3)
            .max_by(|left, right| logits[*left].total_cmp(&logits[*right]))
            .expect("class set should be non-empty");
        assert_eq!(predicted, class);
    }
    assert!(
        fitted
            .applicability_training_distances
            .windows(2)
            .all(|pair| pair[0] <= pair[1])
    );

    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("classifier.salt"))
        .expect("temporary path should be UTF-8");
    publish_fitted_classifier(&path, &fitted).expect("fitted classifier should publish");
    let artifact = MappedArtifact::map_immutable(
        std::fs::File::open(&path).expect("classifier should open"),
        CLASSIFIER_FORMAT,
    )
    .expect("classifier should map");
    let classifier =
        ClassifierView::new(artifact.view()).expect("published classifier should validate");
    let first: &[f32; CANONICAL_DIMENSIONS] = embeddings[..CANONICAL_DIMENSIONS]
        .try_into()
        .expect("fixture row should be complete");
    let output = classifier
        .predict(CanonicalEmbedding::new(first).expect("fixture should be finite"))
        .expect("published classifier should score");
    assert_eq!(output.calibrated.top_class(), PlacementClass::Coincident);
}

#[test]
fn grouped_fit_rejects_too_few_independent_families() {
    let (embeddings, rows) = fitting_fixture();
    let training =
        ClassifierTrainingSet::new(&embeddings, &rows).expect("training data should be valid");

    assert_eq!(
        fit_classifier(training, fitting_config(5)),
        Err(ClassifierFitError::InsufficientFamilies {
            families: 4,
            folds: 5,
        })
    );
}

fn fitting_fixture() -> (Vec<f32>, Vec<ClassifierTrainingRow>) {
    let mut embeddings = vec![0.0_f32; 12 * CANONICAL_DIMENSIONS];
    let mut rows = Vec::with_capacity(12);
    let targets = [[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]];
    for family in 0..4 {
        let family_hash = ContentHash::digest(format!("family-{family}").as_bytes());
        for class in 0..3 {
            let row = family * 3 + class;
            let embedding =
                &mut embeddings[row * CANONICAL_DIMENSIONS..(row + 1) * CANONICAL_DIMENSIONS];
            match class {
                0 => embedding[0] = 1.0,
                1 => embedding[0] = -1.0,
                2 => embedding[1] = 1.0,
                _ => unreachable!("fixture has exactly three classes"),
            }
            embedding[2] = f32::from(u16::try_from(family).expect("family should fit")) * 0.01;
            rows.push(ClassifierTrainingRow {
                target: targets[class],
                vote_weight: 3.0,
                family: family_hash,
            });
        }
    }
    (embeddings, rows)
}

fn fitting_config(folds: usize) -> ClassifierFitConfig {
    ClassifierFitConfig {
        regularization: 1.0,
        maximum_iterations: NonZeroUsize::new(200).expect("iterations should be non-zero"),
        gradient_tolerance: 1.0e-7,
        history_size: NonZeroUsize::new(8).expect("history should be non-zero"),
        folds: NonZeroUsize::new(folds).expect("folds should be non-zero"),
        seed: 17,
    }
}

fn fitted_logits(
    fitted: &crate::salt::classifier::FittedClassifier,
    embedding: &[f32],
) -> [f64; 3] {
    core::array::from_fn(|class| {
        fitted.intercepts[class]
            + embedding[..CANONICAL_DIMENSIONS]
                .iter()
                .zip(
                    &fitted.coefficients
                        [class * CANONICAL_DIMENSIONS..(class + 1) * CANONICAL_DIMENSIONS],
                )
                .map(|(value, coefficient)| f64::from(*value) * coefficient)
                .sum::<f64>()
    })
}

fn fixture() -> Vec<u8> {
    let mut bytes = vec![0_u8; TOTAL_BYTES];
    bytes[..8].copy_from_slice(b"SALTMMAP");
    put_u16(&mut bytes, 8, 1);
    put_u16(&mut bytes, 10, 1);
    put_u32(&mut bytes, 12, 0x0102_0304);
    put_u32(&mut bytes, 16, 64);
    put_u32(&mut bytes, 20, 7);
    put_u64(&mut bytes, 24, TOTAL_BYTES as u64);

    descriptor(
        &mut bytes,
        0,
        1,
        ScalarType::U8,
        1,
        CLASS_ORDER_OFFSET,
        3,
        [3, 0, 0],
    );
    descriptor(
        &mut bytes,
        1,
        2,
        ScalarType::F64,
        2,
        COEFFICIENTS_OFFSET,
        3 * CANONICAL_DIMENSIONS * 8,
        [3, CANONICAL_DIMENSIONS as u64, 0],
    );
    descriptor(
        &mut bytes,
        2,
        3,
        ScalarType::F64,
        1,
        INTERCEPTS_OFFSET,
        3 * 8,
        [3, 0, 0],
    );
    descriptor(
        &mut bytes,
        3,
        4,
        ScalarType::F64,
        1,
        TEMPERATURE_OFFSET,
        8,
        [1, 0, 0],
    );
    descriptor(
        &mut bytes,
        4,
        5,
        ScalarType::F64,
        1,
        MEAN_OFFSET,
        CANONICAL_DIMENSIONS * 8,
        [CANONICAL_DIMENSIONS as u64, 0, 0],
    );
    descriptor(
        &mut bytes,
        5,
        6,
        ScalarType::F64,
        1,
        INVERSE_SCALES_OFFSET,
        CANONICAL_DIMENSIONS * 8,
        [CANONICAL_DIMENSIONS as u64, 0, 0],
    );
    descriptor(
        &mut bytes,
        6,
        7,
        ScalarType::F64,
        1,
        TRAINING_DISTANCES_OFFSET,
        3 * 8,
        [3, 0, 0],
    );

    bytes[CLASS_ORDER_OFFSET..CLASS_ORDER_OFFSET + 3].copy_from_slice(&[0, 1, 2]);
    put_f64(&mut bytes, COEFFICIENTS_OFFSET, 2.0);
    put_f64(
        &mut bytes,
        COEFFICIENTS_OFFSET + (CANONICAL_DIMENSIONS + 1) * 8,
        -1.0,
    );
    put_f64(
        &mut bytes,
        COEFFICIENTS_OFFSET + (3 * CANONICAL_DIMENSIONS - 1) * 8,
        0.5,
    );
    for (index, value) in [0.1, 0.2, -0.3].into_iter().enumerate() {
        put_f64(&mut bytes, INTERCEPTS_OFFSET + index * 8, value);
    }
    put_f64(&mut bytes, TEMPERATURE_OFFSET, 2.0);
    for index in 0..CANONICAL_DIMENSIONS {
        put_f64(&mut bytes, INVERSE_SCALES_OFFSET + index * 8, 1.0);
    }
    for (index, value) in [0.0, 0.05, 0.1].into_iter().enumerate() {
        put_f64(&mut bytes, TRAINING_DISTANCES_OFFSET + index * 8, value);
    }
    rehash(&mut bytes);
    bytes
}

#[expect(
    clippy::too_many_arguments,
    reason = "mirrors one fixed binary descriptor"
)]
fn descriptor(
    bytes: &mut [u8],
    index: usize,
    id: u16,
    scalar: ScalarType,
    rank: u8,
    offset: usize,
    length: usize,
    shape: [u64; 3],
) {
    let descriptor = 64 + index * 48;
    put_u16(bytes, descriptor, id);
    bytes[descriptor + 2] = scalar as u8;
    bytes[descriptor + 3] = rank;
    put_u32(bytes, descriptor + 4, 64);
    put_u64(bytes, descriptor + 8, offset as u64);
    put_u64(bytes, descriptor + 16, length as u64);
    for (axis, dimension) in shape.into_iter().enumerate() {
        put_u64(bytes, descriptor + 24 + axis * 8, dimension);
    }
}

fn map_fixture(bytes: &[u8]) -> Result<(NamedTempFile, MappedArtifact), std::io::Error> {
    let mut file = NamedTempFile::new()?;
    file.write_all(bytes)?;
    file.flush()?;
    let artifact = MappedArtifact::map_immutable(file.reopen()?, CLASSIFIER_FORMAT)
        .map_err(std::io::Error::other)?;
    Ok((file, artifact))
}

fn rehash(bytes: &mut [u8]) {
    let hash = ContentHash::digest(&bytes[64..]);
    bytes[32..64].copy_from_slice(hash.as_bytes());
}

fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

fn put_f64(bytes: &mut [u8], offset: usize, value: f64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

fn assert_close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "{actual:.17} differs from {expected:.17} by more than {tolerance}"
    );
}
