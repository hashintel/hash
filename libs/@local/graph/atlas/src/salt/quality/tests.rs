#![expect(
    clippy::float_cmp,
    reason = "perfect and worst-case orderings hit the metric bounds exactly: the penalties are \
              integer sums divided by their own integer maxima"
)]

use super::{
    clump::Clumps,
    metric::{NeighbourhoodAggregate, RankScratch, rank_correlation},
};
use crate::salt::knn::table::Knn;

/// A six-row, two-neighbour table: a chained near-duplicate triple
/// {0, 1, 2}, an exact-duplicate pair {3, 4}, and a far singleton 5.
fn clump_fixture() -> Knn {
    let indptr: Vec<u64> = vec![0, 2, 4, 6, 8, 10, 12];
    let indices: Vec<u32> = vec![1, 2, 0, 2, 0, 1, 4, 5, 3, 5, 3, 4];
    let distances: Vec<f32> = vec![
        0.05, 0.08, // 0 -> 1, 2
        0.05, 0.05, // 1 -> 0, 2
        0.08, 0.05, // 2 -> 0, 1
        0.0, 1.5, // 3 -> 4, 5
        0.0, 1.4, // 4 -> 3, 5
        1.5, 1.4, // 5 -> 3, 4
    ];
    let matrix = sprs::CsMatI::new((6, 6), indptr, indices, distances);
    Knn::new(matrix).expect("the fixture satisfies every table invariant")
}

#[test]
fn clumps_group_chains_and_duplicates() {
    let table = clump_fixture();
    let clumps = Clumps::from_knn(&table.view(), 0.1);

    assert_eq!(clumps.rows(), 6);
    // {0, 1, 2} chains through 0.05/0.08 edges; {3, 4} are exact
    // duplicates; 5 stays alone.
    assert_eq!(clumps.clumps(), 3);
    assert_eq!(clumps.groups(), 2);
    assert_eq!(clumps.grouped_rows(), 5);
    assert_eq!(clumps.clump(0), clumps.clump(1));
    assert_eq!(clumps.clump(1), clumps.clump(2));
    assert_eq!(clumps.clump(3), clumps.clump(4));
    assert_ne!(clumps.clump(0), clumps.clump(3));
    assert_ne!(clumps.clump(5), clumps.clump(3));
    // Dense ids follow first-row order.
    assert_eq!(clumps.clump(0), 0);
    assert_eq!(clumps.clump(3), 1);
    assert_eq!(clumps.clump(5), 2);
}

#[test]
fn clump_threshold_is_inclusive_and_zero_keeps_exact_duplicates() {
    let table = clump_fixture();

    // At the boundary value 0.05 the {0, 1, 2} chain still connects
    // (0 and 2 join through 1), and {3, 4} always group.
    let boundary = Clumps::from_knn(&table.view(), 0.05);
    assert_eq!(boundary.clump(0), boundary.clump(2));
    assert_eq!(boundary.groups(), 2);

    // Epsilon 0 groups exactly the coincident embeddings.
    let exact = Clumps::from_knn(&table.view(), 0.0);
    assert_eq!(exact.groups(), 1);
    assert_eq!(exact.grouped_rows(), 2);
    assert_eq!(exact.clump(3), exact.clump(4));
    assert_ne!(exact.clump(0), exact.clump(1));

    // A non-finite threshold admits no edges.
    let none = Clumps::from_knn(&table.view(), f32::NAN);
    assert_eq!(none.clumps(), 6);
    assert_eq!(none.groups(), 0);
}

/// The identity comparison: both spaces order the universe alike.
#[test]
fn identical_orderings_are_perfect() {
    let ordering: Vec<u32> = (0..10).collect();
    let mut aggregate = NeighbourhoodAggregate::new(10, 3, 6).expect("3 <= 10 / 2 and 3 <= 6");
    let mut scratch = RankScratch::new(10);

    aggregate.observe(&ordering, &ordering, &mut scratch);

    assert_eq!(aggregate.queries(), 1);
    assert_eq!(aggregate.recall(), 1.0);
    assert_eq!(aggregate.trustworthiness(), 1.0);
    assert_eq!(aggregate.continuity(), 1.0);
    assert_eq!(aggregate.intrusion_rate(), 0.0);
    assert_eq!(aggregate.extrusion_rate(), 0.0);
}

/// A reversed ordering is the worst permutation at every valid k.
#[test]
fn reversed_ordering_is_worst() {
    let reference: Vec<u32> = (0..8).collect();
    let map: Vec<u32> = (0..8).rev().collect();
    let mut aggregate = NeighbourhoodAggregate::new(8, 2, 4).expect("2 <= 8 / 2 and 2 <= 4");
    let mut scratch = RankScratch::new(8);

    aggregate.observe(&reference, &map, &mut scratch);

    // Map top-2 = {7, 6}: reference positions 7 and 6, both false.
    assert_eq!(aggregate.recall(), 0.0);
    // Penalties (7-2+1) + (6-2+1) = 11 = the worst case 2*(16-6+1)/2,
    // so both normalized readings sit at the floor exactly.
    assert_eq!(aggregate.trustworthiness(), 0.0);
    assert_eq!(aggregate.continuity(), 0.0);
    // Both false neighbours lie past the horizon in both directions.
    assert_eq!(aggregate.intrusion_rate(), 1.0);
    assert_eq!(aggregate.extrusion_rate(), 1.0);
}

/// Hand-computed mixed case: one shared neighbour, one mild swap.
#[test]
fn hand_computed_partial_agreement() {
    // Universe of 6. Reference: 0,1,2,3,4,5. Map: 0,2,1,3,4,5.
    // k = 2: map top-2 = {0, 2}, reference top-2 = {0, 1}.
    let reference: Vec<u32> = (0..6).collect();
    let map = [0, 2, 1, 3, 4, 5];
    let mut aggregate = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    let mut scratch = RankScratch::new(6);

    aggregate.observe(&reference, &map, &mut scratch);

    // Shared: {0} of 2.
    assert_eq!(aggregate.recall(), 0.5);
    // Trust penalty: point 2 at reference position 2 -> excess 1.
    // Worst case: 2 * (12 - 6 + 1) / 2 = 7.
    assert_eq!(aggregate.trustworthiness(), 1.0 - 1.0 / 7.0);
    // Continuity penalty: point 1 at map position 2 -> excess 1.
    assert_eq!(aggregate.continuity(), 1.0 - 1.0 / 7.0);
    // The swap is a near-boundary reshuffle, inside the horizon.
    assert_eq!(aggregate.intrusion_rate(), 0.0);
    assert_eq!(aggregate.extrusion_rate(), 0.0);
}

/// The horizon separates reshuffles from genuine intruders.
#[test]
fn horizon_splits_reshuffles_from_intruders() {
    // Map top-2 = {0, 5}: point 5 sits at reference position 5, past
    // the horizon 4; point 1 is banished to map position 5 in return.
    let reference: Vec<u32> = (0..6).collect();
    let map = [0, 5, 2, 3, 4, 1];
    let mut aggregate = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    let mut scratch = RankScratch::new(6);

    aggregate.observe(&reference, &map, &mut scratch);

    assert_eq!(aggregate.recall(), 0.5);
    assert_eq!(aggregate.intrusion_rate(), 0.5);
    assert_eq!(aggregate.extrusion_rate(), 0.5);
    // Excesses: intruder (5-2+1) = 4, banished (5-2+1) = 4, of 7.
    assert_eq!(aggregate.trustworthiness(), 1.0 - 4.0 / 7.0);
    assert_eq!(aggregate.continuity(), 1.0 - 4.0 / 7.0);
}

/// Aggregation over queries averages penalties, not readings.
#[test]
fn aggregate_pools_queries() {
    let reference: Vec<u32> = (0..6).collect();
    let mut aggregate = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    let mut scratch = RankScratch::new(6);

    aggregate.observe(&reference, &reference, &mut scratch);
    aggregate.observe(&reference, &[0, 2, 1, 3, 4, 5], &mut scratch);

    assert_eq!(aggregate.queries(), 2);
    // Shared 2 of 2 and 1 of 2.
    assert_eq!(aggregate.recall(), 0.75);
    // One unit of penalty against two queries' worst case 14.
    assert_eq!(aggregate.trustworthiness(), 1.0 - 1.0 / 14.0);
}

/// The constructor rejects the domains the normalizer excludes.
#[test]
fn aggregate_rejects_invalid_shapes() {
    assert!(NeighbourhoodAggregate::new(10, 0, 5).is_none());
    assert!(NeighbourhoodAggregate::new(10, 6, 8).is_none());
    assert!(NeighbourhoodAggregate::new(10, 3, 2).is_none());
    assert!(NeighbourhoodAggregate::new(10, 3, 11).is_none());
    assert!(NeighbourhoodAggregate::new(10, 5, 10).is_some());
}

#[test]
fn rank_correlation_bounds_and_signs() {
    // Monotone agreement, exact reversal, and a hand-computed middle.
    assert_eq!(rank_correlation(&[0.1, 0.5, 0.9], &[1.0, 2.0, 3.0]), 1.0);
    assert_eq!(rank_correlation(&[0.1, 0.5, 0.9], &[3.0, 2.0, 1.0]), -1.0);
    // Ranks 0,1,2,3 vs 1,0,2,3: sum d^2 = 2, rho = 1 - 12/60 = 0.8.
    assert_eq!(
        rank_correlation(&[1.0, 2.0, 3.0, 4.0], &[2.0, 1.0, 3.0, 4.0]),
        0.8,
    );
    // Order information needs at least two points.
    assert_eq!(rank_correlation(&[1.0], &[2.0]), 0.0);
}
