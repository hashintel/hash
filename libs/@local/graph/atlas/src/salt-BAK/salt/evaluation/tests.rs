use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    graph::KnnTable,
    hash::ContentHash,
    identity::{ArtifactOrdinal, GenerationRowId},
    policy::Probability,
    projector::RelationEnergy,
    relation::{AttractionEdge, RelationConfidence},
    strength::RelationStrength,
};

#[test]
fn selects_only_an_exact_fully_passing_ladder_member() {
    let version = ContentHash::digest(b"eta-domain-v1");
    let selected_report = ContentHash::digest(b"eta-0.5-evaluation");
    let ladder = ConditionLadder::new(
        ConditionDomain::new(0.0, 1.0, version).expect("domain should validate"),
        [
            (0.0, evidence("zero")),
            (
                0.5,
                ConditionEvidence {
                    report: selected_report,
                    ..evidence("middle")
                },
            ),
            (1.0, evidence("one")),
        ],
    )
    .expect("ordered ladder should validate");

    let canonical = ladder
        .select_canonical(0.5)
        .expect("passing evaluated member should select");

    assert_eq!(canonical.condition().get(), 0.5);
    assert_eq!(canonical.domain_version(), version);
    assert_eq!(canonical.evidence(), selected_report);
    assert_eq!(
        ladder.select_canonical(0.25),
        Err(EvaluationError::UnknownCanonical { value: 0.25 })
    );
}

#[test]
fn failed_evidence_cannot_cross_the_materialization_boundary() {
    let mut failed = evidence("failed");
    failed.distinguishability = false;
    let ladder = ConditionLadder::new(domain(), [(0.0, evidence("zero")), (1.0, failed)])
        .expect("ladder shape should validate");

    assert_eq!(
        ladder.select_canonical(1.0),
        Err(EvaluationError::FailedCanonicalEvidence {
            value: 1.0,
            criterion: "distinguishability"
        })
    );
}

#[test]
fn condition_order_and_domain_are_strict() {
    assert_matches!(
        ConditionLadder::new(domain(), [(0.0, evidence("a")), (0.0, evidence("b"))]),
        Err(EvaluationError::UnorderedCondition { index: 1, .. })
    ));
    assert_eq!(
        ConditionLadder::new(domain(), [(0.0, evidence("a")), (1.1, evidence("b"))]),
        Err(EvaluationError::ConditionOutOfDomain {
            index: 1,
            value: 1.1
        })
    );
    assert_eq!(
        ConditionLadder::new(domain(), [(0.1, evidence("a")), (0.5, evidence("b"))]),
        Err(EvaluationError::MissingSemanticBaseline { value: 0.1 })
    );
}

#[test]
fn measured_ladder_aligns_fields_and_checks_relation_monotonicity() {
    let zero = [[0.0, 0.0], [4.0, 0.0], [0.0, 3.0]];
    let middle = [[0.0, 0.0], [3.0, 0.0], [0.0, 3.0]];
    let one = [[0.0, 0.0], [2.0, 0.0], [0.0, 3.0]];
    let fields = [field(0.0, &zero), field(0.5, &middle), field(1.0, &one)];
    let semantic =
        KnnTable::new(3, 1, vec![2, 2, 0], vec![0.1; 3]).expect("semantic graph should validate");
    let (ladder, measurements) = measure_condition_ladder(
        domain(),
        &fields,
        &[relation_edge()],
        &semantic,
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        ConditionMeasurementConfig {
            distinguishability_floor: 1.0e-4,
            monotonicity_tolerance: 1.0e-9,
        },
    )
    .expect("condition fields should measure");

    assert!(
        measurements
            .windows(2)
            .all(|pair| pair[1].relation_loss < pair[0].relation_loss)
    );
    assert!(measurements[1].aligned_rms_movement > 0.0);
    let selected = ladder
        .select_canonical(1.0)
        .expect("fully passing measured condition should select");
    let canonical = canonical_field(&ladder, &fields, &measurements, 1.0)
        .expect("selected condition should align for materialization");
    assert_eq!(canonical.selection(), selected);
    assert!(canonical.alignment().is_some());
    assert_eq!(canonical.coordinates().len(), one.len());
    assert_ne!(canonical.content_hash(), fields[2].upstream_report);
    let unquantized_hash = canonical.content_hash();
    let (quantized, quantization) = canonical
        .quantize(0.25, [-1.0, -1.0], [1.0, 1.0])
        .expect("canonical field should quantize");
    assert_ne!(quantized.content_hash(), unquantized_hash);
    assert!(quantization.clamp_count() > 0);
    assert!(quantization.clamp_rate() > 0.0);
    assert!(
        quantized
            .coordinates()
            .iter()
            .all(|coordinate| { coordinate.iter().all(|value| (-1.0..=1.0).contains(value)) })
    );

    let (_, other_domain) = measure_condition_ladder(
        ConditionDomain::new(0.0, 1.0, ContentHash::digest(b"other-domain"))
            .expect("other domain should validate"),
        &fields,
        &[relation_edge()],
        &semantic,
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        ConditionMeasurementConfig {
            distinguishability_floor: 1.0e-4,
            monotonicity_tolerance: 1.0e-9,
        },
    )
    .expect("other domain should measure");
    let (_, other_thresholds) = measure_condition_ladder(
        domain(),
        &fields,
        &[relation_edge()],
        &semantic,
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        ConditionMeasurementConfig {
            distinguishability_floor: 2.0e-4,
            monotonicity_tolerance: 2.0e-9,
        },
    )
    .expect("other thresholds should measure");

    assert_ne!(measurements[0].report, other_domain[0].report);
    assert_ne!(measurements[0].report, other_thresholds[0].report);
}

fn domain() -> ConditionDomain {
    ConditionDomain::new(0.0, 1.0, ContentHash::digest(b"domain"))
        .expect("fixture domain should validate")
}

fn evidence(name: &str) -> ConditionEvidence {
    ConditionEvidence {
        monotonicity: true,
        distinguishability: true,
        report: ContentHash::digest(name.as_bytes()),
    }
}

fn field<'field>(condition: f64, coordinates: &'field [[f64; 2]]) -> ConditionField<'field> {
    ConditionField {
        condition,
        coordinates,
        upstream_report: ContentHash::digest(&condition.to_bits().to_le_bytes()),
    }
}

fn relation_edge() -> AttractionEdge {
    AttractionEdge {
        link_entity: EntityId {
            web_id: WebId::new(Uuid::from_u128(1)),
            entity_uuid: EntityUuid::new(Uuid::from_u128(2)),
            draft_id: None,
        },
        relation: ArtifactOrdinal::try_from(0_u32).expect("ordinal should validate"),
        left: GenerationRowId::try_from(0_u32).expect("row should validate"),
        right: GenerationRowId::try_from(1_u32).expect("row should validate"),
        confidence: RelationConfidence {
            link: Some(Probability::new(1.0).expect("probability should validate")),
            left: None,
            right: None,
        }
        .effective(),
        degree_normalization: 1.0,
        strength: RelationStrength::new(1.0).expect("strength should validate"),
        coincident: 0.0,
        proximal: 1.0,
    }
}
