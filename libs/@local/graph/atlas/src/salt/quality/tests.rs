#![expect(
    clippy::float_cmp,
    reason = "perfect and worst-case orderings hit the metric bounds exactly: the penalties are \
              integer sums divided by their own integer maxima, and cross-path readings divide \
              identical integers"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use std::collections::HashMap;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use zerocopy::{LE, U64};

use super::{
    clump::Clumps,
    metric::{NeighbourhoodAggregate, RankScratch, rank_correlation},
    probe::{ProbeError, ProbeOptions, probe},
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS, memory::MemoryDataset},
    math::{AlignedVecN, BoxedVecN, Vec2},
    salt::knn::table::Knn,
};

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

/// Rank-vector observation agrees with full-ordering observation.
#[test]
fn observe_ranks_matches_observe() {
    // Universe of 8, k = 3, horizon 5, deliberately tangled orderings.
    let by_reference = [4_u32, 0, 6, 2, 7, 1, 3, 5];
    let by_map = [2_u32, 4, 1, 5, 0, 6, 7, 3];

    let mut through_orderings =
        NeighbourhoodAggregate::new(8, 3, 5).expect("3 <= 8 / 2 and 3 <= 5 <= 8");
    let mut scratch = RankScratch::new(8);
    through_orderings.observe(&by_reference, &by_map, &mut scratch);

    // The same query as opposite-rank vectors, read off by hand: map
    // top-3 = {2, 4, 1} at reference positions 3, 0, 5; reference
    // top-3 = {4, 0, 6} at map positions 1, 4, 5.
    let mut through_ranks =
        NeighbourhoodAggregate::new(8, 3, 5).expect("3 <= 8 / 2 and 3 <= 5 <= 8");
    through_ranks.observe_ranks(&[3, 0, 5], &[1, 4, 5]);

    assert_eq!(through_orderings, through_ranks);
}

/// Merging per-query aggregates equals one joint observation.
#[test]
fn merged_aggregates_match_joint_observation() {
    let reference: Vec<u32> = (0..6).collect();
    let swapped = [0, 2, 1, 3, 4, 5];
    let reversed: Vec<u32> = (0..6).rev().collect();
    let mut scratch = RankScratch::new(6);

    let mut joint = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    joint.observe(&reference, &swapped, &mut scratch);
    joint.observe(&reference, &reversed, &mut scratch);

    let mut first = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    first.observe(&reference, &swapped, &mut scratch);
    let mut second = NeighbourhoodAggregate::new(6, 2, 4).expect("2 <= 6 / 2 and 2 <= 4");
    second.observe(&reference, &reversed, &mut scratch);
    first.merge(&second);

    assert_eq!(first, joint);
}

/// Rows the probe fixture's aligned backing store can hold.
const FIXTURE_CAPACITY: usize = 48 * PROJECTOR_DIMENSIONS;

/// A probe corpus whose three spaces share one deterministic geometry.
///
/// Row `i` sits at an angle on the unit circle in every space: the
/// representation is `(cos, sin)` in the leading two components, the
/// canonical embedding extends it with zeros, and the coordinates are
/// the circle point itself. Chord length and cosine distance are both
/// monotone in the angular gap, so equal embedding and map angles make
/// all three spaces order every universe identically - a perfect map.
struct ProbeFixture {
    node_ids: Vec<U64<LE>>,
    storage: BoxedVecN<FIXTURE_CAPACITY>,
    rows: usize,
    coordinates: Vec<Vec2>,
    canonical: HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
}

impl ProbeFixture {
    fn on_circle(angles: &[f32]) -> Self {
        Self::new(angles, angles)
    }

    /// Places the embeddings at `angles` and the map at `map_angles`.
    fn new(angles: &[f32], map_angles: &[f32]) -> Self {
        assert_eq!(angles.len(), map_angles.len());
        assert!(angles.len() * PROJECTOR_DIMENSIONS <= FIXTURE_CAPACITY);

        let mut storage = BoxedVecN::zero();
        let mut canonical = HashMap::new();
        for (row, &angle) in angles.iter().enumerate() {
            storage.as_array_mut()[row * PROJECTOR_DIMENSIONS] = angle.cos();
            storage.as_array_mut()[row * PROJECTOR_DIMENSIONS + 1] = angle.sin();

            let mut extended = BoxedVecN::zero();
            extended.as_array_mut()[0] = angle.cos();
            extended.as_array_mut()[1] = angle.sin();
            canonical.insert(row as u64, extended);
        }

        Self {
            node_ids: (0..angles.len() as u64).map(U64::new).collect(),
            storage,
            rows: angles.len(),
            coordinates: map_angles
                .iter()
                .map(|&angle| Vec2::new(angle.cos(), angle.sin()))
                .collect(),
            canonical,
        }
    }

    fn dataset(&self) -> MemoryDataset {
        MemoryDataset::new(
            Vec::new(),
            Vec::new(),
            Vec::new(),
            self.canonical.clone(),
            HashMap::new(),
        )
    }

    fn representations(&self) -> &[AlignedVecN<PROJECTOR_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * PROJECTOR_DIMENSIONS])
            .expect("boxed storage is aligned")
    }
}

/// Irregularly spaced angles inside a quarter circle: no two gaps
/// coincide, so no space carries distance ties.
fn irregular_angles(rows: usize) -> Vec<f32> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture row counts stay far inside exact f32 integers"
    )]
    (0..rows)
        .map(|row| {
            let step = row as f32 / rows as f32;
            (0.3 * step).mul_add(step, step) * 1.1
        })
        .collect()
}

#[tokio::test]
async fn probe_reads_a_faithful_map_as_perfect() {
    let fixture = ProbeFixture::on_circle(&irregular_angles(48));
    let options = ProbeOptions {
        anchors: 5.try_into().expect("nonzero"),
        comparisons: 12.try_into().expect("nonzero"),
        neighbourhoods: vec![
            2.try_into().expect("nonzero"),
            4.try_into().expect("nonzero"),
        ],
        ..ProbeOptions::default()
    };

    let readings = probe(
        &fixture.dataset(),
        &fixture.node_ids,
        fixture.representations(),
        &fixture.coordinates,
        &options,
        Xoshiro256PlusPlus::seed_from_u64(7),
    )
    .await
    .expect("the corpus hosts the probe design");

    assert_eq!(readings.anchors.len(), 5);
    assert_eq!(readings.comparisons.len(), 12);
    for grid in [
        &readings.map_representation,
        &readings.sampled_map_representation,
        &readings.sampled_map_canonical,
        &readings.sampled_representation_canonical,
    ] {
        assert_eq!(grid.anchors(), 5);
        assert_eq!(grid.neighbourhoods(), 2);
        for neighbourhood in 0..2 {
            let overall = grid.overall(neighbourhood);
            assert_eq!(overall.queries(), 5);
            assert_eq!(overall.recall(), 1.0);
            assert_eq!(overall.trustworthiness(), 1.0);
            assert_eq!(overall.continuity(), 1.0);
            assert_eq!(overall.intrusion_rate(), 0.0);
            assert_eq!(overall.extrusion_rate(), 0.0);
        }
    }
}

/// The corpus pass's counted ranks agree with sorted full orderings.
#[tokio::test]
async fn corpus_readings_match_a_sorting_reference() {
    // Embeddings on the circle, coordinates scrambled by reversing the
    // angle order and bending it, so map and representation disagree.
    // Rows 10 and 11 duplicate an embedding and rows 20 and 21 a
    // coordinate, exercising the shared (distance, row) tie order.
    let angles = irregular_angles(40);
    let mut map_angles: Vec<f32> = angles
        .iter()
        .rev()
        .map(|&angle| angle.mul_add(0.7, 0.1))
        .collect();
    let mut embedding_angles = angles;
    embedding_angles[11] = embedding_angles[10];
    map_angles[21] = map_angles[20];
    let fixture = ProbeFixture::new(&embedding_angles, &map_angles);

    let k = 3_usize;
    let options = ProbeOptions {
        anchors: 6.try_into().expect("nonzero"),
        comparisons: 10.try_into().expect("nonzero"),
        neighbourhoods: vec![k.try_into().expect("nonzero")],
        ..ProbeOptions::default()
    };

    let representations = fixture.representations();
    let readings = probe(
        &fixture.dataset(),
        &fixture.node_ids,
        representations,
        &fixture.coordinates,
        &options,
        Xoshiro256PlusPlus::seed_from_u64(11),
    )
    .await
    .expect("the corpus hosts the probe design");

    // Reference path: argsort the full universe per anchor and feed
    // the ordering-based kernel entry.
    let anchor_rows: Vec<usize> = readings.anchors.iter().map(|row| row.usize()).collect();
    let universe: Vec<usize> = (0..fixture.node_ids.len())
        .filter(|row| !anchor_rows.contains(row))
        .collect();
    let mut scratch = RankScratch::new(universe.len());

    let order_by = |distances: &dyn Fn(usize) -> f32| {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the fixture universe stays far below u32"
        )]
        let mut order: Vec<u32> = (0..universe.len() as u32).collect();
        order.sort_unstable_by(|&one, &other| {
            distances(universe[one as usize])
                .total_cmp(&distances(universe[other as usize]))
                .then_with(|| universe[one as usize].cmp(&universe[other as usize]))
        });
        order
    };

    for (index, &anchor) in anchor_rows.iter().enumerate() {
        let by_reference =
            order_by(&|row: usize| representations[anchor].cosine_distance(&representations[row]));
        let by_map = order_by(&|row: usize| {
            fixture.coordinates[anchor].distance_squared(fixture.coordinates[row])
        });

        let mut expected = NeighbourhoodAggregate::new(universe.len(), k, 2 * k)
            .expect("the validated options build the same aggregate");
        expected.observe(&by_reference, &by_map, &mut scratch);

        assert_eq!(
            *readings.map_representation.anchor(index, 0),
            expected,
            "anchor {anchor} disagrees with the sorting reference",
        );
    }
}

#[tokio::test]
async fn probe_rejects_impossible_designs() {
    let fixture = ProbeFixture::on_circle(&irregular_angles(12));
    let representations = fixture.representations();

    // The corpus cannot host disjoint samples of 8 + 8.
    let crowded = ProbeOptions {
        anchors: 8.try_into().expect("nonzero"),
        comparisons: 8.try_into().expect("nonzero"),
        neighbourhoods: vec![2.try_into().expect("nonzero")],
        ..ProbeOptions::default()
    };
    assert!(matches!(
        probe(
            &fixture.dataset(),
            &fixture.node_ids,
            representations,
            &fixture.coordinates,
            &crowded,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::Design { rows: 12, .. }),
    ));

    // A neighbourhood of 3 exceeds half the 4-row comparison universe.
    let oversized = ProbeOptions {
        anchors: 2.try_into().expect("nonzero"),
        comparisons: 4.try_into().expect("nonzero"),
        neighbourhoods: vec![3.try_into().expect("nonzero")],
        ..ProbeOptions::default()
    };
    assert!(matches!(
        probe(
            &fixture.dataset(),
            &fixture.node_ids,
            representations,
            &fixture.coordinates,
            &oversized,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::Neighbourhood { k: 3, universe: 4 }),
    ));

    // An empty neighbourhood ladder reads nothing.
    let empty = ProbeOptions {
        anchors: 2.try_into().expect("nonzero"),
        comparisons: 4.try_into().expect("nonzero"),
        neighbourhoods: Vec::new(),
        ..ProbeOptions::default()
    };
    assert!(matches!(
        probe(
            &fixture.dataset(),
            &fixture.node_ids,
            representations,
            &fixture.coordinates,
            &empty,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::NoNeighbourhoods),
    ));
}
