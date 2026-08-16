use hashql_core::id::{Id as _, IdSlice, IdVec};
use proptest::{arbitrary::any, prop_assert, prop_assert_eq, property_test};
use smallvec::{SmallVec, smallvec};
use uuid::Uuid;

use super::{
    cascade::{self, CoverageGap},
    key,
    order::BaseOrder,
    quad::{QuadError, QuadTree},
    rank::{RankInputs, Ranking},
    stage::{Lod, LodConfig, LodError},
};
use crate::{
    file::quad::Node,
    identity::{BasePosition, ImportanceRank, NodeRowId, OntologyRowId},
    math::{Bounds2, Log2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    postgres::id::ArchivedEntityId,
};

fn identity(index: u128) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_u128(index).into(),
        entity_uuid: Uuid::from_u128(index.wrapping_mul(31)).into(),
    }
}

fn identities(count: u128) -> Vec<ArchivedEntityId> {
    (0..count).map(identity).collect()
}

/// Typed rank columns over raw fixture slices.
fn rank_inputs<'columns>(
    importance: &'columns [f32],
    priority: &'columns [f32],
    ids: &'columns [ArchivedEntityId],
) -> Option<RankInputs<'columns, ArchivedEntityId>> {
    RankInputs::new(
        IdSlice::from_raw(importance),
        IdSlice::from_raw(priority),
        IdSlice::from_raw(ids),
    )
}

/// A ranking straight from a hand-written rank order.
fn ranking_of(row_of_rank: &[u32]) -> Ranking<NodeRowId> {
    let row_of_rank: Vec<NodeRowId> = row_of_rank
        .iter()
        .copied()
        .map(NodeRowId::from_u32)
        .collect();

    let mut rank_of_row =
        IdVec::<NodeRowId, ImportanceRank>::from_elem(ImportanceRank::MIN, row_of_rank.len());
    for (rank, &row) in row_of_rank.iter().enumerate() {
        rank_of_row[row] = ImportanceRank::from_usize(rank);
    }

    Ranking {
        row_of_rank: IdSlice::from_boxed_slice(row_of_rank.into_boxed_slice()),
        rank_of_row: rank_of_row.into_boxed_slice(),
    }
}

fn depth(value: u8) -> Depth {
    Depth::new(value).expect("test depths lie within the documented domain")
}

fn log2(value: u8) -> Log2 {
    Log2::new(value).expect("test spans lie below the shift width")
}

#[test]
fn rank_orders_by_importance_then_priority_then_tiebreak() {
    // Rows: importance dominates, priority splits the first tie, the
    // seeded hash splits the rest.
    let importance = [2.0_f32, 2.0, 2.0, 1.0];
    let priority = [9.0_f32, 9.0, 5.0, 9.0];
    let ids = identities(4);

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the columns agree");
    let ranking = Ranking::new(inputs, 7);

    // Row 3 has the lowest importance, row 2 the lower priority within the top importance. Rows 0
    // and 1 tie down to the seeded hash.
    assert_eq!(ranking.rank_of_row[NodeRowId::from_u32(3)].as_u32(), 3);
    assert_eq!(ranking.rank_of_row[NodeRowId::from_u32(2)].as_u32(), 2);
    let mut top = [
        ranking.rank_of_row[NodeRowId::from_u32(0)].as_u32(),
        ranking.rank_of_row[NodeRowId::from_u32(1)].as_u32(),
    ];
    top.sort_unstable();
    assert_eq!(top, [0, 1]);

    // The permutations invert each other.
    for (rank, &row) in ranking.row_of_rank.iter().enumerate() {
        assert_eq!(ranking.rank_of_row[row].as_usize(), rank);
    }

    // Equal inputs and seed reproduce the ranking bit for bit.
    assert_eq!(Ranking::new(inputs, 7), ranking);
}

#[test]
fn seed_reshuffles_ties() {
    // All scores tie, so the order is the seeded hash's alone.
    let importance = [1.0_f32; 8];
    let priority = [1.0_f32; 8];
    let ids = identities(8);

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the columns agree");
    let one = Ranking::new(inputs, 1);
    let two = Ranking::new(inputs, 2);

    assert_ne!(
        one.row_of_rank, two.row_of_rank,
        "eight all-tied rows under two seeds should not shuffle identically",
    );
}

#[test]
fn rank_inputs_reject_disagreeing_columns() {
    let ids = identities(2);

    assert!(rank_inputs(&[1.0, 2.0], &[1.0, 2.0], &ids).is_some());
    assert!(rank_inputs(&[1.0], &[1.0, 2.0], &ids).is_none());
    assert!(rank_inputs(&[1.0, 2.0], &[1.0], &ids).is_none());
    assert!(rank_inputs(&[1.0, 2.0], &[1.0, 2.0], &ids[..1]).is_none());
}

#[test]
fn non_finite_scores_rank_deterministically() {
    // The dataset contract keeps scores finite. `totalOrder` keeps the pass total and reproducible
    // even when a dataset breaks that contract.
    let importance = [f32::NAN, 1.0, f32::NAN, f32::INFINITY];
    let priority = [0.0_f32; 4];
    let ids = identities(4);

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the columns agree");
    assert_eq!(Ranking::new(inputs, 3), Ranking::new(inputs, 3));
}

#[test]
fn keys_quantize_the_frame_corners_center_and_degenerate_axis() {
    let frame = Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0)).expect("a real frame");
    let points = [
        Vec2::new(-1.0, -1.0),
        Vec2::new(1.0, 1.0),
        Vec2::new(0.0, 0.0),
    ];

    let keys = key::keys(&points, frame);
    assert_eq!(keys.len(), 3, "one key per point");
    assert_eq!(keys[0].coordinates(), [0, 0]);
    assert_eq!(keys[1].coordinates(), [u32::MAX, u32::MAX]);
    assert_eq!(keys[2].coordinates(), [1 << 31, 1 << 31]);

    // A zero-extent axis maps every point to cell zero on that axis.
    let flat = Bounds2::new(Vec2::new(-1.0, 3.0), Vec2::new(1.0, 3.0)).expect("a flat frame");
    let keys = key::keys(&[Vec2::new(0.0, 3.0)], flat);
    assert_eq!(keys[0].coordinates(), [1 << 31, 0]);
}

/// Keys whose depth-1 and depth-2 cells are hand-picked.
///
/// Axis values place their top two bits at (depth-1 quadrant, depth-2 sub-cell).
fn hand_keys() -> [MortonKey; 4] {
    [
        // a: quadrant (0, 0), depth-2 cell (00, 00).
        MortonKey::new(0, 0),
        // b: quadrant (1, 0).
        MortonKey::new(0x8000_0000, 0),
        // c: quadrant (0, 0), depth-2 cell (00, 00) - co-resident with
        // `a` at every tested depth without sharing its key.
        MortonKey::new(1, 1),
        // d: quadrant (0, 0), depth-2 cell (01, 00).
        MortonKey::new(0x4000_0000, 0),
    ]
}

#[test]
fn cascade_assigns_the_hand_computed_buckets() {
    let keys = hand_keys();
    let keys = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let ranking = ranking_of(&[0, 1, 2, 3]);

    let buckets = cascade::buckets(keys, &ranking, depth(2));

    // a claims the whole domain; b its depth-1 quadrant; d its depth-2
    // cell; c is co-resident with a down to the deepest grid and takes
    // the catch-all.
    assert_eq!(*buckets.as_raw(), [depth(0), depth(1), depth(2), depth(2)]);
    assert_eq!(cascade::verify_coverage(keys, &buckets, depth(2)), Ok(()));
}

#[test]
fn cascade_follows_the_rank_order() {
    let keys = hand_keys();
    let keys = IdSlice::<NodeRowId, _>::from_raw(&keys);

    // c outranks a: the claims flip and a becomes the co-resident
    // catch-all point.
    let ranking = ranking_of(&[2, 1, 0, 3]);
    let buckets = cascade::buckets(keys, &ranking, depth(2));

    assert_eq!(*buckets.as_raw(), [depth(2), depth(1), depth(0), depth(2)]);
    assert_eq!(cascade::verify_coverage(keys, &buckets, depth(2)), Ok(()));
}

#[test]
fn coverage_verification_reports_a_gap() {
    let keys = hand_keys();
    let keys = IdSlice::<NodeRowId, _>::from_raw(&keys);

    // Hand-break the assignment: nothing claims the whole domain at
    // depth 0.
    let buckets = [depth(1), depth(1), depth(2), depth(2)];
    let buckets = IdSlice::<NodeRowId, _>::from_raw(&buckets);
    assert_eq!(
        cascade::verify_coverage(keys, buckets, depth(2)),
        Err(CoverageGap {
            depth: depth(0),
            cell: 0,
        }),
    );
}

#[test]
fn base_order_sorts_buckets_then_keys_then_ranks() {
    let keys = hand_keys();
    let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let ranking = ranking_of(&[0, 1, 2, 3]);
    let buckets = cascade::buckets(keyed, &ranking, depth(2));

    let order = BaseOrder::new(keyed, &buckets, &ranking);

    // The hand-computed order is a (bucket 0), b (bucket 1), then the bucket-2 pair by key. c's key
    // (1, 1) interleaves below d's (0x4000_0000, 0).
    assert_eq!(
        *order.row_of_position.as_raw(),
        [0, 1, 2, 3].map(NodeRowId::from_u32),
    );
    assert_eq!(
        *order.position_of_row.as_raw(),
        [0, 1, 2, 3].map(BasePosition::from_u32),
    );

    // Reversing the two catch-all rows' keys is invisible to the sort
    // only if rank breaks the tie: give them one key and check rank
    // order decides.
    let tied = [keys[0], keys[1], keys[2], keys[2]];
    let tied = IdSlice::<NodeRowId, _>::from_raw(&tied);
    let ranking = ranking_of(&[0, 1, 3, 2]);
    let buckets = cascade::buckets(tied, &ranking, depth(2));
    let order = BaseOrder::new(tied, &buckets, &ranking);

    let (first, second) = (
        order.position_of_row[NodeRowId::from_u32(3)],
        order.position_of_row[NodeRowId::from_u32(2)],
    );
    assert!(
        first < second,
        "the better-ranked row of a key tie precedes: {first} vs {second}",
    );
}

#[test]
fn separation_assigns_the_hand_computed_natural_buckets() {
    // hand_keys() in ascending (key, rank) order: a, c, d, b with ranks 0, 2, 3, 1.
    let keys = hand_keys();
    let points = [
        (keys[0], ImportanceRank::from_u32(0)),
        (keys[2], ImportanceRank::from_u32(2)),
        (keys[3], ImportanceRank::from_u32(3)),
        (keys[1], ImportanceRank::from_u32(1)),
    ];

    let buckets = cascade::separation_buckets(&points, |point| point.0, |point| point.1);

    // a claims the whole domain. c shares a's cells through depth 31, so it first claims at 32.
    // d shares depth 1 with a and c and claims depth 2. b parts from everything at the first
    // subdivision and claims depth 1.
    assert_eq!(*buckets, [depth(0), depth(32), depth(2), depth(1)]);

    // Equal keys share every grid: the worse-ranked co-resident takes the catch-all.
    let tied = [
        (keys[0], ImportanceRank::from_u32(0)),
        (keys[0], ImportanceRank::from_u32(2)),
        (keys[1], ImportanceRank::from_u32(1)),
    ];
    let buckets = cascade::separation_buckets(&tied, |point| point.0, |point| point.1);
    assert_eq!(*buckets, [depth(0), depth(32), depth(1)]);
}

/// The neighbour-separation closed form is the cascade at the full key width.
#[property_test]
fn separation_is_the_cascade_at_the_key_width(
    #[strategy = proptest::collection::vec(any::<u64>(), 1..48)] bits: Vec<u64>,
    seed: u64,
) {
    let keys: Vec<_> = bits.iter().copied().map(MortonKey::from_bits).collect();
    let ranking = seeded_ranking(keys.len(), seed);

    let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let expected = cascade::buckets(keyed, &ranking, Depth::MAX);

    let mut points: Vec<_> = keyed
        .iter_enumerated()
        .map(|(row, &key)| (key, ranking.rank_of_row[row], row))
        .collect();
    points.sort_unstable_by_key(|&(key, rank, _)| (key, rank));

    let buckets = cascade::separation_buckets(&points, |point| point.0, |point| point.1);
    for (&(_, _, row), &bucket) in points.iter().zip(&buckets) {
        prop_assert_eq!(bucket, expected[row]);
    }
}

/// Coverage holds for every input.
///
/// Each occupied cell at each depth of the schedule keeps a representative in the delivered prefix.
#[property_test]
fn cascade_coverage_is_total(
    #[strategy = proptest::collection::vec(any::<u64>(), 1..48)] bits: Vec<u64>,
    #[strategy = 0_u8..=6] deepest: u8,
    seed: u64,
) {
    let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
    let ranking = seeded_ranking(keys.len(), seed);
    let deepest = depth(deepest);

    let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let buckets = cascade::buckets(keyed, &ranking, deepest);

    prop_assert_eq!(cascade::verify_coverage(keyed, &buckets, deepest), Ok(()));
}

/// Below the catch-all, a bucket holds at most one point per cell of its own grid.
#[property_test]
fn buckets_claim_cells_once(
    #[strategy = proptest::collection::vec(any::<u64>(), 1..48)] bits: Vec<u64>,
    #[strategy = 0_u8..=6] deepest: u8,
    seed: u64,
) {
    let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
    let ranking = seeded_ranking(keys.len(), seed);
    let deepest = depth(deepest);

    let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let buckets = cascade::buckets(keyed, &ranking, deepest);

    for probe in 0..deepest.get() {
        let probe = depth(probe);
        let mut cells: Vec<u64> = keys
            .iter()
            .zip(buckets.as_raw())
            .filter(|&(_, bucket)| *bucket == probe)
            .map(|(key, _)| key.prefix(probe))
            .collect();
        cells.sort_unstable();
        let distinct = cells.len();
        cells.dedup();

        prop_assert_eq!(
            cells.len(),
            distinct,
            "two bucket-{} points share a cell",
            probe.get(),
        );
    }
}

/// The base order is the unique (bucket, key, rank) sort.
///
/// Its permutations invert each other.
#[property_test]
fn base_order_is_the_unique_total_sort(
    #[strategy = proptest::collection::vec(any::<u64>(), 1..48)] bits: Vec<u64>,
    #[strategy = 0_u8..=6] deepest: u8,
    seed: u64,
) {
    let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
    let ranking = seeded_ranking(keys.len(), seed);
    let deepest = depth(deepest);

    let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
    let buckets = cascade::buckets(keyed, &ranking, deepest);
    let order = BaseOrder::new(keyed, &buckets, &ranking);

    for (rank, &row) in order.row_of_position.iter().enumerate() {
        prop_assert_eq!(order.position_of_row[row].as_usize(), rank);
    }

    let sort_key = |row: NodeRowId| (buckets[row], keyed[row], ranking.rank_of_row[row]);
    for (previous, next) in order
        .row_of_position
        .iter()
        .zip(&order.row_of_position[BasePosition::from_u32(1)..])
    {
        let (left, right) = (sort_key(*previous), sort_key(*next));
        prop_assert!(
            left < right,
            "adjacent positions out of order: {left:?} vs {right:?}"
        );
    }
}

/// A deterministic ranking for property tests.
///
/// Rows ranked by the seeded tiebreak alone, through the real rank pass.
fn seeded_ranking(rows: usize, seed: u64) -> Ranking<NodeRowId> {
    let importance = vec![0.0_f32; rows];
    let priority = vec![0.0_f32; rows];
    let ids = identities(rows as u128);

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the fixture columns agree");
    Ranking::new(inputs, seed)
}

#[test]
fn lod_config_carries_the_key_width_bound() {
    // The default schedule reaches the f32 resolution depth.
    let config = LodConfig::default();
    assert_eq!(config.span.get(), 6);
    assert_eq!(config.max_tile_depth, 18);
    assert_eq!(config.deepest(), Some(depth(24)));

    // The inequality z_max + m ≤ 32 binds exactly at the key width.
    let at_width = LodConfig {
        span: log2(6),
        max_tile_depth: 26,
    };
    assert_eq!(at_width.deepest(), Some(depth(32)));

    let beyond = LodConfig {
        span: log2(6),
        max_tile_depth: 27,
    };
    assert_eq!(beyond.deepest(), None);

    let build = Lod::build(
        &[Vec2::new(0.0, 0.0)],
        rank_inputs(&[0.0], &[0.0], &identities(1)).expect("the columns agree"),
        0,
        beyond,
    );
    assert_eq!(
        build.expect_err("a schedule beyond the key width must not build"),
        LodError::Schedule { config: beyond },
    );
}

/// The hand stage fixture.
///
/// The comments below compute the wire positions and cascade buckets of its four points.
///
/// World frame [0, 1] x [0, 1]; `span` = 1, `max_tile_depth` = 1, so the deepest grid is 2 and the
/// catch-all is bucket 2.
///
/// ```text
/// row  world         wire           depth-1 quadrant  depth-2 cell
/// 0    (0,    0)     (-1,    -1)    (0, 0)            (0, 0)
/// 1    (1,    1)     ( 1,     1)    (1, 1)            (3, 3)
/// 2    (0.25, 0.25)  (-0.5,  -0.5)  (0, 0)            (1, 1)
/// 3    (0.375, 0.25) (-0.25, -0.5)  (0, 0)            (1, 1)
/// ```
///
/// Importance ranks the rows in index order. In the cascade, row 0 claims the domain, row 1 its
/// depth-1 quadrant, row 2 the (1, 1) depth-2 cell, and row 3 - co-resident with row 2 at the
/// deepest grid - takes the catch-all. Buckets [0, 1, 2, 2]; the base order is the row order (row
/// 2's key sorts below row 3's).
fn hand_stage() -> (Lod, LodConfig) {
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 1.0),
        Vec2::new(0.25, 0.25),
        Vec2::new(0.375, 0.25),
    ];
    let importance = [4.0_f32, 3.0, 2.0, 1.0];
    let priority = [0.0_f32; 4];
    let ids = identities(4);
    let config = LodConfig {
        span: log2(1),
        max_tile_depth: 1,
    };

    let lod = Lod::build(
        &coordinates,
        rank_inputs(&importance, &priority, &ids).expect("the columns agree"),
        7,
        config,
    )
    .expect("the fixture builds");

    (lod, config)
}

#[test]
fn build_produces_the_hand_computed_columns() {
    let (lod, _) = hand_stage();

    assert_eq!(
        lod.world,
        Bounds2::new(Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)).expect("a real frame"),
    );

    // Wire coordinates in base order, exact: the normalization is a
    // single f64 rounding per component and every fixture value is a
    // dyadic rational.
    assert_eq!(
        *lod.coordinates.as_raw(),
        [
            Vec2::new(-1.0, -1.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(-0.5, -0.5),
            Vec2::new(-0.25, -0.5),
        ],
    );

    // Codes quantize the wire column: the base order is the row order
    // here, and the two catch-all codes sort within their segment.
    assert_eq!(
        *lod.codes.as_raw(),
        [
            MortonKey::new(0, 0),
            MortonKey::new(u32::MAX, u32::MAX),
            MortonKey::new(0x4000_0000, 0x4000_0000),
            MortonKey::new(0x6000_0000, 0x4000_0000),
        ],
    );

    // Buckets [0, 1, 2, 2] as fenceposts.
    assert_eq!(lod.fenceposts.count(), 4);
    assert_eq!(
        lod.fenceposts.segment(depth(0)),
        BasePosition::from_u32(0)..BasePosition::from_u32(1),
    );
    assert_eq!(
        lod.fenceposts.segment(depth(1)),
        BasePosition::from_u32(1)..BasePosition::from_u32(2),
    );
    assert_eq!(
        lod.fenceposts.segment(depth(2)),
        BasePosition::from_u32(2)..BasePosition::from_u32(4),
    );

    // The identity base order makes every permutation the identity.
    assert_eq!(
        *lod.rank_of_position.as_raw(),
        [0, 1, 2, 3].map(ImportanceRank::from_u32),
    );
    assert_eq!(
        *lod.position_of_rank.as_raw(),
        [0, 1, 2, 3].map(BasePosition::from_u32),
    );
    assert_eq!(
        *lod.position_of_row.as_raw(),
        [0, 1, 2, 3].map(BasePosition::from_u32),
    );
    assert_eq!(
        *lod.row_of_position.as_raw(),
        [0, 1, 2, 3].map(NodeRowId::from_u32),
    );
}

#[test]
fn evidence_measures_the_hand_computed_columns() {
    let (lod, config) = hand_stage();
    let evidence = lod.measurements(config);

    assert_eq!(evidence.world, lod.world);
    assert_eq!(&evidence.bucket_histogram[..3], &[1, 1, 2]);
    assert!(
        evidence.bucket_histogram[3..]
            .iter()
            .all(|&count| count == 0)
    );

    // Rows 2 and 3 share their deepest-grid cell. The catch-all therefore holds two points in one
    // distinct cell, with one point of co-location excess.
    assert_eq!(evidence.catch_all_population, 2);
    assert_eq!(evidence.co_location_excess, 1);

    // The catch-all pair shares its zoom-1 tile (bucket 2 at
    // span = 1), the largest delta of the schedule.
    assert_eq!(evidence.max_tile_delta, 2);
}

#[test]
fn normalization_is_exact_far_from_the_origin() {
    // A frame whose offset dwarfs its extent: the two-step f64 map is
    // exact for these dyadic inputs where a composed scale-translate
    // transform in f32 would cancel catastrophically.
    let coordinates = [
        Vec2::new(1_000_000.0, -1_000_000.0),
        Vec2::new(1_000_002.0, -999_998.0),
        Vec2::new(1_000_001.0, -999_999.5),
    ];
    let importance = [3.0_f32, 2.0, 1.0];
    let priority = [0.0_f32; 3];
    let ids = identities(3);

    let lod = Lod::build(
        &coordinates,
        rank_inputs(&importance, &priority, &ids).expect("the columns agree"),
        0,
        LodConfig::default(),
    )
    .expect("the fixture builds");

    // Base order: row 0 claims the domain; rows 1 and 2 claim their
    // depth-1 quadrants, and within bucket 1 row 2's key sorts below
    // row 1's.
    assert_eq!(
        *lod.coordinates.as_raw(),
        [
            Vec2::new(-1.0, -1.0),
            Vec2::new(0.0, -0.5),
            Vec2::new(1.0, 1.0),
        ],
    );
}

#[test]
fn degenerate_axis_maps_to_the_wire_centre() {
    // All points share one x: the flat axis maps to 0, the other
    // normalizes as usual.
    let coordinates = [Vec2::new(5.0, 0.0), Vec2::new(5.0, 2.0)];
    let importance = [2.0_f32, 1.0];
    let priority = [0.0_f32; 2];
    let ids = identities(2);

    let lod = Lod::build(
        &coordinates,
        rank_inputs(&importance, &priority, &ids).expect("the columns agree"),
        0,
        LodConfig::default(),
    )
    .expect("the fixture builds");

    assert_eq!(
        *lod.coordinates.as_raw(),
        [Vec2::new(0.0, -1.0), Vec2::new(0.0, 1.0)],
    );
}

#[test]
fn build_rejects_what_no_columns_cover() {
    let ids = identities(2);
    let inputs = rank_inputs(&[1.0, 2.0], &[0.0, 0.0], &ids).expect("the columns agree");

    // One coordinate against two rank rows.
    assert_eq!(
        Lod::build(&[Vec2::new(0.0, 0.0)], inputs, 0, LodConfig::default())
            .expect_err("disagreeing columns must not build"),
        LodError::Columns { coordinates: 1 },
    );

    // No rows admit no frame.
    let empty = rank_inputs(&[], &[], &[]).expect("empty columns agree");
    assert_eq!(
        Lod::build(&[], empty, 0, LodConfig::default())
            .expect_err("an empty column must not build"),
        LodError::Frame,
    );

    // A non-finite coordinate admits no frame.
    assert_eq!(
        Lod::build(
            &[Vec2::new(f32::NAN, 0.0), Vec2::new(1.0, 1.0)],
            inputs,
            0,
            LodConfig::default(),
        )
        .expect_err("a non-finite coordinate must not build"),
        LodError::Frame,
    );
}

#[test]
fn columns_round_trip_through_the_morton_file() {
    use crate::file::morton::{read::MortonFile, write};

    let (lod, _) = hand_stage();

    let mut bytes = Vec::new();
    write::write_regions(2, &lod.fenceposts, lod.codes.as_raw(), &mut bytes)
        .expect("writing into a vector cannot fail");

    let dir =
        std::env::temp_dir().join(format!("hash-graph-atlas-lod-stage-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");
    let path = dir.join("stage-roundtrip.mrtn");
    std::fs::write(&path, bytes).expect("the scratch file is writable");

    let file = MortonFile::open(&path).expect("the written file reopens");
    assert_eq!(file.fenceposts(), &lod.fenceposts);

    // The serving query on the built columns: the catch-all pair is
    // one run inside its quadrant.
    let cell = lod.codes[BasePosition::from_u32(2)].cell(depth(1));
    assert_eq!(
        file.run(depth(2), cell),
        BasePosition::from_u32(2)..BasePosition::from_u32(4),
    );
}

/// Every finite point set builds.
///
/// The result upholds the serving contract's structural laws.
#[property_test]
fn built_columns_uphold_the_contract_laws(
    #[strategy = proptest::collection::vec(
        (-1.0e6_f32..1.0e6, -1.0e6_f32..1.0e6, 0.0_f32..8.0),
        1..48,
    )]
    rows: Vec<(f32, f32, f32)>,
    seed: u64,
    #[strategy = 0_u8..3] span_log2: u8,
    #[strategy = 0_u8..4] max_tile_depth: u8,
) {
    let coordinates: Vec<Vec2> = rows.iter().map(|&(x, y, _)| Vec2::new(x, y)).collect();
    let importance: Vec<f32> = rows.iter().map(|&(_, _, i)| i).collect();
    let priority = vec![0.0_f32; rows.len()];
    let ids = identities(rows.len() as u128);
    let config = LodConfig {
        span: log2(span_log2),
        max_tile_depth,
    };

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the fixture columns agree");
    let lod =
        Lod::build(&coordinates, inputs, seed, config).expect("finite non-empty coordinates build");
    let deepest = config.deepest().expect("the schedule fits the key width");

    // Determinism: equal inputs give equal structures.
    prop_assert_eq!(
        &Lod::build(&coordinates, inputs, seed, config).expect("the rebuild builds"),
        &lod,
    );

    // Every column covers every row once.
    prop_assert_eq!(lod.fenceposts.count(), rows.len() as u64);
    prop_assert_eq!(lod.coordinates.len(), rows.len());

    // Wire coordinates stay inside the frame.
    for wire in lod.coordinates.iter() {
        prop_assert!((-1.0..=1.0).contains(&wire.x()));
        prop_assert!((-1.0..=1.0).contains(&wire.y()));
    }

    // The permutations invert each other, both ways.
    for (position, &row) in lod.row_of_position.iter().enumerate() {
        prop_assert_eq!(lod.position_of_row[row].as_usize(), position);
    }
    for (rank, &position) in lod.position_of_rank.iter().enumerate() {
        prop_assert_eq!(lod.rank_of_position[position].as_usize(), rank);
    }

    // Every segment of the code column sorts, which the morton file writer's input contract
    // requires.
    for bucket in 0..=deepest.get() {
        let segment = lod.fenceposts.segment(depth(bucket));
        prop_assert!(lod.codes[segment].is_sorted());
    }

    // The delivered prefix covers every occupied cell at every
    // published depth - the coverage contract, asserted over the
    // built columns, buckets reconstructed from the fenceposts.
    let buckets: Vec<Depth> = (BasePosition::MIN..lod.fenceposts.bound())
        .map(|position| {
            (0..=deepest.get())
                .map(depth)
                .find(|&bucket| lod.fenceposts.segment(bucket).contains(&position))
                .expect("every position falls in a segment")
        })
        .collect();
    prop_assert_eq!(
        cascade::verify_coverage(
            &lod.codes,
            IdSlice::<BasePosition, _>::from_raw(&buckets),
            deepest
        ),
        Ok(()),
    );

    // At most one delivered point per depth-d cell at every cut
    // d below the deepest grid, jointly across buckets - the
    // uniqueness claim the mass channel leans on. The
    // cascade's represented rule guarantees it. A claim never
    // lands in a cell holding an earlier-assigned point, so two
    // points sharing a depth-d cell cannot both carry buckets at
    // or below d unless the later one is a catch-all leftover
    // (bucket = deepest, never delivered below the deepest cut).
    for cut in 0..deepest.get() {
        let cut = depth(cut);
        let mut occupied = std::collections::HashSet::new();
        for (position, code) in lod.codes.iter().enumerate() {
            if buckets[position] <= cut {
                prop_assert!(
                    occupied.insert(code.prefix(cut)),
                    "two points delivered at cut {} share a cell",
                    cut.get(),
                );
            }
        }
    }

    // At the deepest cut only catch-all co-residents remain: a
    // cell holds at most one point claimed below the deepest
    // grid.
    let mut occupied = std::collections::HashSet::new();
    for (position, code) in lod.codes.iter().enumerate() {
        if buckets[position] < deepest {
            prop_assert!(
                occupied.insert(code.prefix(deepest)),
                "two sub-deepest claimants share a deepest-grid cell",
            );
        }
    }

    // Evidence is internally consistent.
    let evidence = lod.measurements(config);
    prop_assert_eq!(
        evidence.bucket_histogram.iter().sum::<u64>(),
        rows.len() as u64,
    );
    prop_assert!(evidence.co_location_excess <= evidence.catch_all_population);
    prop_assert!(evidence.max_tile_delta <= rows.len() as u64);
    prop_assert!(evidence.max_tile_delta >= 1);
}

/// Direct types for the hand-stage rows: distinct enough that every union is distinguishable.
fn hand_types() -> IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> {
    vec![
        smallvec![OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(7)],
        smallvec![OntologyRowId::new(2), OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(9)],
    ]
    .into_iter()
    .collect()
}

#[test]
fn quad_build_produces_the_hand_computed_tree() {
    // The hand-stage cut at span = 1: the root's cut is bucket 1,
    // so its run carries buckets 0..=1 (positions 0..2) and only
    // quadrant (0, 0) - holding the two bucket-2 points - gets a
    // child. That child's cut is the deepest grid: a leaf whose run
    // is the catch-all pair (positions 2..4) and whose subtree also
    // contains the origin point delivered by the root.
    let (lod, config) = hand_stage();
    let tree = QuadTree::build(&lod, &hand_types(), config).expect("the fixture builds");

    assert_eq!(
        tree.nodes,
        [
            Node::new([Some(1), None, None, None], 0, 2, 4),
            Node::new([None; 4], 2, 2, 3),
        ],
    );

    // The root holds all four rows' types. The child holds rows 0, 2, and 3, the three points
    // inside quadrant (0, 0), whose union is {5} | {2, 5} | {9}.
    assert_eq!(tree.sets.set(0), &[2, 5, 7, 9]);
    assert_eq!(tree.sets.set(1), &[2, 5, 9]);

    assert_eq!(tree.depth, depth(1));
    let evidence = tree.measurements();
    assert_eq!(evidence.nodes, 2);
    assert_eq!(evidence.leaves, 1);
    assert_eq!(evidence.depth, depth(1));
    assert_eq!(evidence.type_entries, 7);
}

#[test]
fn quad_build_gathers_types_through_the_base_order() {
    // The hand-stage points with their rows permuted. Importance travels with each point, so the
    // cascade and the tree are identical. The base order is no longer the row order
    // (row_of_position = [1, 0, 3, 2]), and the builder must gather the type column through it.
    let coordinates = [
        Vec2::new(1.0, 1.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(0.375, 0.25),
        Vec2::new(0.25, 0.25),
    ];
    let importance = [3.0_f32, 4.0, 1.0, 2.0];
    let priority = [0.0_f32; 4];
    let ids = identities(4);
    let config = LodConfig {
        span: log2(1),
        max_tile_depth: 1,
    };
    let lod = Lod::build(
        &coordinates,
        rank_inputs(&importance, &priority, &ids).expect("the columns agree"),
        7,
        config,
    )
    .expect("the fixture builds");
    assert_eq!(
        *lod.row_of_position.as_raw(),
        [1, 0, 3, 2].map(NodeRowId::from_u32),
    );

    // Types keyed by the permuted rows: the same types per point as
    // the hand fixture.
    let types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> = vec![
        smallvec![OntologyRowId::new(7)],
        smallvec![OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(9)],
        smallvec![OntologyRowId::new(2), OntologyRowId::new(5)],
    ]
    .into_iter()
    .collect();
    let tree = QuadTree::build(&lod, &types, config).expect("the fixture builds");

    assert_eq!(
        tree.nodes,
        [
            Node::new([Some(1), None, None, None], 0, 2, 4),
            Node::new([None; 4], 2, 2, 3),
        ],
    );
    assert_eq!(tree.sets.set(0), &[2, 5, 7, 9]);
    assert_eq!(tree.sets.set(1), &[2, 5, 9]);
}

#[test]
fn quad_build_rejects_what_no_tree_covers() {
    let (lod, config) = hand_stage();

    // A schedule beyond the key width.
    assert_eq!(
        QuadTree::build(
            &lod,
            &hand_types(),
            LodConfig {
                span: log2(32),
                max_tile_depth: 1,
            },
        )
        .expect_err("a schedule beyond the key width must not build"),
        QuadError::Schedule {
            config: LodConfig {
                span: log2(32),
                max_tile_depth: 1,
            },
        },
    );

    // A type column covering a different row count.
    assert_eq!(
        QuadTree::build(&lod, hand_types().prefix(NodeRowId::from_u32(3)), config)
            .expect_err("a short type column must not build"),
        QuadError::Columns { rows: 4 },
    );

    // A configuration shallower than the cascade that built the lod:
    // the catch-all pair sits in bucket 2, beyond this deepest grid.
    assert_eq!(
        QuadTree::build(
            &lod,
            &hand_types(),
            LodConfig {
                span: log2(1),
                max_tile_depth: 0,
            },
        )
        .expect_err("a mismatched configuration must not build"),
        QuadError::Bucket { bucket: 2 },
    );

    // A direct type beyond the file's u32 ordinals.
    let mut types = hand_types();
    types[NodeRowId::from_u32(2)] = smallvec![OntologyRowId::new(u64::from(u32::MAX) + 1)];
    assert_eq!(
        QuadTree::build(&lod, &types, config)
            .expect_err("an oversized type ordinal must not build"),
        QuadError::TypeOrdinal {
            row: NodeRowId::from_u32(2),
            id: u64::from(u32::MAX) + 1,
        },
    );
}

#[test]
fn quad_tree_round_trips_through_the_quad_file() {
    use crate::file::quad::{read::QuadFile, write};

    let (lod, config) = hand_stage();
    let tree = QuadTree::build(&lod, &hand_types(), config).expect("the fixture builds");

    let mut bytes = Vec::new();
    write::write_regions(&tree.nodes, &tree.sets, &mut bytes)
        .expect("writing into a vector cannot fail");

    let dir =
        std::env::temp_dir().join(format!("hash-graph-atlas-lod-quad-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");
    let path = dir.join("quad-roundtrip.quad");
    std::fs::write(&path, bytes).expect("the scratch file is writable");

    let file = QuadFile::open(&path).expect("the written file reopens");
    assert_eq!(file.nodes(), tree.nodes.as_slice());

    // The child tile locates, its pruned siblings do not, and its type set reads back.
    let quadrant = MortonCell::new(depth(1), 0, 0).expect("the quadrant exists");
    assert_eq!(file.locate(quadrant), Some(1));
    let sibling = MortonCell::new(depth(1), 1, 0).expect("the quadrant exists");
    assert_eq!(file.locate(sibling), None);
    let stored: Vec<u32> = file.type_set(1).iter().map(|id| id.get()).collect();
    assert_eq!(stored, [2, 5, 9]);
}

/// Every built lod cuts into a tree upholding the serving contract's structural laws.
///
/// Certified against linear-scan references.
#[property_test]
fn quad_trees_uphold_the_contract_laws(
    #[strategy = proptest::collection::vec(
        (-1.0e6_f32..1.0e6, -1.0e6_f32..1.0e6, 0.0_f32..8.0, 0_u64..6),
        1..48,
    )]
    rows: Vec<(f32, f32, f32, u64)>,
    seed: u64,
    #[strategy = 0_u8..3] span_log2: u8,
    #[strategy = 0_u8..4] max_tile_depth: u8,
) {
    let coordinates: Vec<Vec2> = rows.iter().map(|&(x, y, ..)| Vec2::new(x, y)).collect();
    let importance: Vec<f32> = rows.iter().map(|&(_, _, i, _)| i).collect();
    let priority = vec![0.0_f32; rows.len()];
    let ids = identities(rows.len() as u128);
    let types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>> = rows
        .iter()
        .map(|&(.., type_row)| smallvec![OntologyRowId::new(type_row)])
        .collect();
    let config = LodConfig {
        span: log2(span_log2),
        max_tile_depth,
    };

    let inputs = rank_inputs(&importance, &priority, &ids).expect("the fixture columns agree");
    let lod =
        Lod::build(&coordinates, inputs, seed, config).expect("finite non-empty coordinates build");
    let deepest = config.deepest().expect("the schedule fits the key width");

    let tree = QuadTree::build(&lod, &types, config).expect("the built lod cuts");

    // Determinism: equal inputs give equal trees.
    prop_assert_eq!(
        &QuadTree::build(&lod, &types, config).expect("the rebuild cuts"),
        &tree,
    );

    // Reconstruct each node's cell by walking the child links from the root. The walk also proves
    // every node is reachable exactly once, which makes the table a tree.
    let root = MortonCell::new(depth(0), 0, 0).expect("the root cell exists");
    let mut cells: Vec<Option<MortonCell>> = vec![None; tree.nodes.len()];
    let mut frontier = vec![(0_u32, root)];
    while let Some((index, cell)) = frontier.pop() {
        prop_assert!(
            cells[index as usize].is_none(),
            "node {} reached twice",
            index
        );
        cells[index as usize] = Some(cell);
        let quadrants = cell.children();
        for (quadrant, child) in tree.nodes[index as usize]
            .children()
            .into_iter()
            .enumerate()
        {
            if let Some(child) = child {
                let quadrants = quadrants.expect("a node with children subdivides");
                frontier.push((child, quadrants[quadrant]));
            }
        }
    }
    let cells: Vec<MortonCell> = cells
        .into_iter()
        .collect::<Option<_>>()
        .expect("every node is reachable from the root");

    // Buckets per position, reconstructed from the fenceposts.
    let buckets: Vec<u8> = (0..lod.codes.len())
        .map(|position| {
            (0..=deepest.get())
                .find(|&bucket| {
                    lod.fenceposts
                        .segment(depth(bucket))
                        .contains(&BasePosition::from_usize(position))
                })
                .expect("every position falls in a segment")
        })
        .collect();

    // The runs partition the base order, so the incremental tile pyramid delivers every point
    // exactly once.
    let mut delivered = vec![0_u32; lod.codes.len()];
    for node in &tree.nodes {
        for position in node.run() {
            delivered[usize::try_from(position).expect("test rows fit usize")] += 1;
        }
    }
    prop_assert!(delivered.iter().all(|&count| count == 1));

    for (index, node) in tree.nodes.iter().enumerate() {
        let cell = cells[index];
        let inside: Vec<usize> = (0..lod.codes.len())
            .filter(|&position| cell.contains(lod.codes[BasePosition::from_usize(position)]))
            .collect();

        // The subtree count is the cell's whole population.
        prop_assert_eq!(node.points() as usize, inside.len());

        // The root always gets a node, and a deeper cell gets one exactly when a point escapes the
        // parent's cut.
        let cut = cell.depth().get() + span_log2;
        if index > 0 {
            prop_assert!(
                inside.iter().any(|&position| buckets[position] >= cut),
                "node {} has no point at or beyond its own cut",
                index,
            );
        }

        // The own-bucket run against a linear scan: the root's cut
        // spans buckets 0..=span_log2, a deeper node's exactly its
        // own bucket.
        let expected: Vec<u64> = inside
            .iter()
            .filter(|&&position| {
                if index == 0 {
                    buckets[position] <= span_log2
                } else {
                    buckets[position] == cut
                }
            })
            .map(|&position| position as u64)
            .collect();
        prop_assert_eq!(
            node.run().collect::<Vec<u64>>(),
            expected,
            "node {}'s run",
            index,
        );

        // The type set against a linear scan over the cell.
        let mut expected: Vec<u32> = inside
            .iter()
            .flat_map(|&position| {
                let row = lod.row_of_position[BasePosition::from_usize(position)];
                types[row]
                    .iter()
                    .map(|id| u32::try_from(id.as_u64()).expect("test ordinals fit u32"))
            })
            .collect();
        expected.sort_unstable();
        expected.dedup();
        prop_assert_eq!(
            tree.sets.set(index),
            expected.as_slice(),
            "node {}'s set",
            index
        );
    }

    // Evidence agrees with the table.
    let evidence = tree.measurements();
    prop_assert_eq!(evidence.nodes, tree.nodes.len() as u64);
    prop_assert!(evidence.leaves >= 1);
    prop_assert!(evidence.depth.get() <= max_tile_depth);
}

/// A deterministic xorshift64* stream for adversarial cases without new dependencies.
fn harness_rng(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// Draws a value below `bound` from the stream.
#[expect(
    clippy::integer_division_remainder_used,
    clippy::cast_possible_truncation,
    reason = "a bounded draw from the deterministic stream folds the word into the bound"
)]
fn harness_draw(state: &mut u64, bound: usize) -> usize {
    (harness_rng(state) as usize) % bound
}

/// The deepest depth at which both keys' prefixes agree, computed through `prefix` alone.
fn oracle_shared_depth(left: MortonKey, right: MortonKey) -> u8 {
    (0..=32_u8)
        .rev()
        .find(|&at| {
            let at = depth(at);
            left.prefix(at) == right.prefix(at)
        })
        .expect("depth zero prefixes are always equal")
}

/// Computes each point's bucket quadratically, as one past the deepest grid the point
/// shares with ANY better-ranked point, clamped to `deepest`. The best point takes zero.
fn oracle_natural_buckets(points: &[(MortonKey, ImportanceRank)], deepest: Depth) -> Vec<Depth> {
    points
        .iter()
        .map(|&(key, rank)| {
            let mut best: Option<u8> = None;
            for &(other_key, other_rank) in points {
                if other_rank < rank {
                    let shared = oracle_shared_depth(key, other_key);
                    best = Some(best.map_or(shared, |held| held.max(shared)));
                }
            }

            best.map_or(Depth::MIN, |shared| {
                depth(shared).saturating_add(1).min(deepest)
            })
        })
        .collect()
}

/// Builds adversarial key pools that force heavy duplication, deep shared prefixes,
/// splits at even and at odd bit positions, and full-width randoms.
fn harness_key_pools(state: &mut u64) -> Vec<Vec<MortonKey>> {
    let base = harness_rng(state);
    vec![
        // Every point drawn from here is co-resident at the full width.
        vec![MortonKey::from_bits(base)],
        // The pair differs in the lowest bit, so the shared depth is 31.
        vec![
            MortonKey::from_bits(base | 1),
            MortonKey::from_bits(base & !1),
        ],
        // The pair differs at bit 62, x's top bit, so the shared depth is 0.
        vec![
            MortonKey::from_bits(base | (1 << 62)),
            MortonKey::from_bits(base & !(1 << 62)),
        ],
        // The pair differs at bit 63, y's top bit, so the shared depth is 0.
        vec![
            MortonKey::from_bits(base | (1 << 63)),
            MortonKey::from_bits(base & !(1 << 63)),
        ],
        // Members of this pool agree on 30 leading pairs and then split inside one pair.
        (0..4)
            .map(|low| MortonKey::from_bits((base & !0b1111) | low))
            .collect(),
        // Full-width randoms.
        core::iter::repeat_with(|| MortonKey::from_bits(harness_rng(state)))
            .take(6)
            .collect(),
    ]
}

/// `separation_buckets` equals both the quadratic closed form and `cascade::buckets` at the
/// key width, over adversarial duplicate-heavy inputs.
#[test]
fn separation_buckets_matches_oracle_and_cascade_adversarially() {
    let mut state = 0x0BAD_5EED_0BAD_5EED_u64;
    let mut cases = 0_usize;

    for round in 0..400_u32 {
        for pool in harness_key_pools(&mut state) {
            let count = harness_draw(&mut state, 13);

            // Keys drawn from the pool with heavy repetition.
            let keys: Vec<MortonKey> =
                core::iter::repeat_with(|| pool[harness_draw(&mut state, pool.len())])
                    .take(count)
                    .collect();

            // Deal distinct ranks shuffled, ascending, descending, or alternating
            // outside-in, and the stack sees every monotone shape.
            let ranks = u32::try_from(count).expect("the draw is bounded");
            let mut row_of_rank: Vec<u32> = (0..ranks).collect();
            match round & 3 {
                0 => {
                    for at in (1..count).rev() {
                        let swap = harness_draw(&mut state, at + 1);
                        row_of_rank.swap(at, swap);
                    }
                }
                1 => {}
                2 => row_of_rank.reverse(),
                _ => {
                    let mut low = 0_u32;
                    let mut high = ranks;
                    for (at, slot) in row_of_rank.iter_mut().enumerate() {
                        if at & 1 == 0 {
                            *slot = low;
                            low += 1;
                        } else {
                            high -= 1;
                            *slot = high;
                        }
                    }
                }
            }
            let ranking = ranking_of(&row_of_rank);

            // The reference cascade at the key width, per row.
            let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);
            let reference = cascade::buckets(keyed, &ranking, Depth::MAX);

            // The candidate, over (key, rank)-sorted points.
            let mut points: Vec<(MortonKey, ImportanceRank, NodeRowId)> = keyed
                .iter_enumerated()
                .map(|(row, &key)| (key, ranking.rank_of_row[row], row))
                .collect();
            points.sort_unstable_by_key(|&(key, rank, _)| (key, rank));
            let candidate = cascade::separation_buckets(&points, |point| point.0, |point| point.1);

            // The quadratic oracle over the same sorted points.
            let flat: Vec<(MortonKey, ImportanceRank)> =
                points.iter().map(|&(key, rank, _)| (key, rank)).collect();
            let oracle = oracle_natural_buckets(&flat, Depth::MAX);

            for (at, &(_, _, row)) in points.iter().enumerate() {
                assert_eq!(
                    candidate[at], oracle[at],
                    "candidate vs oracle: round {round} case {cases} at {at}"
                );
                assert_eq!(
                    candidate[at], reference[row],
                    "candidate vs cascade: round {round} case {cases} at {at}"
                );
            }
            cases += 1;
        }
    }

    assert!(cases >= 2_000, "the sweep exercised the pools");
}

/// `cascade::buckets` itself realizes the min(D + 1, deepest) closed form at EVERY deepest,
/// not only the key width: the analytic reading the replacement rests on.
#[test]
fn cascade_buckets_matches_the_closed_form_at_every_deepest() {
    let mut state = 0xFEED_FACE_FEED_FACE_u64;

    for _ in 0..200_u32 {
        for pool in harness_key_pools(&mut state) {
            let count = harness_draw(&mut state, 9);
            let keys: Vec<MortonKey> =
                core::iter::repeat_with(|| pool[harness_draw(&mut state, pool.len())])
                    .take(count)
                    .collect();

            let mut row_of_rank: Vec<u32> =
                (0..u32::try_from(count).expect("the draw is bounded")).collect();
            for at in (1..count).rev() {
                let swap = harness_draw(&mut state, at + 1);
                row_of_rank.swap(at, swap);
            }
            let ranking = ranking_of(&row_of_rank);
            let keyed = IdSlice::<NodeRowId, _>::from_raw(&keys);

            for deepest in [0_u8, 1, 2, 5, 31, 32] {
                let deepest = depth(deepest);
                let reference = cascade::buckets(keyed, &ranking, deepest);

                let flat: Vec<(MortonKey, ImportanceRank)> = keyed
                    .iter_enumerated()
                    .map(|(row, &key)| (key, ranking.rank_of_row[row]))
                    .collect();
                let oracle = oracle_natural_buckets(&flat, deepest);

                for (row, expected) in keyed.ids().zip(&oracle) {
                    assert_eq!(reference[row], *expected);
                }
            }
        }
    }
}
