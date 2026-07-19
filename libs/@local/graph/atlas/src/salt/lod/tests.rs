use proptest::prelude::*;
use uuid::Uuid;

use super::{
    cascade::{self, CoverageGap},
    key,
    order::BaseOrder,
    rank::{RankInputs, Ranking},
};
use crate::{
    dataset::ArchivedEntityId,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonKey},
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
fn the_seed_reshuffles_ties() {
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
    assert_eq!(keys[0].coordinates(), [0, 0]);
    assert_eq!(keys[1].coordinates(), [u32::MAX, u32::MAX]);
    assert_eq!(keys[2].coordinates(), [1 << 31, 1 << 31]);

    // A zero-extent axis maps every point to cell zero on that axis.
    let flat = Bounds2::new(Vec2::new(-1.0, 3.0), Vec2::new(1.0, 3.0)).expect("a flat frame");
    let keys = key::keys(&[Vec2::new(0.0, 3.0)], flat);
    assert_eq!(keys[0].coordinates(), [1 << 31, 0]);
}

/// Keys whose depth-1 and depth-2 cells are hand-picked: axis values
/// place their top two bits at (depth-1 quadrant, depth-2 sub-cell).
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
fn the_cascade_assigns_the_hand_computed_buckets() {
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
fn the_cascade_follows_the_rank_order() {
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
fn the_base_order_sorts_buckets_then_keys_then_ranks() {
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
    /// Coverage holds for every input: each occupied cell at each depth
    /// of the schedule keeps a representative in the delivered prefix.
    #[test]
    fn cascade_coverage_is_total(
        bits in prop::collection::vec(any::<u64>(), 1..48),
        deepest in 0_u8..=6,
        seed: u64,
    ) {
        let keys: Vec<MortonKey> = bits.iter().copied().map(MortonKey::from_bits).collect();
        let ranking = seeded_ranking(keys.len(), seed);
        let deepest = depth(deepest);

        let buckets = cascade::buckets(&keys, &ranking, deepest);

        prop_assert_eq!(cascade::verify_coverage(&keys, &buckets, deepest), Ok(()));
    }

    /// Below the catch-all, a bucket holds at most one point per cell of
    /// its own grid.
    #[test]
    fn buckets_claim_cells_once(
        bits in prop::collection::vec(any::<u64>(), 1..48),
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

    /// The base order is the unique (bucket, key, rank) sort, and its
    /// permutations invert each other.
    #[test]
    fn base_order_is_the_unique_total_sort(
        bits in prop::collection::vec(any::<u64>(), 1..48),
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

        for pair in order.row_of_position.windows(2) {
            let (left, right) = (pair[0] as usize, pair[1] as usize);
            let left = (buckets[left], keys[left], ranking.rank_of_row[left]);
            let right = (buckets[right], keys[right], ranking.rank_of_row[right]);

            prop_assert!(left < right, "adjacent positions out of order: {left:?} vs {right:?}");
        }
    }
}

/// A deterministic ranking for property tests: rows ranked by the
/// seeded tiebreak alone, through the real rank pass.
fn seeded_ranking(rows: usize, seed: u64) -> Ranking {
    let importance = vec![0.0_f32; rows];
    let priority = vec![0.0_f32; rows];
    let ids = identities(rows as u128);

    let inputs = RankInputs::new(&importance, &priority, &ids).expect("the fixture columns agree");
    Ranking::new(inputs, seed)
}
