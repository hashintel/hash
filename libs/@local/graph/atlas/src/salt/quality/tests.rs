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

use alloc::borrow::Cow;
use core::{assert_matches, future::ready, num::NonZero};
use std::collections::{HashMap, HashSet};

use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdSlice, IdVec};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::{SmallVec, smallvec};
use zerocopy::{LE, U64};

use super::{
    clump::{ClumpAggregate, Clumps},
    metric::{NeighbourhoodAggregate, RankScratch, TripletAggregate},
    probe::{
        ClumpReadings, ProbeCorpus, ProbeError, ProbeOptions, ProbeReadings, RadiusPair,
        ReadingGrid, probe, sample_pairs,
    },
    report::{QualityThresholds, ThresholdOverrides, assess},
    runner::{QualityRunOptions, run},
};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS, card::Card,
        memory::MemoryDataset,
    },
    file::generation::GenerationRoot,
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, NonNegative, UnitFraction, Vec2, VecN},
    progress::NoProgress,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::{ClassifierInput, FitConfig, PlacementOptions, Supplies, fit},
        knn::table::Knn,
        landmark::select::SelectionOptions,
        policy::classifier::{
            FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet, fit as fit_classifier,
        },
    },
};

/// A six-row, two-neighbour table.
///
/// A chained near-duplicate triple {0, 1, 2}, an exact-duplicate pair {3, 4}, and a far singleton
/// 5.
fn clump_fixture() -> Knn<NodeRowId> {
    let indptr: Vec<u64> = vec![0, 2, 4, 6, 8, 10, 12];
    let indices: Vec<u32> = vec![1, 2, 0, 2, 0, 1, 4, 5, 3, 5, 3, 4];
    let distances: Vec<f32> = vec![
        0.05, 0.08, // 0 → 1, 2
        0.05, 0.05, // 1 → 0, 2
        0.08, 0.05, // 2 → 0, 1
        0.0, 1.5, // 3 → 4, 5
        0.0, 1.4, // 4 → 3, 5
        1.5, 1.4, // 5 → 3, 4
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
    assert_eq!(
        clumps.clump(NodeRowId::new(0)),
        clumps.clump(NodeRowId::new(1))
    );
    assert_eq!(
        clumps.clump(NodeRowId::new(1)),
        clumps.clump(NodeRowId::new(2))
    );
    assert_eq!(
        clumps.clump(NodeRowId::new(3)),
        clumps.clump(NodeRowId::new(4))
    );
    assert_ne!(
        clumps.clump(NodeRowId::new(0)),
        clumps.clump(NodeRowId::new(3))
    );
    assert_ne!(
        clumps.clump(NodeRowId::new(5)),
        clumps.clump(NodeRowId::new(3))
    );
    // Dense ids follow first-row order.
    assert_eq!(clumps.clump(NodeRowId::new(0)), 0);
    assert_eq!(clumps.clump(NodeRowId::new(3)), 1);
    assert_eq!(clumps.clump(NodeRowId::new(5)), 2);
}

#[test]
fn clump_threshold_is_inclusive_and_zero_keeps_exact_duplicates() {
    let table = clump_fixture();

    // At the boundary value 0.05 the {0, 1, 2} chain still connects
    // (0 and 2 join through 1), and {3, 4} always group.
    let boundary = Clumps::from_knn(&table.view(), 0.05);
    assert_eq!(
        boundary.clump(NodeRowId::new(0)),
        boundary.clump(NodeRowId::new(2))
    );
    assert_eq!(boundary.groups(), 2);

    // Epsilon 0 groups exactly the coincident embeddings.
    let exact = Clumps::from_knn(&table.view(), 0.0);
    assert_eq!(exact.groups(), 1);
    assert_eq!(exact.grouped_rows(), 2);
    assert_eq!(
        exact.clump(NodeRowId::new(3)),
        exact.clump(NodeRowId::new(4))
    );
    assert_ne!(
        exact.clump(NodeRowId::new(0)),
        exact.clump(NodeRowId::new(1))
    );

    // A non-finite threshold admits no edges.
    let none = Clumps::from_knn(&table.view(), f32::NAN);
    assert_eq!(none.clumps(), 6);
    assert_eq!(none.groups(), 0);
}

/// The default threshold groups at duplicate scale.
///
/// The fixture's coincident pair joins while its 0.05-distant chain - twenty-five defaults wide -
/// stays apart.
#[test]
fn default_epsilon_groups_duplicates_not_neighbours() {
    let table = clump_fixture();
    let clumps = Clumps::from_knn(&table.view(), super::clump::DEFAULT_EPSILON);

    assert_eq!(clumps.epsilon(), super::clump::DEFAULT_EPSILON);
    assert_eq!(
        clumps.clump(NodeRowId::new(3)),
        clumps.clump(NodeRowId::new(4))
    );
    assert_ne!(
        clumps.clump(NodeRowId::new(0)),
        clumps.clump(NodeRowId::new(1))
    );
    assert_eq!(clumps.groups(), 1);
    assert_eq!(clumps.grouped_rows(), 2);
}

#[test]
fn hand_built_labels_read_like_a_grouping() {
    let clumps = Clumps::<NodeRowId>::from_labels(IdVec::from_raw(vec![0, 0, 1, 2, 2, 2]), 0.25);

    assert_eq!(clumps.rows(), 6);
    assert_eq!(clumps.epsilon(), 0.25);
    assert_eq!(clumps.clumps(), 3);
    assert_eq!(clumps.groups(), 2);
    assert_eq!(clumps.grouped_rows(), 5);
    assert_eq!(clumps.clump(NodeRowId::new(3)), 2);
}

/// Hand-computed multiset overlap.
///
/// The duplicated label 1 matches twice, 0 once, and the unmatched 2 and 3 earn nothing.
#[test]
fn clump_aggregate_counts_multiset_overlap() {
    let mut aggregate = ClumpAggregate::new(NonZero::new(4).expect("nonzero"));
    aggregate.observe(&mut [0, 1, 1, 2], &mut [1, 1, 3, 0]);

    assert_eq!(aggregate.queries(), 1);
    assert_eq!(aggregate.recall(), 3.0 / 4.0);

    // A second query merges into the running totals: 1 of 4 matched.
    let mut second = ClumpAggregate::new(NonZero::new(4).expect("nonzero"));
    second.observe(&mut [5, 5, 5, 5], &mut [5, 6, 7, 8]);
    aggregate.merge(&second);
    assert_eq!(aggregate.queries(), 2);
    assert_eq!(aggregate.recall(), 4.0 / 8.0);

    // An empty aggregate reads 1, like the rank kernel's recall.
    assert_eq!(
        ClumpAggregate::new(NonZero::new(4).expect("nonzero")).recall(),
        1.0,
    );
}

/// The identity comparison: both spaces order the universe alike.
#[test]
fn identical_orderings_are_perfect() {
    let ordering: Vec<u32> = (0..10).collect();
    let mut aggregate = NeighbourhoodAggregate::new(10, NonZero::new(3).expect("nonzero"), 6)
        .expect("3 <= 10 / 2 and 3 <= 6");
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
    let mut aggregate = NeighbourhoodAggregate::new(8, NonZero::new(2).expect("nonzero"), 4)
        .expect("2 <= 8 / 2 and 2 <= 4");
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
    let mut aggregate = NeighbourhoodAggregate::new(6, NonZero::new(2).expect("nonzero"), 4)
        .expect("2 <= 6 / 2 and 2 <= 4");
    let mut scratch = RankScratch::new(6);

    aggregate.observe(&reference, &map, &mut scratch);

    // Shared: {0} of 2.
    assert_eq!(aggregate.recall(), 0.5);
    // Trust penalty: point 2 at reference position 2 → excess 1.
    // Worst case: 2 · (12 - 6 + 1) / 2 = 7.
    assert_eq!(aggregate.trustworthiness(), 1.0 - 1.0 / 7.0);
    // Continuity penalty: point 1 at map position 2 → excess 1.
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
    let mut aggregate = NeighbourhoodAggregate::new(6, NonZero::new(2).expect("nonzero"), 4)
        .expect("2 <= 6 / 2 and 2 <= 4");
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
    let mut aggregate = NeighbourhoodAggregate::new(6, NonZero::new(2).expect("nonzero"), 4)
        .expect("2 <= 6 / 2 and 2 <= 4");
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
    let k = |value: usize| NonZero::new(value).expect("nonzero");

    assert!(NeighbourhoodAggregate::new(10, k(6), 8).is_none());
    assert!(NeighbourhoodAggregate::new(10, k(3), 2).is_none());
    assert!(NeighbourhoodAggregate::new(10, k(3), 11).is_none());
    assert!(NeighbourhoodAggregate::new(10, k(5), 10).is_some());
}

/// Sampled pairs are distinct and in bounds over every small universe.
#[test]
fn sampled_pairs_are_distinct_and_in_bounds() {
    // A one-point universe holds no pairs.
    assert!(sample_pairs(Xoshiro256PlusPlus::seed_from_u64(3), 1, 64).is_empty());

    for comparisons in 2..=6_usize {
        let bound = u32::try_from(comparisons).expect("the test universes are tiny");
        let pairs = sample_pairs(
            Xoshiro256PlusPlus::seed_from_u64(comparisons as u64),
            comparisons,
            512,
        );

        assert_eq!(pairs.len(), 512);
        let mut seen = HashSet::new();
        for &[first, second] in &pairs {
            assert_ne!(first, second, "a pair never compares a point to itself");
            assert!(first < bound, "the first index stays inside the universe");
            assert!(second < bound, "the second index stays inside the universe");
            seen.insert([first, second]);
        }

        // 512 seeded draws over at most 30 ordered pairs cover the whole
        // support, pinning uniformity's reach alongside its bounds.
        assert_eq!(seen.len(), comparisons * (comparisons - 1));
    }
}

/// Rank-vector observation agrees with full-ordering observation.
#[test]
fn observe_ranks_matches_observe() {
    // Universe of 8, k = 3, horizon 5, deliberately tangled orderings.
    let by_reference = [4_u32, 0, 6, 2, 7, 1, 3, 5];
    let by_map = [2_u32, 4, 1, 5, 0, 6, 7, 3];

    let mut through_orderings =
        NeighbourhoodAggregate::new(8, NonZero::new(3).expect("nonzero"), 5)
            .expect("3 <= 8 / 2 and 3 <= 5 <= 8");
    let mut scratch = RankScratch::new(8);
    through_orderings.observe(&by_reference, &by_map, &mut scratch);

    // The same query as opposite-rank vectors, read off by hand: map
    // top-3 = {2, 4, 1} at reference positions 3, 0, 5; reference
    // top-3 = {4, 0, 6} at map positions 1, 4, 5.
    let mut through_ranks = NeighbourhoodAggregate::new(8, NonZero::new(3).expect("nonzero"), 5)
        .expect("3 <= 8 / 2 and 3 <= 5 <= 8");
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

    let two = NonZero::new(2).expect("nonzero");
    let mut joint = NeighbourhoodAggregate::new(6, two, 4).expect("2 <= 6 / 2 and 2 <= 4");
    joint.observe(&reference, &swapped, &mut scratch);
    joint.observe(&reference, &reversed, &mut scratch);

    let mut first = NeighbourhoodAggregate::new(6, two, 4).expect("2 <= 6 / 2 and 2 <= 4");
    first.observe(&reference, &swapped, &mut scratch);
    let mut second = NeighbourhoodAggregate::new(6, two, 4).expect("2 <= 6 / 2 and 2 <= 4");
    second.observe(&reference, &reversed, &mut scratch);
    first.merge(&second);

    assert_eq!(first, joint);
}

/// Rows the probe fixture's aligned backing store can hold.
const FIXTURE_CAPACITY: usize = 48 * PROJECTOR_DIMENSIONS;

/// A probe corpus whose three spaces share one deterministic geometry.
///
/// Row `i` sits at an angle on the unit circle in every space: the representation is `(cos, sin)`
/// in the leading two components, the canonical embedding extends it with zeros, and the
/// coordinates are the circle point itself. Chord length and cosine distance are both monotone in
/// the angular gap, so equal embedding and map angles make all three spaces order every universe
/// identically - a perfect map.
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

    fn corpus(&self) -> ProbeCorpus<'_, U64<LE>> {
        ProbeCorpus::new(
            IdSlice::from_raw(&self.node_ids),
            IdSlice::from_raw(self.representations()),
            IdSlice::from_raw(&self.coordinates),
        )
    }
}

/// Irregularly spaced angles inside a quarter circle.
///
/// No two gaps coincide, so no space carries distance ties.
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
        ]
        .into(),
        ..ProbeOptions::default()
    };

    let readings = probe(
        &fixture.dataset(),
        fixture.corpus(),
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

/// Collects rows as indices into row-aligned fixture storage.
fn indices_of(rows: &[NodeRowId]) -> Vec<usize> {
    rows.iter().map(|row| row.as_usize()).collect()
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

    let k = NonZero::new(3_usize).expect("nonzero");
    let options = ProbeOptions {
        anchors: 6.try_into().expect("nonzero"),
        comparisons: 10.try_into().expect("nonzero"),
        neighbourhoods: vec![k].into(),
        ..ProbeOptions::default()
    };

    let representations = fixture.representations();
    let readings = probe(
        &fixture.dataset(),
        fixture.corpus(),
        &options,
        Xoshiro256PlusPlus::seed_from_u64(11),
    )
    .await
    .expect("the corpus hosts the probe design");

    // Reference path: argsort the full universe per anchor and feed
    // the ordering-based kernel entry.
    let anchor_rows = indices_of(&readings.anchors);
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

        let mut expected = NeighbourhoodAggregate::new(universe.len(), k, 2 * k.get())
            .expect("the validated options build the same aggregate");
        expected.observe(&by_reference, &by_map, &mut scratch);

        assert_eq!(
            *readings.map_representation.anchor(index, 0),
            expected,
            "anchor {anchor} disagrees with the sorting reference",
        );

        // Radii replay: the k-th entries of the sorted distance lists.
        let radii = readings.radii[index];
        let sorted_by = |distances: &dyn Fn(usize) -> f32| {
            let mut all: Vec<f32> = universe.iter().map(|&row| distances(row)).collect();
            all.sort_unstable_by(f32::total_cmp);
            all
        };
        let map_distances = sorted_by(&|row: usize| {
            fixture.coordinates[anchor].distance_squared(fixture.coordinates[row])
        });
        let representation_distances =
            sorted_by(&|row: usize| representations[anchor].cosine_distance(&representations[row]));
        assert_eq!(radii.map, map_distances[k.get() - 1].sqrt());
        assert_eq!(radii.representation, representation_distances[k.get() - 1]);

        // Triplet replay over the shared pair sample: naive order
        // agreement between the map and the representation.
        let comparisons = indices_of(&readings.comparisons);
        let mut preserved = 0_u64;
        for &[first, second] in &readings.triplet_pairs {
            let (first, second) = (comparisons[first as usize], comparisons[second as usize]);
            let nearer = |distances: &dyn Fn(usize) -> f32| {
                distances(first)
                    .total_cmp(&distances(second))
                    .then_with(|| first.cmp(&second))
                    .is_lt()
            };
            let map = nearer(&|row: usize| {
                fixture.coordinates[anchor].distance_squared(fixture.coordinates[row])
            });
            let representation = nearer(&|row: usize| {
                representations[anchor].cosine_distance(&representations[row])
            });
            preserved += u64::from(map == representation);
        }
        let triplets = readings.triplet_map_representation[index];
        assert_eq!(triplets.triplets(), readings.triplet_pairs.len() as u64);
        assert_eq!(
            triplets.preserved(),
            preserved,
            "anchor {anchor} disagrees with the triplet reference",
        );
    }
}

/// The probe's clump collapse.
///
/// Singleton labels reproduce plain recall exactly, and a grouped labelling agrees with a sorting
/// reference collapsed the same way while never reading below plain recall.
#[tokio::test]
async fn clump_readings_match_a_sorting_reference() {
    // The scrambled fixture from the corpus reference test: map and
    // representation disagree, so the collapse has work to do.
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
        neighbourhoods: vec![k.try_into().expect("nonzero")].into(),
        ..ProbeOptions::default()
    };

    // Singleton labels: the multiset overlap is the shared-row count,
    // so the collapsed reading equals plain recall anchor by anchor.
    let singletons = Clumps::<NodeRowId>::from_labels((0..40).collect(), 0.0);
    let readings = probe(
        &fixture.dataset(),
        fixture.corpus().with_clumps(&singletons),
        &options,
        Xoshiro256PlusPlus::seed_from_u64(11),
    )
    .await
    .expect("the corpus hosts the probe design");
    let clumps = readings
        .clumps
        .as_ref()
        .expect("the probe carried a grouping");
    assert_eq!(clumps.epsilon, 0.0);
    assert_eq!(clumps.count, 40);
    assert_eq!(clumps.groups, 0);
    for anchor in 0..6 {
        assert_eq!(
            clumps.map_representation.anchor(anchor, 0).recall(),
            readings.map_representation.anchor(anchor, 0).recall(),
        );
    }

    // Blocks of four rows form one clump each: neighbours on the
    // circle collapse onto shared labels, and the readings replay
    // from sorted orderings collapsed the same way.
    let labels: Vec<u32> = (0..10_u32).flat_map(|block| [block; 4]).collect();
    let grouped = Clumps::<NodeRowId>::from_labels(IdVec::from_raw(labels.clone()), 0.2);
    let readings = probe(
        &fixture.dataset(),
        fixture.corpus().with_clumps(&grouped),
        &options,
        Xoshiro256PlusPlus::seed_from_u64(11),
    )
    .await
    .expect("the corpus hosts the probe design");
    let clumps = readings
        .clumps
        .as_ref()
        .expect("the probe carried a grouping");
    assert_eq!(clumps.groups, 10);
    assert_eq!(clumps.grouped_rows, 40);

    let representations = fixture.representations();
    let anchor_rows = indices_of(&readings.anchors);
    let universe: Vec<usize> = (0..fixture.node_ids.len())
        .filter(|row| !anchor_rows.contains(row))
        .collect();
    for (index, &anchor) in anchor_rows.iter().enumerate() {
        let top_by = |distances: &dyn Fn(usize) -> f32| -> Vec<usize> {
            let mut rows = universe.clone();
            rows.sort_unstable_by(|&one, &other| {
                distances(one)
                    .total_cmp(&distances(other))
                    .then_with(|| one.cmp(&other))
            });
            rows.truncate(k);
            rows
        };
        let reference_rows =
            top_by(&|row: usize| representations[anchor].cosine_distance(&representations[row]));
        let map_rows = top_by(&|row: usize| {
            fixture.coordinates[anchor].distance_squared(fixture.coordinates[row])
        });

        let mut reference_labels: Vec<u32> =
            reference_rows.iter().map(|&row| labels[row]).collect();
        let mut map_labels: Vec<u32> = map_rows.iter().map(|&row| labels[row]).collect();
        let mut expected = ClumpAggregate::new(k.try_into().expect("nonzero"));
        expected.observe(&mut reference_labels, &mut map_labels);

        let cell = clumps.map_representation.anchor(index, 0);
        assert_eq!(
            *cell, expected,
            "anchor {anchor} disagrees with the collapsed sorting reference",
        );
        // The law: collapsing row identity can only help recall.
        assert!(cell.recall() >= readings.map_representation.anchor(index, 0).recall());
    }
}

/// Hand-built readings.
///
/// Six single-query anchors at k = 1 over a universe of 8, each a plain hit (rank 0) or a horizon
/// miss (rank 7), reused for all four grids.
fn flag_fixture(hits: &[bool]) -> ProbeReadings<NodeRowId> {
    let cells: Vec<Vec<NeighbourhoodAggregate>> = hits
        .iter()
        .map(|&hit| {
            let mut aggregate =
                NeighbourhoodAggregate::new(8, NonZero::new(1).expect("nonzero"), 2)
                    .expect("1 <= 8 / 2 and 1 <= 2 <= 8");
            let rank = if hit { [0] } else { [7] };
            aggregate.observe_ranks(&rank, &rank);
            vec![aggregate]
        })
        .collect();

    ProbeReadings {
        anchors: (0..hits.len()).map(NodeRowId::from_usize).collect(),
        comparisons: Box::new([]),
        neighbourhoods: Box::new([NonZero::new(1).expect("nonzero")]),
        map_representation: ReadingGrid::from_anchor_cells(cells.clone(), 1),
        clumps: None,
        sampled_map_representation: ReadingGrid::from_anchor_cells(cells.clone(), 1),
        sampled_map_canonical: ReadingGrid::from_anchor_cells(cells.clone(), 1),
        sampled_representation_canonical: ReadingGrid::from_anchor_cells(cells, 1),
        radii: hits
            .iter()
            .map(|_| RadiusPair {
                map: 1.0,
                representation: 1.0,
            })
            .collect(),
        triplet_pairs: Box::new([]),
        triplet_map_representation: vec![agreed(); hits.len()].into(),
        triplet_map_canonical: vec![agreed(); hits.len()].into(),
        triplet_representation_canonical: vec![agreed(); hits.len()].into(),
    }
}

/// One preserved triplet observation.
///
/// The verdict demands present triplet evidence, so the fixture carries the minimum.
fn agreed() -> TripletAggregate {
    let mut aggregate = TripletAggregate::default();
    aggregate.observe(true);
    aggregate
}

/// A `[0, 1]` control value.
fn fraction(value: f64) -> UnitFraction {
    UnitFraction::new(value).expect("test fractions lie inside [0, 1]")
}

/// A density-spread ceiling.
#[expect(
    clippy::cast_possible_truncation,
    reason = "test ceilings are small round values the f32 range carries exactly enough"
)]
fn ceiling(value: f64) -> NonNegative {
    NonNegative::new(value as f32).expect("test ceilings are finite and non-negative")
}

fn types_of(rows: &[&[u64]]) -> Vec<SmallVec<OntologyRowId, 2>> {
    rows.iter()
        .map(|types| types.iter().map(|&row| OntologyRowId::new(row)).collect())
        .collect()
}

/// Hand-computed subgroup rule.
///
/// Degradations, the 2x factor, the anchor floor, and multi-typed anchors counting in every group.
#[test]
fn assess_flags_degraded_subgroups() {
    // Anchors 0-3 hit, 4-5 miss: overall recall 2/3, degradation 1/3.
    let readings = flag_fixture(&[true, true, true, true, false, false]);
    // Type 100: four hits. Type 200: both misses. Type 300 spans one
    // of each through multi-typed anchors 0 and 4.
    let anchor_types = types_of(&[&[100, 300], &[100], &[100], &[100], &[200, 300], &[200]]);
    let thresholds = QualityThresholds {
        minimum_subgroup_anchors: 2,
        ..
    };

    let report = assess(&readings, &anchor_types, &thresholds);

    assert_eq!(report.anchors, 6);
    assert_eq!(report.corpus_universe, 8);
    assert_eq!(report.map_representation.len(), 1);
    let overall = report.map_representation[0];
    assert_eq!(overall.queries, 6);
    assert_eq!(overall.recall, 2.0 / 3.0);
    // The misses sit past the horizon in both directions.
    assert_eq!(overall.intrusion_rate, 1.0 / 3.0);
    assert_eq!(overall.extrusion_rate, 1.0 / 3.0);

    // Subgroups ascend by ontology row and count multi-typed anchors
    // in each of their groups.
    let by_row: Vec<(u64, usize, f64)> = report
        .subgroups
        .iter()
        .map(|subgroup| {
            (
                subgroup.ontology_row.as_u64(),
                subgroup.anchors,
                subgroup.rows[0].recall,
            )
        })
        .collect();
    assert_eq!(by_row, vec![(100, 4, 1.0), (200, 2, 0.0), (300, 2, 0.5)],);

    // Only type 200 breaches: degradation 1 > 2 · (1/3). Type 300's
    // 1/2 stays inside 2/3; type 100 has no degradation at all.
    assert_eq!(report.flags.len(), 1);
    let flag = report.flags[0];
    assert_eq!(flag.ontology_row, OntologyRowId::new(200));
    assert_eq!(flag.neighbourhood, 1);
    assert_eq!(flag.anchors, 2);
    assert_eq!(flag.degradation, 1.0);
    // One minus the recall quotient, not fl(1/3): the report derives
    // degradation by subtraction.
    assert_eq!(flag.overall_degradation, 1.0 - 2.0 / 3.0);
    // Flags are report-only triage: the flagged report still admits
    // when the pinned battery holds.
    assert!(report.passes());

    // Raising the anchor floor above the subgroup's size silences the
    // flag but keeps the subgroup's rows in the report.
    let floored = assess(
        &readings,
        &anchor_types,
        &QualityThresholds {
            minimum_subgroup_anchors: 3,
            ..
        },
    );
    assert!(floored.flags.is_empty());
    assert_eq!(floored.subgroups.len(), 3);
    assert!(floored.passes());
}

/// A clump readings block over the flag fixture.
///
/// One k = 1 cell per anchor, its collapsed neighbourhood matched or not.
fn clump_readings_of(matches: &[bool]) -> ClumpReadings {
    let cells: Vec<Vec<ClumpAggregate>> = matches
        .iter()
        .map(|&matched| {
            let mut aggregate = ClumpAggregate::new(NonZero::new(1).expect("nonzero"));
            aggregate.observe(&mut [0], &mut [u32::from(!matched)]);
            vec![aggregate]
        })
        .collect();

    ClumpReadings {
        epsilon: 0.15,
        count: 4,
        groups: 1,
        grouped_rows: 3,
        map_representation: ReadingGrid::from_anchor_cells(cells.clone(), 1),
        representation_canonical: ReadingGrid::from_anchor_cells(cells, 1),
    }
}

/// The clump-resolution triage rule.
///
/// A flag whose collapsed reading satisfies the factor is recorded as clump-resolved and stops
/// failing the verdict; one that stays degraded keeps failing.
#[test]
fn clump_resolution_triages_flags() {
    let anchor_types = types_of(&[&[100], &[100], &[100], &[100], &[200], &[200]]);
    let thresholds = QualityThresholds {
        minimum_subgroup_anchors: 2,
        ..
    };

    // Restored: the misses were clump siblings, so every collapsed
    // neighbourhood matches and both degradations read zero.
    let mut readings = flag_fixture(&[true, true, true, true, false, false]);
    readings.clumps = Some(clump_readings_of(&[true; 6]));
    let report = assess(&readings, &anchor_types, &thresholds);

    assert_eq!(report.flags.len(), 1);
    let flag = report.flags[0];
    assert_eq!(flag.ontology_row, OntologyRowId::new(200));
    assert_eq!(flag.clump_degradation, Some(0.0));
    assert_eq!(flag.clump_overall_degradation, Some(0.0));
    assert!(flag.clump_resolved);
    assert!(report.passes());

    let clumps = report
        .clumps
        .as_ref()
        .expect("the readings carried a grouping");
    assert_eq!(clumps.epsilon, 0.15);
    assert_eq!(clumps.groups, 1);
    assert_eq!(clumps.map_representation.len(), 1);
    assert_eq!(clumps.map_representation[0].neighbourhood, 1);
    assert_eq!(clumps.map_representation[0].queries, 6);
    assert_eq!(clumps.map_representation[0].recall, 1.0);
    // The fixture reuses the collapsed cells for the baseline grid, so
    // its rendered rows and the subgroup stratification read the same.
    assert_eq!(clumps.representation_canonical, clumps.map_representation);
    assert_eq!(report.baseline_subgroups.len(), 2);
    assert_eq!(report.baseline_subgroups[0].rows[0].clump_recall, Some(1.0),);

    let serialized = serde_json::to_string(&report).expect("the report serializes");
    let roundtrip: super::report::QualityReport =
        serde_json::from_str(&serialized).expect("the report deserializes");
    assert_eq!(roundtrip, report);

    // Unresolved: the collapse restores nothing, so the flag keeps
    // its breach - 1 against twice the overall 1 - 4/6.
    let mut readings = flag_fixture(&[true, true, true, true, false, false]);
    readings.clumps = Some(clump_readings_of(&[true, true, true, true, false, false]));
    let report = assess(&readings, &anchor_types, &thresholds);

    assert_eq!(report.flags.len(), 1);
    let flag = report.flags[0];
    assert_eq!(flag.clump_degradation, Some(1.0));
    assert_eq!(flag.clump_overall_degradation, Some(1.0 - 4.0 / 6.0));
    assert!(!flag.clump_resolved);
    // Triage is report-only: the unresolved flag informs the human,
    // never the admission.
    assert!(report.passes());
}

/// Hand-computed density rows: log ratios, the median/MAD spread, and degenerate-radius exclusion.
#[test]
fn assess_reads_density_from_radii() {
    let mut readings = flag_fixture(&[true, true, true]);
    // Ratios ln 2 and ln 4; the zero map radius is degenerate.
    readings.radii = Box::new([
        RadiusPair {
            map: 2.0,
            representation: 1.0,
        },
        RadiusPair {
            map: 4.0,
            representation: 1.0,
        },
        RadiusPair {
            map: 0.0,
            representation: 1.0,
        },
    ]);

    let report = assess(
        &readings,
        &types_of(&[&[], &[], &[]]),
        &QualityThresholds::default(),
    );

    assert_eq!(report.density.len(), 1);
    let row = report.density[0];
    assert_eq!(row.neighbourhood, 1);
    assert_eq!(row.anchors, 2);
    assert_eq!(row.degenerate, 1);
    // Mirror the derivation: ln radii differences, midpoint median,
    // midpoint of the absolute deviations.
    let (low, high) = (2.0_f64.ln(), 4.0_f64.ln());
    let median = f64::midpoint(low, high);
    assert_eq!(row.median_log_ratio, Some(median));
    assert_eq!(
        row.spread,
        Some(f64::midpoint((low - median).abs(), (high - median).abs())),
    );

    // A pinned ceiling above the spread passes; below it fails.
    let spread = row.spread.expect("two anchors contribute");
    let lenient = assess(
        &readings,
        &types_of(&[&[], &[], &[]]),
        &QualityThresholds {
            maximum_density_spread: ceiling(spread + 1e-3),
            ..
        },
    );
    assert!(lenient.passes());
    let strict = assess(
        &readings,
        &types_of(&[&[], &[], &[]]),
        &QualityThresholds {
            maximum_density_spread: ceiling(spread / 2.0),
            ..
        },
    );
    assert!(!strict.passes());
}

/// Pinned thresholds on absent evidence fail closed.
#[test]
fn assess_fails_pinned_thresholds_without_evidence() {
    // Every radius degenerate: the density reading is absent.
    let mut readings = flag_fixture(&[true, true]);
    readings.radii = Box::new([
        RadiusPair {
            map: 0.0,
            representation: 1.0,
        },
        RadiusPair {
            map: 0.0,
            representation: 1.0,
        },
    ]);
    let types = types_of(&[&[], &[]]);

    let report = assess(
        &readings,
        &types,
        &QualityThresholds {
            maximum_density_spread: ceiling(1.0),
            ..
        },
    );
    assert_eq!(report.density[0].anchors, 0);
    assert_eq!(report.density[0].spread, None);
    assert!(!report.passes());

    // Disabled triplet readings fail the verdict outright.
    let mut readings = flag_fixture(&[true, true]);
    readings.triplet_map_representation = vec![TripletAggregate::default(); 2].into();
    let report = assess(&readings, &types, &QualityThresholds::default());
    assert_eq!(report.triplet_map_representation.triplets, 0);
    assert!(!report.passes());
}

/// The neighbourhood controls demand a nonempty grid.
///
/// `all` over an empty grid is vacuously true; the verdict must not be. `assess` cannot emit an
/// empty grid (it reads rung 0 unconditionally and panics), but the report is a serializable
/// value whose verdict must hold under every construction - persisted reports get read back, and
/// a control over zero rungs is the same evidence absence as a density ceiling over absent
/// readings, failing the same way.
#[test]
fn neighbourhood_controls_demand_a_nonempty_grid() {
    let readings = flag_fixture(&[true, true]);
    let types = types_of(&[&[], &[]]);

    let mut report = assess(&readings, &types, &QualityThresholds::default());
    assert!(report.passes(), "the populated grid clears the defaults");

    report.map_representation.clear();
    assert!(
        !report.passes(),
        "a control without evidence fails, never vacuously passes",
    );
}

/// Override documents validate at the boundary.
///
/// A present field overrides its default after domain validation; an absent field keeps the
/// default; an out-of-domain value names its field; an unknown field refuses the document.
#[test]
fn threshold_overrides_validate_at_the_boundary() {
    let overrides: ThresholdOverrides =
        serde_json::from_str(r#"{"minimum_recall": 0.25}"#).expect("the partial document parses");
    let merged = QualityThresholds::default()
        .with_overrides(&overrides)
        .expect("an in-domain override merges");
    assert_eq!(merged.minimum_recall, fraction(0.25));
    assert_eq!(merged.maximum_intrusion_rate, UnitFraction::ONE);

    let refusals = [
        (r#"{"minimum_recall": -0.1}"#, "minimum_recall"),
        (
            r#"{"maximum_intrusion_rate": 1.5}"#,
            "maximum_intrusion_rate",
        ),
        (
            r#"{"maximum_density_spread": -1.0}"#,
            "maximum_density_spread",
        ),
        (
            r#"{"maximum_density_spread": 1e300}"#,
            "maximum_density_spread",
        ),
    ];
    for (document, field) in refusals {
        let overrides: ThresholdOverrides =
            serde_json::from_str(document).expect("the shape parses; the domain refuses");
        let error = QualityThresholds::default()
            .with_overrides(&overrides)
            .expect_err("an out-of-domain override refuses");
        assert_eq!(error.field, field);
    }

    assert!(
        serde_json::from_str::<ThresholdOverrides>(r#"{"minimum_recal": 0.5}"#).is_err(),
        "an unknown field refuses the document",
    );

    // The f64 domain check precedes narrowing: a negative underflow
    // would narrow to -0.0 and a value just above the f32 maximum
    // would round down onto it - both refuse as written.
    let underflow = ThresholdOverrides {
        maximum_density_spread: Some(-f64::MIN_POSITIVE),
        ..ThresholdOverrides::default()
    };
    assert_eq!(
        QualityThresholds::default()
            .with_overrides(&underflow)
            .expect_err("a negative underflow refuses")
            .field,
        "maximum_density_spread",
    );

    let boundary = ThresholdOverrides {
        maximum_density_spread: Some(f64::from(f32::MAX)),
        ..ThresholdOverrides::default()
    };
    let merged = QualityThresholds::default()
        .with_overrides(&boundary)
        .expect("the f32 maximum is the upper boundary and admits");
    assert_eq!(merged.maximum_density_spread.get(), f32::MAX);

    let above = ThresholdOverrides {
        maximum_density_spread: Some(f64::from(f32::MAX).next_up()),
        ..ThresholdOverrides::default()
    };
    assert_eq!(
        QualityThresholds::default()
            .with_overrides(&above)
            .expect_err("the value above the f32 maximum refuses, not rounds")
            .field,
        "maximum_density_spread",
    );
}

/// Floors bind the overall corpus readings.
#[test]
fn assess_applies_pinned_floors() {
    let readings = flag_fixture(&[true, true, false]);
    let anchor_types = types_of(&[&[], &[], &[]]);

    // Overall recall 2/3: a floor above it fails, one below passes.
    let strict = assess(
        &readings,
        &anchor_types,
        &QualityThresholds {
            minimum_recall: fraction(0.9),
            ..
        },
    );
    assert!(!strict.passes());

    let lenient = assess(
        &readings,
        &anchor_types,
        &QualityThresholds {
            minimum_recall: fraction(0.5),
            maximum_intrusion_rate: fraction(0.5),
            ..
        },
    );
    assert!(lenient.passes());
}

/// The report wires from a live probe and survives serialization.
#[tokio::test]
async fn assess_reads_a_probed_fixture() {
    let fixture = ProbeFixture::on_circle(&irregular_angles(48));
    let options = ProbeOptions {
        anchors: 5.try_into().expect("nonzero"),
        comparisons: 12.try_into().expect("nonzero"),
        neighbourhoods: vec![2.try_into().expect("nonzero")].into(),
        ..ProbeOptions::default()
    };
    let readings = probe(
        &fixture.dataset(),
        fixture.corpus(),
        &options,
        Xoshiro256PlusPlus::seed_from_u64(7),
    )
    .await
    .expect("the corpus hosts the probe design");

    // A perfect map passes floors pinned at their maxima, and every
    // anchor's type survives the trip into subgroup rows.
    let anchor_types = types_of(&[&[9], &[9], &[9], &[9], &[9]]);
    let report = assess(
        &readings,
        &anchor_types,
        &QualityThresholds {
            minimum_recall: UnitFraction::ONE,
            minimum_trustworthiness: UnitFraction::ONE,
            minimum_continuity: UnitFraction::ONE,
            maximum_intrusion_rate: UnitFraction::ZERO,
            minimum_triplet_agreement: UnitFraction::ONE,
            minimum_subgroup_anchors: 5,
            ..
        },
    );

    assert!(report.passes());
    assert_eq!(report.corpus_universe, 43);
    assert_eq!(report.subgroups.len(), 1);
    assert_eq!(report.subgroups[0].anchors, 5);
    assert_eq!(report.subgroups[0].rows[0].recall, 1.0);
    // Every space orders the circle identically, so all triplet pairs
    // agree; the metric warp between chord and cosine distance keeps
    // the density reading present and finite.
    assert_eq!(report.triplet_map_representation.agreement, 1.0);
    assert_eq!(report.triplet_map_canonical.agreement, 1.0);
    assert_eq!(report.triplet_representation_canonical.agreement, 1.0);
    assert_eq!(report.density[0].degenerate, 0);
    assert!(
        report.density[0]
            .spread
            .expect("every anchor contributes")
            .is_finite()
    );
    assert_eq!(
        report.sampled_representation_canonical[0].recall, 1.0,
        "the representation baseline reads the zero-padded canonical space as identical",
    );

    let serialized = serde_json::to_string(&report).expect("the report serializes");
    let roundtrip: super::report::QualityReport =
        serde_json::from_str(&serialized).expect("the report deserializes");
    assert_eq!(roundtrip, report);
}

#[tokio::test]
async fn probe_rejects_impossible_designs() {
    let fixture = ProbeFixture::on_circle(&irregular_angles(12));

    // The corpus cannot host disjoint samples of 8 + 8.
    let crowded = ProbeOptions {
        anchors: 8.try_into().expect("nonzero"),
        comparisons: 8.try_into().expect("nonzero"),
        neighbourhoods: vec![2.try_into().expect("nonzero")].into(),
        ..ProbeOptions::default()
    };
    assert_matches!(
        probe(
            &fixture.dataset(),
            fixture.corpus(),
            &crowded,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::Design { rows: 12, .. }),
    );

    // A neighbourhood of 3 exceeds half the 4-row comparison universe.
    let oversized = ProbeOptions {
        anchors: 2.try_into().expect("nonzero"),
        comparisons: 4.try_into().expect("nonzero"),
        neighbourhoods: vec![3.try_into().expect("nonzero")].into(),
        ..ProbeOptions::default()
    };
    assert_matches!(
        probe(
            &fixture.dataset(),
            fixture.corpus(),
            &oversized,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::Neighbourhood { k: 3, universe: 4 }),
    );

    // An empty neighbourhood ladder reads nothing.
    let empty = ProbeOptions {
        anchors: 2.try_into().expect("nonzero"),
        comparisons: 4.try_into().expect("nonzero"),
        neighbourhoods: Vec::new().into(),
        ..ProbeOptions::default()
    };
    assert_matches!(
        probe(
            &fixture.dataset(),
            fixture.corpus(),
            &empty,
            Xoshiro256PlusPlus::seed_from_u64(0),
        )
        .await,
        Err(ProbeError::NoNeighbourhoods),
    );
}

const RUNNER_NODES: usize = 48;

fn runner_scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-quality-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    dir
}

/// A probe-scale corpus for publishing through the real fit.
///
/// Unit-norm pseudo-random representations whose canonical embeddings extend them with zeros, one
/// node type alternating between two ontology rows, and one link type.
fn runner_dataset() -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0xE7A);
    let mut canonical = HashMap::new();

    let nodes = (0..RUNNER_NODES)
        .map(|row| {
            let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
            for component in &mut components {
                *component = rng.random::<f32>() - 0.5;
            }
            let norm = components
                .iter()
                .map(|&component| f64::from(component) * f64::from(component))
                .sum::<f64>()
                .sqrt();
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the normalization factor of a 512-component vector is far inside f32 \
                          range"
            )]
            for component in &mut components {
                *component = (f64::from(*component) / norm) as f32;
            }

            let mut extended = BoxedVecN::<CANONICAL_DIMENSIONS>::zero();
            extended.as_array_mut()[..PROJECTOR_DIMENSIONS].copy_from_slice(&components);
            canonical.insert(row as u64, extended);

            Node {
                id: U64::<LE>::new(row as u64),
                ontology: smallvec![OntologyRowId::from_usize(row & 1)],
                embedding: BoxedVecN::new(&VecN::new(components)),
                confidence: None,
            }
        })
        .collect();

    let edges = vec![Edge {
        id: U64::<LE>::new(100),
        source: NodeRowId::new(0),
        target: NodeRowId::new(1),
        ontology: smallvec![OntologyRowId::new(2)],
        embedding: None,
        confidence: None,
        source_confidence: None,
        target_confidence: None,
    }];

    let ontology = vec![
        Ontology {
            id: U64::<LE>::new(0),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(1),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(2),
            parents: smallvec![],
        },
    ];

    let cards = HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, canonical, cards)
}

/// A deterministic provider deriving each embedding from its text hash.
struct HashEmbedder;

impl CardEmbedder for HashEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"quality runner test embedder");
        EmbedderFingerprint::new(hasher.finalize())
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.as_bytes());
                let bytes = hasher.finalize().to_bytes();

                let mut vector = BoxedVecN::zero();
                for (component, &byte) in vector.as_array_mut().iter_mut().zip(bytes.iter().cycle())
                {
                    *component = f32::from(byte) / 255.0;
                }
                vector
            })
            .collect()))
    }
}

/// A deterministic classifier fitted from a synthetic corpus.
///
/// The supplied model input of the fixture fit.
fn runner_classifier() -> ClassifierInput {
    const ROWS: usize = 4;
    // Coprime to the dimension, so no two corpus rows repeat.
    const PATTERN: [f32; 13] = [
        -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75,
    ];

    let mut storage = BoxedVecN::<{ ROWS * CANONICAL_DIMENSIONS }>::zero();
    for (component, &value) in storage
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle())
    {
        *component = value;
    }
    let embeddings = AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned");

    let rows: Vec<TrainingRow> = [
        ([0.7, 0.2, 0.1], b"group-a" as &[u8]),
        ([0.2, 0.6, 0.2], b"group-b"),
        ([0.1, 0.2, 0.7], b"group-c"),
        ([0.3, 0.4, 0.3], b"group-d"),
    ]
    .into_iter()
    .map(|(target, group)| {
        let mut hasher = Sha256::new();
        hasher.update(group);
        TrainingRow {
            target,
            weight: 1.0,
            group: hasher.finalize(),
        }
    })
    .collect();

    let training = TrainingSet::new(embeddings, &rows).expect("the fixture corpus validates");
    let classifier = fit_classifier(training, ClassifierFitConfig { folds: 2, .. }, &NoProgress)
        .expect("the fixture classifier fits")
        .classifier;

    let mut hasher = Sha256::new();
    hasher.update(b"fixture classifier artifact");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

/// The runner fixture's probe design.
///
/// A handful of anchors and comparisons sized to the 48-row corpus.
fn runner_probe_options() -> QualityRunOptions {
    QualityRunOptions {
        probe: ProbeOptions {
            anchors: NonZero::new(8).expect("nonzero"),
            comparisons: NonZero::new(16).expect("nonzero"),
            neighbourhoods: Cow::Owned(vec![
                NonZero::new(2).expect("nonzero"),
                NonZero::new(4).expect("nonzero"),
            ]),
            triplet_pairs: 8,
            ..
        },
        ..
    }
}

/// The runner end to end.
///
/// The real fit publishes a generation, the runner reopens its artifacts, probes them against the
/// same dataset, resolves anchor types, and reports.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn runner_reports_a_published_generation() {
    let path = runner_scratch("runner");
    let root = GenerationRoot::new(&path).expect("the root should open");
    let dataset = runner_dataset();
    let classifier = runner_classifier();
    let config = FitConfig {
        seed: 7,
        selection: SelectionOptions {
            maximum_count: NonZero::new(8).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
        neighbours: NonZero::new(4).expect("the fixture neighbour count is nonzero"),
        // The quality fixture probes the metric suite, not the
        // placement: it opts out of the default's training run.
        placement: PlacementOptions::LandmarkBaseline,
        ..
    };

    let published = fit(
        &dataset,
        &HashEmbedder,
        &config,
        Supplies {
            classifier: &classifier,
            ..
        },
        &root,
        &NoProgress,
    )
    .await
    .expect("the fit should publish");
    let generation = root
        .open(published.id())
        .expect("the published generation should open");

    let options = runner_probe_options();
    let report = run(
        &dataset,
        &generation,
        &options,
        Xoshiro256PlusPlus::seed_from_u64(3),
    )
    .await
    .expect("the run should produce a report");

    // The probe design landed as configured.
    assert_eq!(report.anchors, 8);
    assert_eq!(report.corpus_universe, RUNNER_NODES - 8);
    assert_eq!(report.comparisons, 16);

    // Anchor types resolved through the dataset's probe-scoped stream:
    // every anchor carries exactly one of the two node types.
    assert!(!report.subgroups.is_empty());
    assert_eq!(
        report
            .subgroups
            .iter()
            .map(|subgroup| subgroup.anchors)
            .sum::<usize>(),
        8,
    );
    assert!(
        report
            .subgroups
            .iter()
            .all(|subgroup| subgroup.ontology_row.as_u64() < 2),
        "only the two node types carry anchors",
    );

    // Zero-extended canonical embeddings rank identically to the
    // representation, so the baseline reads as perfect.
    for row in &report.sampled_representation_canonical {
        assert_eq!(row.recall, 1.0);
    }
    for subgroup in &report.baseline_subgroups {
        for row in &subgroup.rows {
            assert_eq!(row.recall, 1.0);
        }
    }

    // Pseudo-random unit vectors sit far above the clump threshold:
    // the grouping is all singletons, and every collapsed reading
    // equals its plain reading bit for bit (the singleton law).
    let clumps = report.clumps.as_ref().expect("the runner groups clumps");
    assert_eq!(clumps.count, RUNNER_NODES);
    assert_eq!(clumps.groups, 0);
    for (collapsed, plain) in clumps
        .map_representation
        .iter()
        .zip(&report.map_representation)
    {
        assert_eq!(collapsed.neighbourhood, plain.neighbourhood);
        assert_eq!(collapsed.recall, plain.recall);
    }
    for (collapsed, plain) in clumps
        .representation_canonical
        .iter()
        .zip(&report.sampled_representation_canonical)
    {
        assert_eq!(collapsed.recall, plain.recall);
    }
    for subgroup in &report.baseline_subgroups {
        for row in &subgroup.rows {
            assert_eq!(row.clump_recall, Some(row.recall));
        }
    }

    // Subgroups below the default anchor floor never flag. The verdict
    // still refuses: rung 2 of this landmark-baseline fixture reads
    // all-degenerate radii, so the density evidence is absent there and
    // the gate fails closed on absence, permissive ceilings included.
    assert!(report.flags.is_empty());
    assert!(
        report.density[0].spread.is_none(),
        "the small rung's density evidence is absent on this fixture",
    );
    assert!(!report.passes());
}
