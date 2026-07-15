use core::mem::size_of;

use tempfile::tempdir;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    analytic::{MergeTreeConfig, RasterConfig, RegionConfig},
    evaluation::{ConditionDomain, ConditionMeasurementConfig},
    graph::KnnTable,
    hash::ContentHash,
    identity::{ArtifactOrdinal, GenerationRowId, IdentityDirectory},
    materialize::{CoordinateBounds, ImportanceConfig},
    policy::Probability,
    projector::RelationEnergy,
    relation::{AttractionEdge, RelationConfidence},
    strength::RelationStrength,
};

#[test]
fn passing_ladder_materializes_idempotent_base_and_analytic_artifacts() {
    let projected = ProjectedLadder::from_fields([
        (0.0, vec![[0.0, 0.0], [4.0, 0.0], [0.0, 3.0]]),
        (0.5, vec![[0.0, 0.0], [3.0, 0.0], [0.0, 3.0]]),
        (1.0, vec![[0.0, 0.0], [2.0, 0.0], [0.0, 3.0]]),
    ]);
    let quality = [0_u8, 1, 2]
        .map(|value| ConditionQuality {
            semantic_fidelity: true,
            persistence: true,
            task_evidence: true,
            report: ContentHash::digest(&[value]),
        })
        .to_vec();
    let semantic =
        KnnTable::new(3, 1, vec![2, 2, 0], vec![0.1; 3]).expect("semantic graph should validate");
    let evaluated = projected
        .evaluate(
            ConditionDomain::new(0.0, 1.0, ContentHash::digest(b"condition-domain"))
                .expect("condition domain should validate"),
            quality,
            &[relation_edge()],
            &semantic,
            RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8)
                .expect("relation energy should validate"),
            ConditionMeasurementConfig {
                distinguishability_floor: 1.0e-4,
                monotonicity_tolerance: 1.0e-9,
            },
        )
        .expect("synthetic condition fields should evaluate");
    assert!(
        evaluated
            .measurements()
            .windows(2)
            .all(|pair| pair[1].relation_loss < pair[0].relation_loss)
    );
    let canonical = evaluated
        .select_canonical(1.0)
        .expect("passing final condition should select");

    let identities = IdentityDirectory::new(vec![entity(10), entity(20), entity(30)])
        .expect("unique identities should index");
    let directory = tempdir().expect("temporary directory should create");
    let root = camino::Utf8Path::from_path(directory.path())
        .expect("temporary directory path should be UTF-8");
    let grid_depths = [2, 4, 8];
    let signals = CanonicalSignals {
        importance: &[1.0, 0.8, 0.6],
        semantic_priority: &[0.9, 0.7, 0.5],
        density_mass: &[1.0, 0.8, 0.6],
        labels: &[Some("Primary"), Some("Related"), Some("Independent")],
    };
    let config = CanonicalMaterializationConfig {
        importance: ImportanceConfig {
            grid_depths: &grid_depths,
            hash_seed: 42,
            bounds: CoordinateBounds::new([-10.0; 2], [10.0; 2]).expect("bounds should validate"),
        },
        raster: RasterConfig {
            grid_size: 32,
            bandwidth_pixels: 1.0,
        },
        merge_tree: MergeTreeConfig::default(),
        regions: RegionConfig {
            density_floor_fraction: 0.005,
            minimum_peak_fraction: 0.05,
            maximum_regions: 8,
        },
        analytic_configuration: ContentHash::digest(b"analytic-config"),
    };
    let base_path = root.join("base-0.atlas");
    let analytic_path = root.join("analytic.atlas");
    let first = materialize_canonical(
        &base_path,
        &analytic_path,
        &identities,
        &canonical,
        signals,
        config,
    )
    .expect("canonical field should materialize");
    let repeated = materialize_canonical(
        &base_path,
        &analytic_path,
        &identities,
        &canonical,
        signals,
        config,
    )
    .expect("identical materialization should be idempotent");

    assert!(!first.base.artifact.reused_existing);
    assert!(!first.analytic.reused_existing);
    assert!(repeated.base.artifact.reused_existing);
    assert!(repeated.analytic.reused_existing);
    assert_eq!(
        first.base.artifact.content_hash,
        repeated.base.artifact.content_hash
    );
    assert_eq!(first.analytic.content_hash, repeated.analytic.content_hash);
    assert!(first.region_count >= 2);
    assert!(first.label_count >= 2);
    assert!(first.normalized_persistence > 0.0);

    let legacy_root = root.join("legacy");
    let tag = LegacyLayoutTag::new(0).expect("legacy tag should validate");
    let legacy = export_legacy_canvas(&legacy_root, tag, &identities, &canonical)
        .expect("canonical field should export for legacy evaluation");
    let repeated_legacy = export_legacy_canvas(&legacy_root, tag, &identities, &canonical)
        .expect("identical legacy export should be idempotent");
    assert_eq!(
        std::fs::metadata(&legacy.layout.path)
            .expect("legacy layout should exist")
            .len(),
        3 * 2 * u64::try_from(size_of::<f32>()).expect("scalar width should fit u64")
    );
    assert!(!legacy.manifest.reused_existing);
    assert!(repeated_legacy.layout.reused_existing);
    assert!(repeated_legacy.identities.reused_existing);
    assert!(repeated_legacy.manifest.reused_existing);
}

fn relation_edge() -> AttractionEdge {
    AttractionEdge {
        link_entity: entity(40),
        relation: ArtifactOrdinal::try_from(0_u32).expect("ordinal should validate"),
        left: GenerationRowId::try_from(0_u32).expect("row should validate"),
        right: GenerationRowId::try_from(1_u32).expect("row should validate"),
        confidence: RelationConfidence {
            link: Some(Probability::ONE),
            left: None,
            right: None,
        }
        .effective(),
        degree_normalization: 1.0,
        strength: RelationStrength::UNIT,
        coincident: 0.0,
        proximal: 1.0,
    }
}

fn entity(seed: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(seed)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(seed + 1)),
        draft_id: None,
    }
}
