use std::fs::File;

use camino::Utf8PathBuf;
use tempfile::tempdir;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    hash::ContentHash,
    identity::{GenerationRowId, IdentityDirectory},
    storage::mmap::MappedArtifact,
};

#[test]
fn coordinate_bounds_reject_an_overflowing_finite_extent() {
    assert_eq!(
        CoordinateBounds::new([-f64::MAX, 0.0], [f64::MAX, 1.0]),
        Err(ImportanceError::NonFiniteBounds { axis: 0 })
    );
}

#[test]
fn first_occupant_ranking_covers_every_cell_at_each_bucket_prefix() {
    let entities = (0..7).map(entity_id).collect::<Vec<_>>();
    let rows = [
        input(0, &entities[0], [0.1, 0.1], 10.0),
        input(1, &entities[1], [0.9, 0.1], 9.0),
        input(2, &entities[2], [0.1, 0.9], 8.0),
        input(3, &entities[3], [0.9, 0.9], 7.0),
        input(4, &entities[4], [0.2, 0.2], 6.0),
        input(5, &entities[5], [0.3, 0.3], 5.0),
        input(6, &entities[6], [0.3, 0.3], 4.0),
    ];
    let depths = [0, 1, 2];

    let ranked = rank_importance(
        &rows,
        ImportanceConfig {
            grid_depths: &depths,
            hash_seed: 17,
            bounds: bounds(),
        },
    )
    .expect("valid points should rank");

    assert_eq!(ranked[0].row, row(0));
    assert_eq!(ranked[0].bucket, 0);
    assert_eq!(
        ranked
            .iter()
            .filter(|point| point.bucket == 1)
            .map(|point| point.row)
            .collect::<Vec<_>>(),
        [row(1), row(2), row(3)]
    );
    assert_eq!(
        ranked
            .iter()
            .filter(|point| point.bucket == 3)
            .map(|point| point.row)
            .collect::<Vec<_>>(),
        [row(4), row(6)]
    );

    for (bucket, depth) in depths.into_iter().enumerate() {
        let all_cells = ranked
            .iter()
            .map(|point| point.morton.prefix(depth))
            .collect::<std::collections::HashSet<_>>();
        let prefix_cells = ranked
            .iter()
            .filter(|point| usize::from(point.bucket) <= bucket)
            .map(|point| point.morton.prefix(depth))
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(prefix_cells, all_cells);
    }
}

#[test]
fn priority_ties_are_independent_of_input_order() {
    let entities = (10..16).map(entity_id).collect::<Vec<_>>();
    let mut inputs = entities
        .iter()
        .enumerate()
        .map(|(index, entity)| input(index as u32, entity, [0.5, 0.5], 1.0))
        .collect::<Vec<_>>();
    let config = ImportanceConfig {
        grid_depths: &[0, 16],
        hash_seed: 0x5EED,
        bounds: bounds(),
    };
    let forward = rank_importance(&inputs, config).expect("forward inputs should rank");
    inputs.reverse();
    let reverse = rank_importance(&inputs, config).expect("reversed inputs should rank");

    assert_eq!(forward, reverse);
}

#[test]
fn morton_keys_interleave_all_axis_bits() {
    assert_eq!(MortonKey::new(0, 0).get(), 0);
    assert_eq!(MortonKey::new(u16::MAX, 0).get(), 0x5555_5555);
    assert_eq!(MortonKey::new(0, u16::MAX).get(), 0xAAAA_AAAA);
    assert_eq!(MortonKey::new(u16::MAX, u16::MAX).get(), u32::MAX);
}

#[test]
fn rejects_duplicate_rows_and_coordinates_outside_the_extent() {
    let entity = entity_id(100);
    let duplicate = [
        input(4, &entity, [0.2, 0.2], 1.0),
        input(4, &entity, [0.8, 0.8], 2.0),
    ];
    let config = ImportanceConfig {
        grid_depths: &[0, 4],
        hash_seed: 1,
        bounds: bounds(),
    };
    assert_eq!(
        rank_importance(&duplicate, config),
        Err(ImportanceError::DuplicateRow { row: 4 })
    );

    let outside = [input(5, &entity, [1.1, 0.2], 1.0)];
    assert_eq!(
        rank_importance(&outside, config),
        Err(ImportanceError::CoordinateOutOfBounds {
            row: 0,
            axis: 0,
            value: 1.1,
        })
    );
}

#[test]
fn base_artifact_binds_spatial_delivery_order_to_generation_identities() {
    use super::base::{BUCKET_OFFSETS, COORDINATES, MORTON_KEYS, ROWS, WEB_IDS};

    let entities = (0..3).map(entity_id).collect::<Vec<_>>();
    let identities =
        IdentityDirectory::new(entities.clone()).expect("identity directory should be valid");
    let coordinates = [[0.0, 1.0], [10.0, 11.0], [20.0, 21.0]];
    let mut ranked = [
        RankedPoint {
            row: row(2),
            bucket: 0,
            morton: MortonKey::new(2, 2),
            priority_rank: 0,
        },
        RankedPoint {
            row: row(0),
            bucket: 1,
            morton: MortonKey::new(1, 1),
            priority_rank: 1,
        },
        RankedPoint {
            row: row(1),
            bucket: 1,
            morton: MortonKey::new(0, 0),
            priority_rank: 2,
        },
    ];
    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("base.salt"))
        .expect("temporary path should be UTF-8");

    publish_base_artifact(
        &path,
        &identities,
        &coordinates,
        &mut ranked,
        CanonicalProvenance {
            field_hash: ContentHash::digest(b"field"),
            condition: 1.0,
            condition_domain_hash: ContentHash::digest(b"domain"),
            selection_evidence_hash: ContentHash::digest(b"evidence"),
            procrustes_transform: [1.0, 1.0, 0.0, 0.0, 0.0],
            quantization_step: 0.25,
        },
    )
    .expect("base artifact should publish");
    assert_eq!(ranked.map(|point| point.row.as_u32()), [2, 1, 0]);
    let artifact = MappedArtifact::map_immutable(
        File::open(&path).expect("base artifact should open"),
        BASE_ARTIFACT_FORMAT,
    )
    .expect("base artifact should map");
    let view = artifact.view();

    assert_eq!(
        view.section(ROWS)
            .expect("rows should exist")
            .as_u32()
            .expect("rows should be u32"),
        &[2, 1, 0]
    );
    assert_eq!(
        view.section(COORDINATES)
            .expect("coordinates should exist")
            .as_f32()
            .expect("coordinates should be f32"),
        &[20.0, 21.0, 10.0, 11.0, 0.0, 1.0]
    );
    assert_eq!(
        view.section(MORTON_KEYS)
            .expect("Morton keys should exist")
            .as_u32()
            .expect("Morton keys should be u32"),
        &[
            MortonKey::new(2, 2).get(),
            MortonKey::new(0, 0).get(),
            MortonKey::new(1, 1).get(),
        ]
    );
    assert_eq!(
        view.section(BUCKET_OFFSETS)
            .expect("bucket offsets should exist")
            .as_u64()
            .expect("bucket offsets should be u64"),
        &[0, 1, 3]
    );
    let first_web: Uuid = entities[0].web_id.into();
    assert_eq!(
        &view
            .section(WEB_IDS)
            .expect("web IDs should exist")
            .as_u8()
            .expect("web IDs should be bytes")[..16],
        first_web.as_bytes()
    );
}

fn input<'entity>(
    row_id: u32,
    entity_id: &'entity EntityId,
    coordinate: [f64; 2],
    importance: f64,
) -> ImportanceInput<'entity> {
    ImportanceInput {
        row: row(row_id),
        entity_id,
        coordinate,
        importance,
        semantic_priority: 0.0,
    }
}

fn row(value: u32) -> GenerationRowId {
    GenerationRowId::from_u32(value).expect("fixture row should fit")
}

fn bounds() -> CoordinateBounds {
    CoordinateBounds::new([0.0, 0.0], [1.0, 1.0]).expect("fixture bounds should validate")
}

fn entity_id(seed: u32) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(u128::from(seed) + 1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(u128::from(seed) + 2)),
        draft_id: None,
    }
}
