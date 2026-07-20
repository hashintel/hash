use std::collections::HashMap;

use tempfile::tempdir;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::salt::{
    hash::ContentHash,
    identity::{ArtifactOrdinal, GenerationRowId},
    policy::{PlacementPosterior, PolicySource, Probability, ResolvedPolicy},
    relation::{
        AdmittedRelationInstance, AttractionCoefficients, AttractionConfig, ProtectionConfig,
        RelationConfidence, RelationIndexError, RelationPair, RelationPolicy,
        build_relation_indexes, publish_relation_indexes, relation_policy_hash,
    },
    strength::RelationStrength,
};

#[test]
fn empty_relation_indexes_preserve_the_complete_artifact_schema() {
    let directory = tempdir().expect("temporary directory should create");
    let root =
        camino::Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let published = publish_relation_indexes(
        &root.join("relations.atlas"),
        ContentHash::digest(b"empty-relation-config"),
        ContentHash::digest(b"empty-edge-snapshot"),
        &HashMap::new(),
        &[],
        &crate::salt::relation::RelationIndexes {
            attraction: Vec::new(),
            protection: Vec::new(),
        },
    )
    .expect("empty relation indexes should publish");

    assert_eq!(published.header.section_count, 30);
}

#[test]
fn edge_snapshot_identity_binds_pair_protection_state() {
    let mut indexes = crate::salt::relation::RelationIndexes {
        attraction: Vec::new(),
        protection: vec![crate::salt::relation::PairProtection {
            pair: RelationPair::new(row(0), row(1)),
            hard_mass: 0.75,
            ordinary_mass: 0.5,
            hard: true,
            ordinary: false,
        }],
    };
    let initial = indexes.edge_snapshot_hash();

    indexes.protection[0].ordinary = true;
    assert_ne!(indexes.edge_snapshot_hash(), initial);
    indexes.protection[0].ordinary = false;
    indexes.protection[0].hard_mass = 0.5;
    assert_ne!(indexes.edge_snapshot_hash(), initial);
}

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
        true,
    )
    .expect("ordered protection settings should validate");

    let indexes = build_relation_indexes(
        3,
        &[policy],
        &instances,
        AttractionConfig::default(),
        protection,
    )
    .expect("admitted relation fixtures should index");
    let mut reversed = instances;
    reversed.reverse();
    let reordered = build_relation_indexes(
        3,
        &[policy],
        &reversed,
        AttractionConfig::default(),
        protection,
    )
    .expect("input order should not affect relation indexes");

    assert_eq!(indexes.attraction.len(), instances.len());
    assert_eq!(indexes.attraction, reordered.attraction);
    assert_eq!(indexes.protection, reordered.protection);
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

    let directory = tempdir().expect("temporary directory should create");
    let root =
        camino::Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let path = root.join("relations.atlas");
    let policies = [policy];
    let relation_ordinals = HashMap::from([(relation_type(), relation)]);
    let policy_hash = relation_policy_hash(&relation_ordinals, &policies);
    let published = publish_relation_indexes(
        &path,
        policy_hash,
        ContentHash::digest(b"edge-snapshot"),
        &relation_ordinals,
        &policies,
        &indexes,
    )
    .expect("relation indexes should publish");
    let repeated = publish_relation_indexes(
        &path,
        policy_hash,
        ContentHash::digest(b"edge-snapshot"),
        &relation_ordinals,
        &policies,
        &indexes,
    )
    .expect("identical relation indexes should be idempotent");
    assert!(!published.reused_existing);
    assert!(repeated.reused_existing);
    assert_eq!(published.content_hash, repeated.content_hash);
}

#[test]
fn ordinary_negative_switch_controls_admission_without_erasing_mass() {
    let relation = ordinal(0);
    let policy = RelationPolicy {
        relation,
        policy: resolved_policy(0.0, 1.0, 0.0, 1.0),
        strength: RelationStrength::UNIT,
    };
    let instance = AdmittedRelationInstance {
        link_entity: entity(10),
        relation,
        left: row(0),
        right: row(1),
        confidence: RelationConfidence::default(),
    };
    let protection = ProtectionConfig::new(
        Probability::ZERO,
        Probability::ZERO,
        Probability::ZERO,
        Probability::ZERO,
        false,
    )
    .expect("disabled ordinary protection should validate");

    let indexes = build_relation_indexes(
        2,
        &[policy],
        &[instance],
        AttractionConfig::default(),
        protection,
    )
    .expect("relation indexes should preserve diagnostic masses");
    let pair = indexes
        .protection
        .first()
        .expect("one relation pair should be retained");
    assert!(pair.ordinary_mass > 0.0);
    assert!(!pair.ordinary);
}

fn relation_type() -> VersionedUrl {
    "https://hash.ai/@hash/types/entity-type/relation-test/v/1"
        .parse()
        .expect("fixture relation type should parse")
}

#[test]
fn force_pruning_does_not_remove_pre_gate_protection() {
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
        true,
    )
    .unwrap();

    let indexes = build_relation_indexes(
        2,
        &[policy],
        &[instance],
        AttractionConfig::new(AttractionCoefficients::default(), 0.1)
            .expect("pruning threshold should validate"),
        protection,
    )
    .expect("policy should index");

    assert!(indexes.attraction.is_empty());
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
        true,
    )
    .unwrap();
    assert_matches!(
        build_relation_indexes(2, &[sparse], &[], AttractionConfig::default(), protection,),
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
    assert_matches!(
        build_relation_indexes(
            2,
            &[policy],
            &[invalid],
            AttractionConfig::default(),
            protection,
        ),
        Err(RelationIndexError::RowOutOfBounds { row: invalid_row, rows: 2 })
            if invalid_row == row(2)
    ));

    let duplicate = AdmittedRelationInstance {
        right: row(1),
        ..invalid
    };
    assert_matches!(
        build_relation_indexes(
            2,
            &[policy],
            &[duplicate, duplicate],
            AttractionConfig::default(),
            protection,
        ),
        Err(RelationIndexError::DuplicateLinkEntity { link_entity })
            if link_entity == duplicate.link_entity
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
