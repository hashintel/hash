use super::{PersistenceComparisonError, PersistenceComparisonReport};
use crate::salt::hash::ContentHash;

#[test]
fn complete_report_satisfies_the_two_sided_envelope() {
    report()
        .validate()
        .expect("balanced candidate/reference evidence should pass");
}

#[test]
fn total_persistence_is_bounded_on_both_sides() {
    let mut below = report();
    below.candidate_normalized_total = 0.49;
    assert_matches!(
        below.validate(),
        Err(PersistenceComparisonError::Envelope)
    ));

    let mut above = report();
    above.candidate_normalized_total = 1.51;
    assert_matches!(
        above.validate(),
        Err(PersistenceComparisonError::Envelope)
    ));
}

#[test]
fn measurements_reject_negative_zero_as_noncanonical() {
    let mut negative_zero = report();
    negative_zero.candidate_normalized_total = -0.0;

    assert_matches!(
        negative_zero.validate(),
        Err(PersistenceComparisonError::Measurement)
    ));
}

#[test]
fn every_fixed_threshold_leaf_count_is_two_sided() {
    let mut below = report();
    below.candidate_leaf_counts[1] = 2;
    assert_matches!(
        below.validate(),
        Err(PersistenceComparisonError::Envelope)
    ));

    let mut above = report();
    above.candidate_leaf_counts[0] = 16;
    assert_matches!(
        above.validate(),
        Err(PersistenceComparisonError::Envelope)
    ));
}

#[test]
fn unsupported_structure_noise_and_planted_failures_are_independent_rejections() {
    let mut low_persistence = report();
    low_persistence.candidate_low_persistence_mass = 0.21;
    assert_matches!(
        low_persistence.validate(),
        Err(PersistenceComparisonError::LowPersistence)
    ));

    let mut noise = report();
    noise.candidate_noise_persistence = 0.31;
    assert_matches!(
        noise.validate(),
        Err(PersistenceComparisonError::Noise)
    ));

    let mut planted = report();
    planted.planted_shape_failures = 1;
    assert_matches!(
        planted.validate(),
        Err(PersistenceComparisonError::PlantedShapes)
    ));
}

fn report() -> PersistenceComparisonReport {
    let hash = |name: &str| ContentHash::digest(name.as_bytes());
    PersistenceComparisonReport {
        suite_version: "persistence-quality-v1".to_owned(),
        evaluator_contract_hash: hash("evaluator"),
        checkpoint_hash: hash("checkpoint"),
        candidate_field_hash: hash("field"),
        candidate_tree_hash: hash("candidate-tree"),
        reference_tree_hash: hash("reference-tree"),
        reference_source_hash: hash("reference-source"),
        fixed_thresholds: vec![0.01, 0.05, 0.10],
        candidate_leaf_counts: vec![10, 6, 3],
        reference_leaf_counts: vec![10, 6, 3],
        candidate_normalized_total: 1.0,
        reference_normalized_total: 1.0,
        minimum_ratio: 0.5,
        maximum_ratio: 1.5,
        candidate_low_persistence_mass: 0.1,
        reference_low_persistence_mass: 0.1,
        maximum_low_persistence_ratio: 2.0,
        candidate_noise_persistence: 0.1,
        reference_noise_persistence: 0.1,
        maximum_noise_ratio: 3.0,
        planted_shape_cases: 6,
        planted_shape_failures: 0,
        distribution_report_hash: hash("distribution"),
        planted_shape_report_hash: hash("planted"),
        noise_report_hash: hash("noise"),
    }
}
