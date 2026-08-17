//! Movement readout expectations.
//!
//! The oracle restates one pair reading from full scans over both frames: k-sets by sort, the
//! union domain, then the counting rule, so the tree-backed readout is checked against a plain
//! statement of the same tie semantics.

use alloc::collections::BTreeSet;
use core::{iter, num::NonZero};

use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    id::IdSlice,
};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{AnchorRowId, ControlMovement, Movement, MovementError, PairMovement};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, KdTree, NonFinitePoint, Vec2, d_non_negative},
    salt::ladder::paired::fixtures::frame,
};

/// A seeded frame on a coarse integer lattice, so exact distance ties are common.
fn lattice_frame(seed: u64, rows: usize) -> Vec<Vec2> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    iter::repeat_with(|| {
        Vec2::new(
            f32::from(rng.random_range(-8_i8..8)),
            f32::from(rng.random_range(-8_i8..8)),
        )
    })
    .take(rows)
    .collect()
}

/// Restates one pair reading from full scans: k-sets by sort, union, then the counting rule.
#[expect(
    clippy::cast_possible_truncation,
    reason = "test frames stay far below u32::MAX rows, so row conversions are exact"
)]
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the k-nearest-neighbour count's literature name"
)]
fn oracle_movement(
    zero: &[Vec2],
    canonical: &[Vec2],
    source: u32,
    partner: u32,
    k: usize,
) -> PairMovement {
    let k_set = |frame: &[Vec2]| -> Vec<u32> {
        let query = frame[source as usize];
        let mut readings: Vec<(DNonNegative, u32)> = (0..frame.len() as u32)
            .filter(|&row| row != source)
            .map(|row| (query.distance_squared_wide(frame[row as usize]), row))
            .collect();
        readings.sort_unstable();
        readings.truncate(k);
        readings.into_iter().map(|(_reading, row)| row).collect()
    };

    let union: BTreeSet<u32> = k_set(zero).into_iter().chain(k_set(canonical)).collect();

    let rank = |frame: &[Vec2]| -> u32 {
        let query = frame[source as usize];
        let partner_reading = query.distance_squared_wide(frame[partner as usize]);
        let before = union
            .iter()
            .filter(|&&row| {
                let reading = query.distance_squared_wide(frame[row as usize]);
                reading < partner_reading || (reading == partner_reading && row < partner)
            })
            .count();
        1 + u32::try_from(before).expect("the union is at most 2k rows")
    };

    PairMovement {
        distance_zero: zero[source as usize]
            .distance_squared_wide(zero[partner as usize])
            .sqrt(),
        distance_canonical: canonical[source as usize]
            .distance_squared_wide(canonical[partner as usize])
            .sqrt(),
        rank_zero: rank(zero),
        rank_canonical: rank(canonical),
    }
}

#[test]
#[expect(
    clippy::cast_possible_truncation,
    reason = "test frames stay far below u32::MAX rows, so row conversions are exact"
)]
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the k-nearest-neighbour count's literature name"
)]
fn pair_readings_equal_the_full_scan_restatement() {
    let mut scratch = Scratch::new();
    for (seed, rows) in [(41_u64, 9_usize), (43, 24), (47, 60)] {
        let zero = lattice_frame(seed, rows);
        let canonical = lattice_frame(seed + 100, rows);
        for k in [1, 2, 5, rows] {
            let bound = NonZero::new(k).expect("test k values are nonzero");
            let movement = Movement::new(frame(&zero), frame(&canonical), bound)
                .expect("the frames are finite and equal");
            for source in 0..rows as u32 {
                for partner in 0..rows as u32 {
                    let reading = movement.pair(
                        NodeRowId::new(source.into()),
                        NodeRowId::new(partner.into()),
                        &scratch,
                    );
                    scratch.reset();
                    assert_eq!(
                        reading,
                        oracle_movement(&zero, &canonical, source, partner, k),
                        "pair ({source}, {partner}) at k {k} diverged over {rows} rows",
                    );
                }
            }
        }
    }
}

#[test]
fn an_exact_distance_tie_resolves_by_row_identity() {
    // Rows 1 and 2 sit at exactly distance one from the source at both rungs.
    let points = [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(1.0, 0.0),
    ];
    let movement = Movement::new(
        frame(&points),
        frame(&points),
        NonZero::new(2).expect("two is nonzero"),
    )
    .expect("the frames are finite and equal");
    let scratch = Scratch::new();

    // Row 1 orders before the tied partner 2, so it counts against partner 2 and not the
    // other way round.
    assert_eq!(
        movement.pair(NodeRowId::new(0), NodeRowId::new(2), &scratch),
        PairMovement {
            distance_zero: d_non_negative!(1.0),
            distance_canonical: d_non_negative!(1.0),
            rank_zero: 2,
            rank_canonical: 2,
        },
    );
    assert_eq!(
        movement.pair(NodeRowId::new(0), NodeRowId::new(1), &scratch),
        PairMovement {
            distance_zero: d_non_negative!(1.0),
            distance_canonical: d_non_negative!(1.0),
            rank_zero: 1,
            rank_canonical: 1,
        },
    );
}

#[test]
fn a_partner_outside_one_rung_ranks_over_the_union_domain() {
    // At the zero rung the k = 2 set of row 0 is {1, 2}, and at the canonical rung it is
    // {4, 3}. Partner 4 enters only the canonical set and partner 1 only the zero set, and each
    // rank at the partner's absent rung needs a union row its own k-set does not carry, so a
    // single-rung candidate domain reads 3 where the union reads 4.
    let zero = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 2.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(0.0, 4.0),
        Vec2::new(8.0, 8.0),
    ];
    let canonical = [
        Vec2::new(0.0, 0.0),
        Vec2::new(5.0, 0.0),
        Vec2::new(0.0, 2.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.5, 0.0),
        Vec2::new(9.0, 9.0),
    ];
    let movement = Movement::new(
        frame(&zero),
        frame(&canonical),
        NonZero::new(2).expect("two is nonzero"),
    )
    .expect("the frames are finite and equal");
    let scratch = Scratch::new();

    assert_eq!(
        movement.pair(NodeRowId::new(0), NodeRowId::new(4), &scratch),
        PairMovement {
            distance_zero: d_non_negative!(4.0),
            distance_canonical: d_non_negative!(0.5),
            rank_zero: 4,
            rank_canonical: 1,
        },
        "zero-rung rank of the canonical-only partner counts union row 3",
    );
    assert_eq!(
        movement.pair(NodeRowId::new(0), NodeRowId::new(1), &scratch),
        PairMovement {
            distance_zero: d_non_negative!(1.0),
            distance_canonical: d_non_negative!(5.0),
            rank_zero: 1,
            rank_canonical: 4,
        },
        "canonical-rung rank of the zero-only partner counts union row 2",
    );
}

#[test]
fn control_readings_are_displacement_and_anchor_proximity() {
    let zero = [Vec2::new(0.0, 0.0), Vec2::new(3.0, 4.0)];
    let canonical = [Vec2::new(0.0, 0.0), Vec2::new(3.0, 16.0)];
    let movement = Movement::new(
        frame(&zero),
        frame(&canonical),
        NonZero::new(1).expect("one is nonzero"),
    )
    .expect("the frames are finite and equal");

    let anchor_frame = [Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0)];
    let anchors = KdTree::build(IdSlice::<AnchorRowId, _>::from_raw(&anchor_frame))
        .expect("the anchor frame is finite");

    let scratch = Scratch::new();
    assert_eq!(
        movement.control(NodeRowId::new(1), &anchors, &scratch),
        ControlMovement {
            displacement: d_non_negative!(12.0),
            anchor_distance: d_non_negative!(5.0),
        },
    );
}

#[test]
fn mismatched_or_non_finite_frames_are_refused() {
    let zero = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let short = [Vec2::new(0.0, 0.0)];
    let poisoned = [Vec2::new(0.0, 0.0), Vec2::new(f32::NAN, 0.0)];
    let k = NonZero::new(1).expect("one is nonzero");

    assert_eq!(
        Movement::new(frame(&zero), frame(&short), k).expect_err("the row counts disagree"),
        MovementError::Rows {
            zero: 2,
            canonical: 1,
        },
    );
    assert_eq!(
        Movement::new(frame(&poisoned), frame(&zero), k).expect_err("the zero frame is poisoned"),
        MovementError::Zero(NonFinitePoint {
            id: NodeRowId::new(1),
        }),
    );
    assert_eq!(
        Movement::new(frame(&zero), frame(&poisoned), k)
            .expect_err("the canonical frame is poisoned"),
        MovementError::Canonical(NonFinitePoint {
            id: NodeRowId::new(1),
        }),
    );
}
