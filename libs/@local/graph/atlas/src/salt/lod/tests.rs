use proptest::{arbitrary::any, prop_assert, prop_assert_eq, proptest};
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
    dataset::ArchivedEntityId,
    file::quad::Node,
    identity::{Identity as _, OntologyRowId},
    math::{Bounds2, Log2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
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

/// A ranking straight from a hand-written rank order.
fn ranking_of(row_of_rank: &[u32]) -> Ranking {
    let mut rank_of_row = vec![0_u32; row_of_rank.len()];
    for (rank, &row) in row_of_rank.iter().enumerate() {
        rank_of_row[row as usize] = u32::try_from(rank).expect("test rows fit `u32`");
    }

    Ranking {
        row_of_rank: row_of_rank.into(),
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

    let inputs = RankInputs::new(&importance, &priority, &ids).expect("the columns agree");
    let ranking = Ranking::new(inputs, 7);

    // Row 3 has the lowest importance, row 2 the lower priority within
    // the top importance; rows 0 and 1 tie down to the seeded hash.
    assert_eq!(ranking.rank_of_row[3], 3);
    assert_eq!(ranking.rank_of_row[2], 2);
    let mut top = [ranking.rank_of_row[0], ranking.rank_of_row[1]];
    top.sort_unstable();
    assert_eq!(top, [0, 1]);

    // The permutations invert each other.
    for (rank, &row) in ranking.row_of_rank.iter().enumerate() {
        assert_eq!(ranking.rank_of_row[row as usize] as usize, rank);
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

    let inputs = RankInputs::new(&importance, &priority, &ids).expect("the columns agree");
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

    assert!(RankInputs::new(&[1.0, 2.0], &[1.0, 2.0], &ids).is_some());
    assert!(RankInputs::new(&[1.0], &[1.0, 2.0], &ids).is_none());
    assert!(RankInputs::new(&[1.0, 2.0], &[1.0], &ids).is_none());
    assert!(RankInputs::new(&[1.0, 2.0], &[1.0, 2.0], &ids[..1]).is_none());
}

#[test]
fn non_finite_scores_rank_deterministically() {
    // The dataset contract keeps scores finite; `totalOrder` keeps the
    // pass total and reproducible even when it is violated.
    let importance = [f32::NAN, 1.0, f32::NAN, f32::INFINITY];
    let priority = [0.0_f32; 4];
    let ids = identities(4);

    let inputs = RankInputs::new(&importance, &priority, &ids).expect("the columns agree");
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
    let ranking = ranking_of(&[0, 1, 2, 3]);

    let buckets = cascade::buckets(&keys, &ranking, depth(2));

    // a claims the whole domain; b its depth-1 quadrant; d its depth-2
    // cell; c is co-resident with a down to the deepest grid and takes
    // the catch-all.
    assert_eq!(*buckets, [depth(0), depth(1), depth(2), depth(2)]);
    assert_eq!(cascade::verify_coverage(&keys, &buckets, depth(2)), Ok(()));
}

#[test]
fn cascade_follows_the_rank_order() {
    let keys = hand_keys();

    // c outranks a: the claims flip and a becomes the co-resident
    // catch-all point.
    let ranking = ranking_of(&[2, 1, 0, 3]);
    let buckets = cascade::buckets(&keys, &ranking, depth(2));

    assert_eq!(*buckets, [depth(2), depth(1), depth(0), depth(2)]);
    assert_eq!(cascade::verify_coverage(&keys, &buckets, depth(2)), Ok(()));
}

#[test]
fn coverage_verification_reports_a_gap() {
    let keys = hand_keys();

    // Hand-break the assignment: nothing claims the whole domain at
    // depth 0.
    let buckets = [depth(1), depth(1), depth(2), depth(2)];
    assert_eq!(
        cascade::verify_coverage(&keys, &buckets, depth(2)),
        Err(CoverageGap {
            depth: depth(0),
            cell: 0,
        }),
    );
}

#[test]
fn base_order_sorts_buckets_then_keys_then_ranks() {
    let keys = hand_keys();
    let ranking = ranking_of(&[0, 1, 2, 3]);
    let buckets = cascade::buckets(&keys, &ranking, depth(2));

    let order = BaseOrder::new(&keys, &buckets, &ranking);

    // Hand order: a (bucket 0), b (bucket 1), then the bucket-2 pair by
    // key: c's key (1, 1) interleaves below d's (0x4000_0000, 0).
    assert_eq!(*order.row_of_position, [0, 1, 2, 3]);
    assert_eq!(*order.position_of_row, [0, 1, 2, 3]);

    // Reversing the two catch-all rows' keys is invisible to the sort
    // only if rank breaks the tie: give them one key and check rank
    // order decides.
    let tied = [keys[0], keys[1], keys[2], keys[2]];
    let ranking = ranking_of(&[0, 1, 3, 2]);
    let buckets = cascade::buckets(&tied, &ranking, depth(2));
    let order = BaseOrder::new(&tied, &buckets, &ranking);

    let (first, second) = (order.position_of_row[3], order.position_of_row[2]);
    assert!(
        first < second,
        "the better-ranked row of a key tie precedes: {first} vs {second}",
    );
}

proptest! {
    /// Coverage holds for every input.
    ///
    /// Each occupied cell at each depth of the schedule keeps a representative in the delivered
    /// prefix.
    #[test]
    fn cascade_coverage_is_total(
        bits in proptest::collection::vec(any::<u64>(), 1..48),
        deepest in 0_u8..=6,
        seed: u64,
    ) {
        let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
        let ranking = seeded_ranking(keys.len(), seed);
        let deepest = depth(deepest);

        let buckets = cascade::buckets(&keys, &ranking, deepest);

        prop_assert_eq!(cascade::verify_coverage(&keys, &buckets, deepest), Ok(()));
    }

    /// Below the catch-all, a bucket holds at most one point per cell of its own grid.
    #[test]
    fn buckets_claim_cells_once(
        bits in proptest::collection::vec(any::<u64>(), 1..48),
        deepest in 0_u8..=6,
        seed: u64,
    ) {
        let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
        let ranking = seeded_ranking(keys.len(), seed);
        let deepest = depth(deepest);

        let buckets = cascade::buckets(&keys, &ranking, deepest);

        for probe in 0..deepest.get() {
            let probe = depth(probe);
            let mut cells: Vec<u64> = keys
                .iter()
                .zip(&*buckets)
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
    #[test]
    fn base_order_is_the_unique_total_sort(
        bits in proptest::collection::vec(any::<u64>(), 1..48),
        deepest in 0_u8..=6,
        seed: u64,
    ) {
        let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
        let ranking = seeded_ranking(keys.len(), seed);
        let deepest = depth(deepest);

        let buckets = cascade::buckets(&keys, &ranking, deepest);
        let order = BaseOrder::new(&keys, &buckets, &ranking);

        for (rank, &row) in order.row_of_position.iter().enumerate() {
            prop_assert_eq!(order.position_of_row[row as usize] as usize, rank);
        }

        let sort_key = |row: u32| {
            let row = row as usize;
            (buckets[row], keys[row], ranking.rank_of_row[row])
        };
        for (previous, next) in order
            .row_of_position
            .iter()
            .zip(&order.row_of_position[1..])
        {
            let (left, right) = (sort_key(*previous), sort_key(*next));
            prop_assert!(left < right, "adjacent positions out of order: {left:?} vs {right:?}");
        }
    }
}

/// A deterministic ranking for property tests.
///
/// Rows ranked by the seeded tiebreak alone, through the real rank pass.
fn seeded_ranking(rows: usize, seed: u64) -> Ranking {
    let importance = vec![0.0_f32; rows];
    let priority = vec![0.0_f32; rows];
    let ids = identities(rows as u128);

    let inputs = RankInputs::new(&importance, &priority, &ids).expect("the fixture columns agree");
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
        RankInputs::new(&[0.0], &[0.0], &identities(1)).expect("the columns agree"),
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
/// Four points whose wire positions and cascade buckets are computed in the comments.
///
/// World frame [0, 1] x [0, 1]; `span` = 1, `max_tile_depth` = 1, so the deepest grid is 2 and
/// the catch-all is bucket 2.
///
/// ```text
/// row  world         wire           depth-1 quadrant  depth-2 cell
/// 0    (0,    0)     (-1,    -1)    (0, 0)            (0, 0)
/// 1    (1,    1)     ( 1,     1)    (1, 1)            (3, 3)
/// 2    (0.25, 0.25)  (-0.5,  -0.5)  (0, 0)            (1, 1)
/// 3    (0.375, 0.25) (-0.25, -0.5)  (0, 0)            (1, 1)
/// ```
///
/// Importance ranks the rows in index order. The cascade: row 0 claims the domain, row 1 its
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
        RankInputs::new(&importance, &priority, &ids).expect("the columns agree"),
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
        *lod.coordinates,
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
        *lod.codes,
        [
            MortonKey::new(0, 0),
            MortonKey::new(u32::MAX, u32::MAX),
            MortonKey::new(0x4000_0000, 0x4000_0000),
            MortonKey::new(0x6000_0000, 0x4000_0000),
        ],
    );

    // Buckets [0, 1, 2, 2] as fenceposts.
    assert_eq!(lod.fenceposts.count(), 4);
    assert_eq!(lod.fenceposts.segment(depth(0)), 0..1);
    assert_eq!(lod.fenceposts.segment(depth(1)), 1..2);
    assert_eq!(lod.fenceposts.segment(depth(2)), 2..4);

    // The identity base order makes every permutation the identity.
    assert_eq!(*lod.rank_of_position, [0, 1, 2, 3]);
    assert_eq!(*lod.position_of_rank, [0, 1, 2, 3]);
    assert_eq!(*lod.position_of_row, [0, 1, 2, 3]);
    assert_eq!(*lod.row_of_position, [0, 1, 2, 3]);
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

    // Rows 2 and 3 share their deepest-grid cell: two catch-all
    // points, one distinct cell, one point of co-location excess.
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
        RankInputs::new(&importance, &priority, &ids).expect("the columns agree"),
        0,
        LodConfig::default(),
    )
    .expect("the fixture builds");

    // Base order: row 0 claims the domain; rows 1 and 2 claim their
    // depth-1 quadrants, and within bucket 1 row 2's key sorts below
    // row 1's.
    assert_eq!(
        *lod.coordinates,
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
        RankInputs::new(&importance, &priority, &ids).expect("the columns agree"),
        0,
        LodConfig::default(),
    )
    .expect("the fixture builds");

    assert_eq!(
        *lod.coordinates,
        [Vec2::new(0.0, -1.0), Vec2::new(0.0, 1.0)],
    );
}

#[test]
fn build_rejects_what_no_columns_cover() {
    let ids = identities(2);
    let inputs = RankInputs::new(&[1.0, 2.0], &[0.0, 0.0], &ids).expect("the columns agree");

    // One coordinate against two rank rows.
    assert_eq!(
        Lod::build(&[Vec2::new(0.0, 0.0)], inputs, 0, LodConfig::default())
            .expect_err("disagreeing columns must not build"),
        LodError::Columns { coordinates: 1 },
    );

    // No rows admit no frame.
    let empty = RankInputs::<ArchivedEntityId>::new(&[], &[], &[]).expect("empty columns agree");
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
    write::write_regions(2, &lod.fenceposts, &lod.codes, &mut bytes)
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
    let cell = lod.codes[2].cell(depth(1));
    assert_eq!(file.run(depth(2), cell), 2..4);
}

proptest! {
    /// Every finite point set builds.
    ///
    /// The result upholds the serving contract's structural laws.
    #[test]
    fn built_columns_uphold_the_contract_laws(
        rows in proptest::collection::vec(
            (-1.0e6_f32..1.0e6, -1.0e6_f32..1.0e6, 0.0_f32..8.0),
            1..48,
        ),
        seed: u64,
        span_log2 in 0_u8..3,
        max_tile_depth in 0_u8..4,
    ) {
        let coordinates: Vec<Vec2> = rows.iter().map(|&(x, y, _)| Vec2::new(x, y)).collect();
        let importance: Vec<f32> = rows.iter().map(|&(_, _, i)| i).collect();
        let priority = vec![0.0_f32; rows.len()];
        let ids = identities(rows.len() as u128);
        let config = LodConfig {
            span: log2(span_log2),
            max_tile_depth,
        };

        let inputs = RankInputs::new(&importance, &priority, &ids)
            .expect("the fixture columns agree");
        let lod = Lod::build(&coordinates, inputs, seed, config)
            .expect("finite non-empty coordinates build");
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
        for wire in &lod.coordinates {
            prop_assert!((-1.0..=1.0).contains(&wire.x()));
            prop_assert!((-1.0..=1.0).contains(&wire.y()));
        }

        // The permutations invert each other, both ways.
        for (position, &row) in lod.row_of_position.iter().enumerate() {
            prop_assert_eq!(lod.position_of_row[row as usize] as usize, position);
        }
        for (rank, &position) in lod.position_of_rank.iter().enumerate() {
            prop_assert_eq!(lod.rank_of_position[position as usize] as usize, rank);
        }

        // Every segment of the code column is sorted: the morton
        // file writer's input contract.
        for bucket in 0..=deepest.get() {
            let segment = lod.fenceposts.segment(depth(bucket));
            let start = usize::try_from(segment.start).expect("test rows fit usize");
            let end = usize::try_from(segment.end).expect("test rows fit usize");
            prop_assert!(lod.codes[start..end].is_sorted());
        }

        // The delivered prefix covers every occupied cell at every
        // published depth - the coverage contract, asserted over the
        // built columns, buckets reconstructed from the fenceposts.
        let buckets: Vec<Depth> = (0..lod.fenceposts.count())
            .map(|position| {
                (0..=deepest.get())
                    .map(depth)
                    .find(|&bucket| lod.fenceposts.segment(bucket).contains(&position))
                    .expect("every position falls in a segment")
            })
            .collect();
        prop_assert_eq!(
            cascade::verify_coverage(&lod.codes, &buckets, deepest),
            Ok(()),
        );

        // At most one delivered point per depth-d cell at every cut
        // d below the deepest grid, jointly across buckets - the
        // uniqueness claim the mass channel leans on. The
        // cascade's represented rule guarantees it: a claim never
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
}

/// Direct types for the hand-stage rows: distinct enough that every union is distinguishable.
fn hand_types() -> Vec<SmallVec<OntologyRowId, 2>> {
    vec![
        smallvec![OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(7)],
        smallvec![OntologyRowId::new(2), OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(9)],
    ]
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

    // Root: all four rows' types. Child: rows 0, 2, and 3 - the three
    // points inside quadrant (0, 0) - so {5} | {2, 5} | {9}.
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
    // The hand-stage points with their rows permuted: importance
    // travels with each point, so the cascade and the tree are
    // identical, but the base order is no longer the row order
    // (row_of_position = [1, 0, 3, 2]) and the type column must be
    // gathered through it.
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
        RankInputs::new(&importance, &priority, &ids).expect("the columns agree"),
        7,
        config,
    )
    .expect("the fixture builds");
    assert_eq!(*lod.row_of_position, [1, 0, 3, 2]);

    // Types keyed by the permuted rows: the same types per point as
    // the hand fixture.
    let types: Vec<SmallVec<OntologyRowId, 2>> = vec![
        smallvec![OntologyRowId::new(7)],
        smallvec![OntologyRowId::new(5)],
        smallvec![OntologyRowId::new(9)],
        smallvec![OntologyRowId::new(2), OntologyRowId::new(5)],
    ];
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
        QuadTree::build(&lod, &hand_types()[..3], config)
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
    types[2] = smallvec![OntologyRowId::new(u64::from(u32::MAX) + 1)];
    assert_eq!(
        QuadTree::build(&lod, &types, config)
            .expect_err("an oversized type ordinal must not build"),
        QuadError::TypeOrdinal {
            row: 2,
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

    // The serving query: the child tile locates, its pruned siblings
    // do not, and its type set reads back.
    let quadrant = MortonCell::new(depth(1), 0, 0).expect("the quadrant exists");
    assert_eq!(file.locate(quadrant), Some(1));
    let sibling = MortonCell::new(depth(1), 1, 0).expect("the quadrant exists");
    assert_eq!(file.locate(sibling), None);
    let stored: Vec<u32> = file.type_set(1).iter().map(|id| id.get()).collect();
    assert_eq!(stored, [2, 5, 9]);
}

proptest! {
    /// Every built lod cuts into a tree upholding the serving contract's structural laws.
    ///
    /// Certified against linear-scan references.
    #[test]
    fn quad_trees_uphold_the_contract_laws(
        rows in proptest::collection::vec(
            (-1.0e6_f32..1.0e6, -1.0e6_f32..1.0e6, 0.0_f32..8.0, 0_u64..6),
            1..48,
        ),
        seed: u64,
        span_log2 in 0_u8..3,
        max_tile_depth in 0_u8..4,
    ) {
        let coordinates: Vec<Vec2> = rows.iter().map(|&(x, y, ..)| Vec2::new(x, y)).collect();
        let importance: Vec<f32> = rows.iter().map(|&(_, _, i, _)| i).collect();
        let priority = vec![0.0_f32; rows.len()];
        let ids = identities(rows.len() as u128);
        let types: Vec<SmallVec<OntologyRowId, 2>> = rows
            .iter()
            .map(|&(.., type_row)| smallvec![OntologyRowId::new(type_row)])
            .collect();
        let config = LodConfig {
            span: log2(span_log2),
            max_tile_depth,
        };

        let inputs = RankInputs::new(&importance, &priority, &ids)
            .expect("the fixture columns agree");
        let lod = Lod::build(&coordinates, inputs, seed, config)
            .expect("finite non-empty coordinates build");
        let deepest = config.deepest().expect("the schedule fits the key width");

        let tree = QuadTree::build(&lod, &types, config).expect("the built lod cuts");

        // Determinism: equal inputs give equal trees.
        prop_assert_eq!(
            &QuadTree::build(&lod, &types, config).expect("the rebuild cuts"),
            &tree,
        );

        // Reconstruct each node's cell by walking the child links from
        // the root; the walk also proves every node is reachable
        // exactly once (the table is a tree, not a DAG).
        let root = MortonCell::new(depth(0), 0, 0).expect("the root cell exists");
        let mut cells: Vec<Option<MortonCell>> = vec![None; tree.nodes.len()];
        let mut frontier = vec![(0_u32, root)];
        while let Some((index, cell)) = frontier.pop() {
            prop_assert!(cells[index as usize].is_none(), "node {} reached twice", index);
            cells[index as usize] = Some(cell);
            let quadrants = cell.children();
            for (quadrant, child) in tree.nodes[index as usize].children().into_iter().enumerate()
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
                        lod.fenceposts.segment(depth(bucket)).contains(&(position as u64))
                    })
                    .expect("every position falls in a segment")
            })
            .collect();

        // The runs partition the base order: every point is delivered
        // exactly once across the incremental tile pyramid.
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
                .filter(|&position| cell.contains(lod.codes[position]))
                .collect();

            // The subtree count is the cell's whole population.
            prop_assert_eq!(node.points() as usize, inside.len());

            // The node rule: the root always, deeper cells exactly
            // when a point escapes the parent's cut.
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
                    let row = lod.row_of_position[position];
                    types[row as usize].iter().map(|id| {
                        u32::try_from(id.get()).expect("test ordinals fit u32")
                    })
                })
                .collect();
            expected.sort_unstable();
            expected.dedup();
            prop_assert_eq!(tree.sets.set(index), expected.as_slice(), "node {}'s set", index);
        }

        // Evidence agrees with the table.
        let evidence = tree.measurements();
        prop_assert_eq!(evidence.nodes, tree.nodes.len() as u64);
        prop_assert!(evidence.leaves >= 1);
        prop_assert!(evidence.depth.get() <= max_tile_depth);
    }
}
