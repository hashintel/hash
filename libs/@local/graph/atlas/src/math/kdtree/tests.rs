#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the k-nearest-neighbour count's literature name, and `x` and `y` are the \
              lattice coordinates"
)]

use core::{iter, num::NonZero};

use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    id::IdSlice,
};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{BUCKET_ROWS, KdNeighbour, KdTree};
use crate::math::{DNonNegative, FinitePointField, Vec2};

hashql_core::id::newtype! {
    /// The test frames' row domain.
    #[id(const)]
    struct RowId(u32)
}

/// Views a finite point slice as a proven frame over the test row domain.
fn frame(points: &[Vec2]) -> &FinitePointField<RowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

/// Selects the `k` nearest rows by sorting every other row's reading, the reference a readout
/// must equal.
fn full_scan(frame: &IdSlice<RowId, Vec2>, row: RowId, k: usize) -> Vec<KdNeighbour<RowId>> {
    let query = frame[row];
    let mut readings: Vec<KdNeighbour<RowId>> = frame
        .ids()
        .filter(|&other| other != row)
        .map(|other| KdNeighbour {
            row: other,
            distance_squared: query.distance_squared_wide(frame[other]),
        })
        .collect();
    readings.sort_unstable();
    readings.truncate(k);
    readings
}

/// Asserts every row's readout equals the full scan, for each of the given `k`.
#[track_caller]
fn assert_matches_full_scan(points: &[Vec2], ks: &[usize]) {
    let frame = frame(points);
    let tree = KdTree::build(frame);
    for &k in ks {
        let k = NonZero::new(k).expect("test k values are nonzero");
        for row in frame.ids() {
            assert_eq!(
                tree.nearest(row, k),
                full_scan(frame, row, k.get()),
                "row {row} at k {k} diverged from the full scan over {} rows",
                frame.len(),
            );
        }
    }
}

/// Selects the `k` nearest rows of an arbitrary point, the reference a point readout must equal.
fn full_scan_point(frame: &IdSlice<RowId, Vec2>, point: Vec2, k: usize) -> Vec<KdNeighbour<RowId>> {
    let mut readings: Vec<KdNeighbour<RowId>> = frame
        .ids()
        .map(|row| KdNeighbour {
            row,
            distance_squared: point.distance_squared_wide(frame[row]),
        })
        .collect();
    readings.sort_unstable();
    readings.truncate(k);
    readings
}

/// A seeded frame of scattered points in `[-100, 100]²`.
fn scattered(seed: u64, rows: usize) -> Vec<Vec2> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    iter::repeat_with(|| {
        Vec2::new(
            rng.random_range(-100.0_f32..100.0),
            rng.random_range(-100.0_f32..100.0),
        )
    })
    .take(rows)
    .collect()
}

#[test]
fn readouts_equal_the_full_scan_on_scattered_frames() {
    // Frame lengths straddle the leaf bucket, and the longest reaches several split levels.
    for rows in [
        1,
        2,
        BUCKET_ROWS - 1,
        BUCKET_ROWS,
        BUCKET_ROWS + 1,
        100,
        333,
    ] {
        for seed in [1, 2, 3] {
            let points = scattered(seed, rows);
            let ks = [1, 2, 7, 50, rows.saturating_sub(1).max(1), rows + 7];
            assert_matches_full_scan(&points, &ks);
        }
    }
}

#[test]
fn duplicated_positions_resolve_ties_by_row() {
    // Sixty-four rows over nine distinct positions guarantee co-located tie classes wider than
    // most of the tested k values, so the cut lands inside a class and the row tie-break decides.
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
    let positions: Vec<Vec2> = (0..3_u16)
        .flat_map(|x| (0..3_u16).map(move |y| Vec2::new(f32::from(x), f32::from(y))))
        .collect();
    let points: Vec<Vec2> = iter::repeat_with(|| positions[rng.random_range(0..positions.len())])
        .take(64)
        .collect();

    assert_matches_full_scan(&points, &[1, 3, 6, 20, 63]);
}

#[test]
fn a_fully_co_located_frame_orders_by_row_alone() {
    // Forty rows exceed one leaf bucket, so construction takes the over-full soft-bucket path.
    let points = vec![Vec2::new(2.5, -3.5); BUCKET_ROWS + 8];
    let tree = KdTree::build(frame(&points));

    let neighbours = tree.nearest(RowId::new(11), NonZero::new(7).expect("seven is nonzero"));

    let expected: Vec<KdNeighbour<RowId>> = (0..7)
        .map(|row| KdNeighbour {
            row: RowId::new(row),
            distance_squared: DNonNegative::ZERO,
        })
        .collect();
    assert_eq!(neighbours, expected);
    assert_matches_full_scan(&points, &[1, 7, points.len() - 1]);
}

#[test]
fn an_integer_lattice_cuts_inside_a_tie_class() {
    // An interior lattice row has four neighbours at distance² 1, so k = 3 cuts inside that
    // exact tie class.
    let points: Vec<Vec2> = (0..5_u16)
        .flat_map(|x| (0..5_u16).map(move |y| Vec2::new(f32::from(x), f32::from(y))))
        .collect();

    assert_matches_full_scan(&points, &[1, 3, 4, 8, 24]);
}

#[test]
fn collinear_frames_stay_exact() {
    let points: Vec<Vec2> = (0..50_u16)
        .map(|x| Vec2::new(f32::from(x) * 0.5, 4.0))
        .collect();

    assert_matches_full_scan(&points, &[1, 5, 49]);
}

#[test]
fn k_at_least_the_frame_returns_every_other_row() {
    let points = scattered(11, 33);
    let tree = KdTree::build(frame(&points));

    let neighbours = tree.nearest(
        RowId::new(0),
        NonZero::new(100).expect("a hundred is nonzero"),
    );

    assert_eq!(neighbours.len(), 32);
    let mut rows: Vec<RowId> = neighbours.iter().map(|neighbour| neighbour.row).collect();
    rows.sort_unstable();
    assert_eq!(rows, (1..33).map(RowId::new).collect::<Vec<_>>());
}

#[test]
fn the_query_row_is_never_a_readout_while_its_co_located_rows_are() {
    let mut points = scattered(13, 20);
    // Rows 3 and 17 sit exactly on the query row 3's position.
    points[17] = points[3];
    let tree = KdTree::build(frame(&points));

    let neighbours = tree.nearest(
        RowId::new(3),
        NonZero::new(19).expect("nineteen is nonzero"),
    );

    assert!(
        neighbours
            .iter()
            .all(|neighbour| neighbour.row != RowId::new(3))
    );
    assert_eq!(
        neighbours[0],
        KdNeighbour {
            row: RowId::new(17),
            distance_squared: DNonNegative::ZERO,
        }
    );
}

#[test]
fn a_scratch_arena_serves_readouts_across_resets() {
    let points = scattered(17, 120);
    let tree = KdTree::build(frame(&points));
    let k = NonZero::new(9).expect("nine is nonzero");

    let mut scratch = Scratch::new();
    let first = tree.nearest_in(RowId::new(0), k, &scratch);
    assert_eq!(first, full_scan(frame(&points), RowId::new(0), 9));
    drop(first);
    scratch.reset();

    let second = tree.nearest_in(RowId::new(77), k, &scratch);
    assert_eq!(second, full_scan(frame(&points), RowId::new(77), 9));
}

#[test]
#[should_panic = "row 5 is not a frame row"]
fn a_query_for_a_row_outside_the_frame_panics() {
    let points = scattered(23, 5);
    let tree = KdTree::build(frame(&points));

    let _readout = tree.nearest(RowId::new(5), NonZero::new(1).expect("one is nonzero"));
}

#[test]
fn point_readouts_equal_the_full_scan() {
    for rows in [1, 2, BUCKET_ROWS, BUCKET_ROWS + 1, 100, 333] {
        for seed in [29, 31] {
            let points = scattered(seed, rows);
            // Off-frame query points from an independent stream, plus every frame position.
            let queries: Vec<Vec2> = scattered(seed ^ 0xBEEF, 24)
                .into_iter()
                .chain(points.iter().copied())
                .collect();
            let frame = frame(&points);
            let tree = KdTree::build(frame);
            for k in [1, 2, 7, 50, rows, rows + 7] {
                let bound = NonZero::new(k).expect("test k values are nonzero");
                for &point in &queries {
                    assert_eq!(
                        tree.nearest_point(point, bound),
                        full_scan_point(frame, point, k),
                        "point {point:?} at k {k} diverged from the full scan over {rows} rows",
                    );
                }
            }
        }
    }
}

#[test]
fn a_point_query_excludes_no_row() {
    let points = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 2.0),
    ];
    let frame = frame(&points);
    let tree = KdTree::build(frame);
    let k = NonZero::new(2).expect("two is nonzero");

    // A row query from row 1 excludes row 1 itself.
    let neighbours = tree.nearest(RowId::new(1), k);
    assert!(
        neighbours
            .iter()
            .all(|neighbour| neighbour.row != RowId::new(1))
    );

    // A point query from row 1's position keeps it, at distance zero and ahead of every other.
    let neighbours = tree.nearest_point(frame[RowId::new(1)], k);
    assert_eq!(
        neighbours[0],
        KdNeighbour {
            row: RowId::new(1),
            distance_squared: DNonNegative::ZERO,
        }
    );
}

#[test]
fn an_empty_frame_builds_and_a_point_readout_returns_nothing() {
    let tree = KdTree::build(frame(&[]));

    let readout = tree.nearest_point(
        Vec2::new(0.0, 0.0),
        NonZero::new(3).expect("three is nonzero"),
    );
    assert!(readout.is_empty());
}

#[test]
#[should_panic = "the query point is finite"]
fn a_non_finite_query_point_panics() {
    let points = scattered(37, 8);
    let tree = KdTree::build(frame(&points));

    let _readout = tree.nearest_point(
        Vec2::new(f32::NAN, 0.0),
        NonZero::new(1).expect("one is nonzero"),
    );
}
