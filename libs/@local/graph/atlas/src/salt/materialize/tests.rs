use std::{fs::File, num::NonZeroUsize};

use camino::Utf8PathBuf;
use tempfile::tempdir;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    activation::ActiveRelease,
    hash::ContentHash,
    identity::{GenerationRowId, IdentityDirectory},
    revision::VariantId,
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
    assert_eq!(
        MortonKey::from_u32(MortonKey::new(123, 45_678).get()).coordinates(),
        [123, 45_678]
    );
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
fn spatial_index_resolves_nearest_and_radius_hits_in_grid_space() {
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
    let artifact = MappedArtifact::map_immutable(
        File::open(&path).expect("base artifact should open"),
        BASE_ARTIFACT_FORMAT,
    )
    .expect("base artifact should map");

    let index = SpatialIndex::build(artifact.view()).expect("spatial index should build");
    assert_eq!(index.len(), 3);

    // Nearest lookup beside grid cell (2, 2): generation row 2, first rung.
    let nearest = index.query(
        LookupRequest::new(
            1.9,
            2.1,
            None,
            NonZeroUsize::new(1).expect("one is non-zero"),
        )
        .expect("nearest request should validate"),
    );
    assert_eq!(nearest.len(), 1);
    assert_eq!(nearest[0].row, 2);
    assert_eq!(nearest[0].entity_id, entities[2]);
    assert_eq!(nearest[0].grid, [2.0, 2.0]);
    assert_eq!(nearest[0].canonical, [20.0, 21.0]);
    assert_eq!(nearest[0].bucket, 0);
    // Hand-computed: sqrt(0.1^2 + 0.1^2).
    assert!((nearest[0].distance - 0.141_421_36).abs() < 1e-6);

    // Radius 1.5 around the origin reaches (0, 0) and (1, 1), nearest first,
    // but not (2, 2) at distance 2 * sqrt(2).
    let within = index.query(
        LookupRequest::new(
            0.0,
            0.0,
            Some(1.5),
            NonZeroUsize::new(8).expect("eight is non-zero"),
        )
        .expect("radius request should validate"),
    );
    assert_eq!(within.iter().map(|hit| hit.row).collect::<Vec<_>>(), [1, 0]);
    assert!(within[0].distance.abs() < 1e-6);
    assert_eq!(within[0].entity_id, entities[1]);
    assert_eq!(within[0].canonical, [10.0, 11.0]);
    assert_eq!(within[0].bucket, 1);
    assert!((within[1].distance - core::f32::consts::SQRT_2).abs() < 1e-6);

    // The hit budget truncates nearest-first.
    let truncated = index.query(
        LookupRequest::new(
            0.0,
            0.0,
            Some(1.5),
            NonZeroUsize::new(1).expect("one is non-zero"),
        )
        .expect("truncated request should validate"),
    );
    assert_eq!(truncated.len(), 1);
    assert_eq!(truncated[0].row, 1);
}

#[test]
fn lookup_requests_reject_invalid_coordinates_radii_and_limits() {
    let limit = NonZeroUsize::new(1).expect("one is non-zero");
    assert_eq!(
        LookupRequest::new(-1.0, 0.0, None, limit),
        Err(LookupError::Coordinate {
            axis: 0,
            value: -1.0,
        })
    );
    assert_eq!(
        LookupRequest::new(0.0, 65_536.0, None, limit),
        Err(LookupError::Coordinate {
            axis: 1,
            value: 65_536.0,
        })
    );
    assert_eq!(
        LookupRequest::new(0.0, 0.0, Some(0.0), limit),
        Err(LookupError::Radius { radius: 0.0 })
    );
    assert!(matches!(
        LookupRequest::new(0.0, 0.0, Some(f32::NAN), limit),
        Err(LookupError::Radius { radius }) if radius.is_nan()
    ));
    let over = NonZeroUsize::new(MAXIMUM_LOOKUP_HITS + 1).expect("limit is non-zero");
    assert_eq!(
        LookupRequest::new(0.0, 0.0, None, over),
        Err(LookupError::HitLimit {
            requested: MAXIMUM_LOOKUP_HITS + 1,
            maximum: MAXIMUM_LOOKUP_HITS,
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

    let root = encode_tile(
        view,
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
        TileRequest::new(0, 0, 0, NonZeroUsize::new(2).expect("two is non-zero"))
            .expect("root tile should validate"),
    )
    .expect("root tile should encode");
    assert_eq!(root.visible_subtree_count(), 3);
    assert_eq!(root.delivered_count(), 2);
    // Header, a two-bucket count table, two records, and two weights.
    assert_eq!(root.bytes().len(), 160 + 4 + 2 * 4 + 2 * 8 + 2 * 4);
    assert_eq!(&root.bytes()[160..164], &2_u32.to_le_bytes());
    assert_eq!(&root.bytes()[164..168], &1_u32.to_le_bytes());
    assert_eq!(&root.bytes()[168..172], &1_u32.to_le_bytes());
    assert_eq!(&root.bytes()[172..176], &2_u32.to_le_bytes());
    // The budget lands inside the second bucket, so its two-point range is
    // midpoint-stride sampled: the single stratum midpoint is its second
    // record, row 0 at Morton key (1, 1).
    assert_eq!(&root.bytes()[180..184], &0_u32.to_le_bytes());
    // The undelivered row 1 at (0, 0) shares its deepest Morton cell with
    // the delivered row 0 at (1, 1), so the second record represents both.
    assert_eq!(&root.bytes()[188..192], &1_u32.to_le_bytes());
    assert_eq!(&root.bytes()[192..196], &2_u32.to_le_bytes());
    let root_again = encode_tile(
        view,
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
        TileRequest::new(0, 0, 0, NonZeroUsize::new(2).expect("two is non-zero"))
            .expect("root tile should validate"),
    )
    .expect("root tile should encode deterministically");
    assert_eq!(root.bytes(), root_again.bytes());
    assert_eq!(root.content_hash(), root_again.content_hash());

    let leaf = encode_tile(
        view,
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
        TileRequest::new(16, 2, 2, NonZeroUsize::new(8).expect("eight is non-zero"))
            .expect("leaf tile should validate"),
    )
    .expect("leaf tile should encode");
    assert_eq!(leaf.visible_subtree_count(), 1);
    assert_eq!(leaf.delivered_count(), 1);
    // The single visible point comes from the first bucket.
    assert_eq!(&leaf.bytes()[160..164], &2_u32.to_le_bytes());
    assert_eq!(&leaf.bytes()[164..168], &1_u32.to_le_bytes());
    assert_eq!(&leaf.bytes()[168..172], &0_u32.to_le_bytes());
    assert_eq!(&leaf.bytes()[172..176], &2_u32.to_le_bytes());
    // A complete delivery represents exactly itself.
    assert_eq!(&leaf.bytes()[180..184], &1_u32.to_le_bytes());
}

#[test]
fn truncated_tiles_sample_fairly_and_deliver_in_progressive_order() {
    let entities = (0..8).map(entity_id).collect::<Vec<_>>();
    let identities = IdentityDirectory::new(entities).expect("identity directory should be valid");
    let coordinates = [[0.0, 0.0]; 8];
    // Row `i` carries the `i`-th smallest Morton key: seven points cluster in
    // the top-left quadrant and row 7 sits alone at the bottom-right corner.
    let mut ranked = [
        (0, MortonKey::new(0, 0)),
        (1, MortonKey::new(1, 0)),
        (2, MortonKey::new(0, 1)),
        (3, MortonKey::new(1, 1)),
        (4, MortonKey::new(2, 0)),
        (5, MortonKey::new(0, 2)),
        (6, MortonKey::new(2, 2)),
        (7, MortonKey::new(0x8000, 0x8000)),
    ]
    .map(|(row_id, morton)| RankedPoint {
        row: row(row_id),
        bucket: 0,
        morton,
        priority_rank: row_id,
    });
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
    let artifact = MappedArtifact::map_immutable(
        File::open(&path).expect("base artifact should open"),
        BASE_ARTIFACT_FORMAT,
    )
    .expect("base artifact should map");
    let view = artifact.view();
    let bucket_counts = |tile: &EncodedTile| {
        let bucket_count = u32::from_le_bytes(
            tile.bytes()[160..164]
                .try_into()
                .expect("the table length is a u32"),
        ) as usize;
        tile.bytes()[164..164 + bucket_count * 4]
            .chunks_exact(4)
            .map(|count| u32::from_le_bytes(count.try_into().expect("counts are u32")))
            .collect::<Vec<_>>()
    };
    let delivered_rows = |tile: &EncodedTile| {
        let table_bytes = 4 + bucket_counts(tile).len() * 4;
        let records_start = 160 + table_bytes;
        let records_end = records_start + tile.delivered_count() as usize * 8;
        tile.bytes()[records_start..records_end]
            .chunks_exact(8)
            .map(|record| {
                u32::from_le_bytes(record[..4].try_into().expect("records carry a u32 row"))
            })
            .collect::<Vec<_>>()
    };
    let represented_counts = |tile: &EncodedTile| {
        let table_bytes = 4 + bucket_counts(tile).len() * 4;
        let weights_start = 160 + table_bytes + tile.delivered_count() as usize * 8;
        tile.bytes()[weights_start..]
            .chunks_exact(4)
            .map(|weight| u32::from_le_bytes(weight.try_into().expect("weights are u32")))
            .collect::<Vec<_>>()
    };

    let truncated = encode_tile(
        view,
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
        TileRequest::new(0, 0, 0, NonZeroUsize::new(4).expect("four is non-zero"))
            .expect("root tile should validate"),
    )
    .expect("truncated tile should encode");
    assert_eq!(truncated.visible_subtree_count(), 8);
    assert_eq!(truncated.delivered_count(), 4);
    assert_eq!(bucket_counts(&truncated), [4]);
    // Midpoint strides pick artifact offsets 1, 3, 5, 7: a Morton-prefix cut
    // would drop the bottom-right outlier (row 7); fair sampling keeps it.
    // Progressive (bit-reversed suffix) ordering then delivers it first.
    assert_eq!(delivered_rows(&truncated), [7, 5, 1, 3]);
    // Each undelivered point rides on the delivered record sharing its
    // deepest Morton cell: row 0 joins row 1, rows 2 and 4 join row 3, and
    // row 6 joins row 5, while the outlier row 7 stands only for itself.
    // The represented counts sum to the visible subtree count of 8.
    assert_eq!(represented_counts(&truncated), [1, 2, 2, 3]);

    let complete = encode_tile(
        view,
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
        TileRequest::new(0, 0, 0, NonZeroUsize::new(8).expect("eight is non-zero"))
            .expect("root tile should validate"),
    )
    .expect("complete tile should encode");
    assert_eq!(complete.visible_subtree_count(), 8);
    assert_eq!(complete.delivered_count(), 8);
    assert_eq!(bucket_counts(&complete), [8]);
    // Every prefix of the progressive order spreads across the tile instead
    // of walking the Z-curve: the top-left origin and bottom-right outlier
    // arrive before the remaining top-left cluster fills in.
    assert_eq!(delivered_rows(&complete), [0, 7, 5, 4, 6, 2, 1, 3]);
    assert_eq!(represented_counts(&complete), [1; 8]);
}

#[test]
fn outer_boundaries_trace_components_counterclockwise() {
    // An L-triomino in a 3x3 mask: pixels (0, 0), (1, 0), and (0, 1).
    let mut mask = [false; 9];
    mask[0] = true;
    mask[3] = true;
    mask[1] = true;
    let ring = super::overlay::outer_boundary(&mask, 3);

    // The perimeter walks eight unit edges, so eight lattice corners.
    assert_eq!(ring.len(), 8);
    let mut doubled_area = 0.0;
    for (index, corner) in ring.iter().enumerate() {
        let next = ring[(index + 1) % ring.len()];
        doubled_area += corner[0] * next[1] - next[0] * corner[1];
    }
    // Counterclockwise orientation gives the L-triomino's positive area.
    assert!((doubled_area - 6.0).abs() < 1.0e-12);
    for corner in [
        [0.0, 0.0],
        [2.0, 0.0],
        [2.0, 1.0],
        [1.0, 1.0],
        [1.0, 2.0],
        [0.0, 2.0],
    ] {
        assert!(ring.contains(&corner), "boundary should turn at {corner:?}");
    }
}

#[test]
fn closed_ring_simplification_keeps_true_corners_and_drops_collinear_steps() {
    let ring = [
        [0.0, 0.0],
        [1.0, 0.0],
        [2.0, 0.0],
        [2.0, 1.0],
        [2.0, 2.0],
        [1.0, 2.0],
        [0.0, 2.0],
        [0.0, 1.0],
    ];

    assert_eq!(
        super::overlay::simplify_closed(&ring, 0.5),
        [[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]]
    );
}

#[test]
fn overlays_encode_contours_and_region_flows_deterministically() {
    use crate::salt::{
        analytic::{
            AnalyticPoint, MergeTreeConfig, RasterConfig, RegionConfig, density_raster,
            density_regions, merge_tree, publish_analytic_artifact, select_region_labels,
        },
        format::{ANALYTIC_FORMAT, SEMANTIC_GRAPH_FORMAT},
        storage::mmap::{ArtifactSection, SectionId, publish_artifact},
    };

    // Spread points so the analytic sweep produces several separated peaks.
    // Every expectation below is derived from the computed analytic objects
    // rather than from hardcoded topology. The values are dyadic because the
    // base artifact requires exactly f32-representable coordinates.
    let coordinates = [
        [0.0, 0.25],
        [0.25, 0.0],
        [0.0, -0.25],
        [1.0, 0.25],
        [0.75, 0.0],
        [1.0, -0.25],
    ];
    let points = coordinates.map(|coordinate| AnalyticPoint {
        coordinate,
        mass: 1.0,
    });
    let raster = density_raster(
        &points,
        RasterConfig {
            grid_size: 32,
            bandwidth_pixels: 1.5,
        },
    )
    .expect("fixture raster should build");
    let tree = merge_tree(&raster, MergeTreeConfig::default()).expect("fixture tree should build");
    let regions = density_regions(&raster, &tree, &coordinates, RegionConfig::default())
        .expect("fixture regions should build");
    let labels = select_region_labels(&regions, Vec::new()).expect("empty labels should select");
    assert!(!tree.leaves().is_empty());
    assert!(!regions.peaks().is_empty());

    let directory = tempdir().expect("temporary directory should exist");
    let analytic_path = Utf8PathBuf::from_path_buf(directory.path().join("analytic.salt"))
        .expect("temporary path should be UTF-8");
    publish_analytic_artifact(
        &analytic_path,
        ContentHash::digest(b"overlay-analytic-configuration"),
        &raster,
        &tree,
        &regions,
        &labels,
    )
    .expect("analytic artifact should publish");

    // A base artifact over the same points supplies the world extent that
    // the overlay frame maps the analytic bounds onto.
    let entities = (0..coordinates.len() as u32)
        .map(entity_id)
        .collect::<Vec<_>>();
    let identities = IdentityDirectory::new(entities).expect("identity directory should be valid");
    let quantize = |value: f64, minimum: f64, maximum: f64| {
        let normalized = (value - minimum) / (maximum - minimum);
        (normalized * 65_536.0).floor().clamp(0.0, 65_535.0) as u16
    };
    let mut ranked = coordinates
        .iter()
        .enumerate()
        .map(|(index, &[x, y])| RankedPoint {
            row: row(index as u32),
            bucket: 0,
            morton: MortonKey::new(quantize(x, 0.0, 1.0), quantize(y, -0.25, 0.25)),
            priority_rank: index as u32,
        })
        .collect::<Vec<_>>();
    let base_path = Utf8PathBuf::from_path_buf(directory.path().join("base.salt"))
        .expect("temporary path should be UTF-8");
    publish_base_artifact(
        &base_path,
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

    // A semantic graph whose second neighbor always crosses to the other
    // cluster, so region flows are guaranteed whenever regions separate.
    let rows = coordinates.len();
    let neighbors = 2_usize;
    let mut indices = Vec::with_capacity(rows * neighbors);
    let mut weights = Vec::with_capacity(rows * neighbors);
    for source in 0..rows {
        indices.push(((source + 1) % rows) as u32);
        weights.push(if source == 0 { 1.0_f32 } else { 0.5 });
        indices.push(((source + 3) % rows) as u32);
        weights.push(0.25);
    }
    let distances = vec![0.5_f32; rows * neighbors];
    let graph_path = Utf8PathBuf::from_path_buf(directory.path().join("semantic.salt"))
        .expect("temporary path should be UTF-8");
    publish_artifact(
        &graph_path,
        SEMANTIC_GRAPH_FORMAT,
        &[
            ArtifactSection::new(SectionId::new(1), &[rows, neighbors], &indices)
                .expect("indices section should build"),
            ArtifactSection::new(SectionId::new(2), &[rows, neighbors], &distances)
                .expect("distances section should build"),
            ArtifactSection::new(SectionId::new(3), &[rows, neighbors], &weights)
                .expect("weights section should build"),
            ArtifactSection::new(
                SectionId::new(4),
                &[32],
                ContentHash::digest(b"backend").as_bytes(),
            )
            .expect("backend hash section should build"),
            ArtifactSection::new(
                SectionId::new(5),
                &[32],
                ContentHash::digest(b"config").as_bytes(),
            )
            .expect("configuration hash section should build"),
            ArtifactSection::new(
                SectionId::new(6),
                &[32],
                ContentHash::digest(b"weights").as_bytes(),
            )
            .expect("weight hash section should build"),
        ],
    )
    .expect("semantic graph artifact should publish");

    let analytic = MappedArtifact::map_immutable(
        File::open(&analytic_path).expect("analytic artifact should open"),
        ANALYTIC_FORMAT,
    )
    .expect("analytic artifact should map");
    let base = MappedArtifact::map_immutable(
        File::open(&base_path).expect("base artifact should open"),
        BASE_ARTIFACT_FORMAT,
    )
    .expect("base artifact should map");
    let semantic = MappedArtifact::map_immutable(
        File::open(&graph_path).expect("semantic graph artifact should open"),
        SEMANTIC_GRAPH_FORMAT,
    )
    .expect("semantic graph artifact should map");

    let contours = encode_contours(
        analytic.view(),
        base.view(),
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
    )
    .expect("contours should encode");
    let bytes = contours.bytes();
    assert_eq!(&bytes[..8], b"ATLCONT1");
    assert_eq!(u16::from_le_bytes([bytes[8], bytes[9]]), 1);
    assert_eq!(u16::from_le_bytes([bytes[10], bytes[11]]), 160);
    let contour_count = u32::from_le_bytes(bytes[16..20].try_into().expect("count is u32"));
    let vertex_total = u32::from_le_bytes(bytes[20..24].try_into().expect("count is u32"));
    assert_eq!(
        u32::from_le_bytes(bytes[24..28].try_into().expect("count is u32")),
        32
    );
    assert_eq!(contour_count as usize, tree.leaves().len());
    let mut vertex_sum = 0_u32;
    for (index, leaf) in tree.leaves().iter().enumerate() {
        let record = 160 + index * 20;
        assert_eq!(
            u32::from_le_bytes(bytes[record..record + 4].try_into().expect("leaf is u32")),
            u32::try_from(leaf.id).expect("leaf id fits u32"),
        );
        assert_eq!(
            u32::from_le_bytes(
                bytes[record + 4..record + 8]
                    .try_into()
                    .expect("parent is u32")
            ),
            leaf.parent.map_or(u32::MAX, |parent| u32::try_from(parent)
                .expect("parent fits u32")),
        );
        let vertex_count = u32::from_le_bytes(
            bytes[record + 8..record + 12]
                .try_into()
                .expect("count is u32"),
        );
        assert!(vertex_count >= 3, "leaf {index} needs a real polygon");
        vertex_sum += vertex_count;
        assert_eq!(
            f32::from_le_bytes(
                bytes[record + 12..record + 16]
                    .try_into()
                    .expect("birth is f32")
            ),
            leaf.birth as f32,
        );
        assert_eq!(
            f32::from_le_bytes(
                bytes[record + 16..record + 20]
                    .try_into()
                    .expect("death is f32")
            ),
            leaf.death as f32,
        );
    }
    assert_eq!(vertex_sum, vertex_total);
    let vertices_offset = 160 + tree.leaves().len() * 20;
    assert_eq!(bytes.len(), vertices_offset + vertex_total as usize * 4);

    let contours_again = encode_contours(
        analytic.view(),
        base.view(),
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
    )
    .expect("contours should encode deterministically");
    assert_eq!(contours.bytes(), contours_again.bytes());
    assert_eq!(contours.content_hash(), contours_again.content_hash());

    let flows = encode_flows(
        analytic.view(),
        semantic.view(),
        base.view(),
        ActiveRelease::for_test(),
        ContentHash::digest(b"fixture-store-snapshot"),
        VariantId::CANONICAL,
    )
    .expect("flows should encode");
    let bytes = flows.bytes();
    assert_eq!(&bytes[..8], b"ATLFLOW1");
    let region_count = u32::from_le_bytes(bytes[16..20].try_into().expect("count is u32"));
    let flow_count = u32::from_le_bytes(bytes[20..24].try_into().expect("count is u32"));
    assert_eq!(region_count as usize, regions.peaks().len());
    for (index, peak) in regions.peaks().iter().enumerate() {
        let record = 160 + index * 12;
        assert_eq!(
            u32::from_le_bytes(
                bytes[record + 4..record + 8]
                    .try_into()
                    .expect("parent is u32")
            ),
            peak.parent_region.unwrap_or(u32::MAX),
        );
        assert_eq!(
            f32::from_le_bytes(
                bytes[record + 8..record + 12]
                    .try_into()
                    .expect("persistence is f32")
            ),
            peak.persistence as f32,
        );
    }

    // The flow table must equal the aggregation of every directed semantic
    // edge between two distinct assigned regions.
    let point_regions = regions.point_regions();
    let mut expected = std::collections::BTreeMap::<(u32, u32), (f64, u32)>::new();
    for (source, &source_region) in point_regions.iter().enumerate() {
        for slot in 0..neighbors {
            let edge = source * neighbors + slot;
            let target_region = point_regions[indices[edge] as usize];
            if source_region == u32::MAX
                || target_region == u32::MAX
                || source_region == target_region
            {
                continue;
            }
            let pair = (
                source_region.min(target_region),
                source_region.max(target_region),
            );
            let flow = expected.entry(pair).or_insert((0.0, 0));
            flow.0 += f64::from(weights[edge]);
            flow.1 += 1;
        }
    }
    assert!(
        !expected.is_empty(),
        "the fixture should produce cross-region flows"
    );
    assert_eq!(flow_count as usize, expected.len());
    let flows_offset = 160 + regions.peaks().len() * 12;
    for (index, (&(source, target), &(weight, edge_count))) in expected.iter().enumerate() {
        let record = flows_offset + index * 16;
        assert_eq!(
            u32::from_le_bytes(bytes[record..record + 4].try_into().expect("source is u32")),
            source,
        );
        assert_eq!(
            u32::from_le_bytes(
                bytes[record + 4..record + 8]
                    .try_into()
                    .expect("target is u32")
            ),
            target,
        );
        assert_eq!(
            f32::from_le_bytes(
                bytes[record + 8..record + 12]
                    .try_into()
                    .expect("weight is f32")
            ),
            weight as f32,
        );
        assert_eq!(
            u32::from_le_bytes(
                bytes[record + 12..record + 16]
                    .try_into()
                    .expect("edge count is u32")
            ),
            edge_count,
        );
    }
    assert_eq!(bytes.len(), flows_offset + expected.len() * 16);
}

#[test]
fn tile_requests_reject_invalid_zoom_quadrants_and_budgets() {
    assert!(TileRequest::new(17, 0, 0, NonZeroUsize::new(1).expect("one is non-zero")).is_err());
    assert!(TileRequest::new(4, 16, 0, NonZeroUsize::new(1).expect("one is non-zero")).is_err());
    assert!(
        TileRequest::new(
            0,
            0,
            0,
            NonZeroUsize::new(MAXIMUM_TILE_POINTS + 1).expect("maximum plus one is non-zero")
        )
        .is_err()
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
