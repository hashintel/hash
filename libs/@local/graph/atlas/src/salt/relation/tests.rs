use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::salt::{
    identity::{ArtifactOrdinal, GenerationRowId},
    policy::{PlacementPosterior, PolicySource, Probability, ResolvedPolicy},
    relation::{
        AdmittedRelationInstance, AttractionCoefficients, ProtectionConfig, RelationConfidence,
        RelationIndexError, RelationPair, RelationPolicy, build_relation_indexes,
    },
    strength::RelationStrength,
};

#[test]
fn parallel_links_preserve_attraction_and_max_aggregate_protection() {
    let relation = ordinal(0);
    let policy = RelationPolicy {
        relation,
        policy: resolved_policy(0.3, 0.5, 0.2, 0.5),
        strength: RelationStrength::new(1.75).expect("fixture strength should validate"),
    };
    let instances = [
        AdmittedRelationInstance {
            link_entity: entity(10),
            relation,
            left: row(0),
            right: row(1),
            confidence: RelationConfidence {
                link: Some(probability(0.8)),
                left: Some(probability(0.25)),
                right: None,
            },
        },
        AdmittedRelationInstance {
            link_entity: entity(20),
            relation,
            left: row(1),
            right: row(0),
            confidence: RelationConfidence::default(),
        },
        AdmittedRelationInstance {
            link_entity: entity(30),
            relation,
            left: row(0),
            right: row(2),
            confidence: RelationConfidence::default(),
        },
    ];
    let protection = ProtectionConfig::new(
        probability(0.75),
        probability(0.0),
        probability(0.5),
        probability(0.6),
    )
    .expect("ordered protection settings should validate");

    let indexes = build_relation_indexes(
        3,
        &[policy],
        &instances,
        AttractionCoefficients::default(),
        protection,
    )
    .expect("admitted relation fixtures should index");

    assert_eq!(indexes.attraction.len(), instances.len());
    let first = indexes.attraction[0];
    assert!((first.confidence.value() - 0.4).abs() <= f64::EPSILON);
    assert!(first.confidence.link_was_scored());
    assert!(first.confidence.left_was_scored());
    assert!(!first.confidence.right_was_scored());
    assert!((first.degree_normalization - 1.0 / 12.0_f64.sqrt()).abs() <= f64::EPSILON);
    assert_eq!(first.strength.get(), 1.75);
    assert_eq!(first.coincident, 0.0);
    assert_eq!(first.proximal, 0.25);

    let pair = indexes
        .protection
        .iter()
        .find(|entry| entry.pair == RelationPair::new(row(0), row(1)))
        .expect("parallel pair should have protection evidence");
    assert!((pair.hard_mass - 0.6).abs() <= f64::EPSILON);
    assert!((pair.ordinary_mass - 0.4).abs() <= f64::EPSILON);
    assert!(pair.hard);
    assert!(!pair.ordinary);
}

#[test]
fn protection_uses_raw_policy_before_the_coincident_gate() {
    let relation = ordinal(0);
    let policy = RelationPolicy {
        relation,
        policy: resolved_policy(0.9, 0.0, 0.1, 1.0),
        strength: RelationStrength::UNIT,
    };
    let instance = AdmittedRelationInstance {
        link_entity: entity(40),
        relation,
        left: row(0),
        right: row(1),
        confidence: RelationConfidence::default(),
    };
    let protection = ProtectionConfig::new(
        probability(0.0),
        probability(0.0),
        probability(0.8),
        probability(0.8),
    )
    .unwrap();

    let indexes = build_relation_indexes(
        2,
        &[policy],
        &[instance],
        AttractionCoefficients::default(),
        protection,
    )
    .expect("policy should index");

    assert_eq!(indexes.attraction[0].coincident, 0.0);
    assert_eq!(indexes.attraction[0].proximal, 0.0);
    assert!(indexes.protection[0].hard);
    assert!(indexes.protection[0].ordinary);
}

#[test]
fn rejects_sparse_policies_and_out_of_range_endpoints() {
    let sparse = RelationPolicy {
        relation: ordinal(1),
        policy: resolved_policy(0.0, 1.0, 0.0, 1.0),
        strength: RelationStrength::UNIT,
    };
    let protection = ProtectionConfig::new(
        probability(0.0),
        probability(0.0),
        probability(0.0),
        probability(0.0),
    )
    .unwrap();
    assert!(matches!(
        build_relation_indexes(
            2,
            &[sparse],
            &[],
            AttractionCoefficients::default(),
            protection,
        ),
        Err(RelationIndexError::PolicyOrder { position: 0, .. })
    ));

    let policy = RelationPolicy {
        relation: ordinal(0),
        ..sparse
    };
    let invalid = AdmittedRelationInstance {
        link_entity: entity(50),
        relation: ordinal(0),
        left: row(0),
        right: row(2),
        confidence: RelationConfidence::default(),
    };
    assert!(matches!(
        build_relation_indexes(
            2,
            &[policy],
            &[invalid],
            AttractionCoefficients::default(),
            protection,
        ),
        Err(RelationIndexError::RowOutOfBounds { row: invalid_row, rows: 2 })
            if invalid_row == row(2)
    ));
}

fn resolved_policy(
    coincident: f64,
    proximal: f64,
    overlay: f64,
    applicability: f64,
) -> ResolvedPolicy {
    let selected =
        PlacementPosterior::new(coincident, proximal, overlay).expect("posterior should normalize");
    let applicability = probability(applicability);
    let attraction = selected.with_applicability(applicability);
    ResolvedPolicy {
        source: PolicySource::Classifier,
        selected,
        applicability,
        attraction,
        effective_attraction: attraction.without_coincident(),
        coincident_admitted: false,
    }
}

fn probability(value: f64) -> Probability {
    Probability::new(value).expect("fixture probability should validate")
}

fn row(value: u32) -> GenerationRowId {
    GenerationRowId::from_u32(value).expect("fixture row should validate")
}

fn ordinal(value: u32) -> ArtifactOrdinal {
    ArtifactOrdinal::from_u32(value).expect("fixture ordinal should validate")
}

fn entity(seed: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(seed)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(seed + 1)),
        draft_id: None,
    }
}
