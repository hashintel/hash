#![expect(
    clippy::integer_division_remainder_used,
    reason = "test data generation folds indices into cyclic patterns by modulus"
)]
#![expect(
    clippy::little_endian_bytes,
    reason = "corruption fixtures pin the format's canonical little-endian bytes"
)]

use core::{assert_matches, num::NonZero};
use std::{fs, path::PathBuf};

use hashql_core::id::{Id, IdSlice};
use rand::{Rng, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;
use rayon::ThreadPoolBuilder;

use super::{
    artifact::{InvalidLandmarkFile, LandmarkSkeleton, LandmarkSkeletonArchive},
    assignment::{AssignmentError, LandmarkAssignment, assign_landmarks},
    layout::{
        EdgelessGraphError, LayoutOptions, LearningRate, RepulsionStrength, layout_landmarks,
    },
    quotient::{QuotientError, QuotientOptions, quotient_graph},
    select::{
        LandmarkCandidate, LandmarkOrdinal, LandmarkSelection, SamplingWeight, SelectionError,
        SelectionOptions, Subgroup, SubgroupAxes, SubgroupDimension, SubgroupMinimum,
        select_landmarks,
    },
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{WriteInto as _, landmark::read::LandmarkFile},
    identity::NodeRowId,
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Vec2},
    salt::{
        knn::{Embedding, NearestNeighboursIndex, Neighbour},
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

fn rng() -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(42)
}

/// Runs the task in a dedicated rayon pool of `threads` workers.
fn in_pool<T: Send>(threads: usize, task: impl FnOnce() -> T + Send) -> T {
    ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .expect("the test pool builds")
        .install(task)
}

fn candidate(row: u64) -> LandmarkCandidate<NodeRowId> {
    LandmarkCandidate {
        row: NodeRowId::new(row),
        sampling_weight: SamplingWeight::UNIFORM,
        axes: SubgroupAxes::default(),
        prior_landmark: false,
    }
}

fn candidates(count: u64) -> Vec<LandmarkCandidate<NodeRowId>> {
    (0..count).map(candidate).collect()
}

fn options(maximum: u32) -> SelectionOptions {
    SelectionOptions {
        maximum_count: NonZero::new(maximum).expect("test capacities are nonzero"),
        ..
    }
}

/// Calls [`select_landmarks`] over plain fixture slices.
fn select<R: Rng + SeedableRng>(
    candidates: &[LandmarkCandidate<NodeRowId>],
    minimums: &[SubgroupMinimum],
    options: SelectionOptions,
    rng: R,
) -> Result<LandmarkSelection<NodeRowId>, SelectionError> {
    select_landmarks(
        IdSlice::from_raw(candidates),
        IdSlice::from_raw(minimums),
        options,
        rng,
    )
}

#[test]
fn selection_is_deterministic_under_a_seed() {
    let candidates = candidates(100);
    let first =
        select(&candidates, &[], options(10), rng()).expect("the unconstrained selection succeeds");
    let second =
        select(&candidates, &[], options(10), rng()).expect("the unconstrained selection succeeds");

    assert_eq!(first, second);
    assert_eq!(first.len(), 10);
    assert!(
        first.rows().iter().is_sorted_by(|left, right| left < right),
        "selected rows are strictly ascending"
    );

    let third = select(
        &candidates,
        &[],
        options(10),
        Xoshiro256PlusPlus::seed_from_u64(43),
    )
    .expect("the unconstrained selection succeeds");
    assert_ne!(first, third, "a different seed draws a different selection");
}

#[test]
fn selection_covers_a_small_corpus_entirely() {
    let candidates = candidates(4);
    let selection =
        select(&candidates, &[], options(100), rng()).expect("a small corpus selects wholesale");

    assert_eq!(selection.len(), 4);
}

#[test]
fn selection_honors_subgroup_minimums() {
    // Rows 90..100 carry language 7; demand five of them.
    let mut candidates = candidates(100);
    for candidate in &mut candidates[90..100] {
        candidate.axes[SubgroupDimension::Language] = 7;
    }
    let subgroup = Subgroup {
        dimension: SubgroupDimension::Language,
        value: 7,
    };

    let selection = select(
        &candidates,
        &[SubgroupMinimum {
            subgroup,
            count: NonZero::new(5).expect("five is nonzero"),
        }],
        options(8),
        rng(),
    )
    .expect("the minimum is satisfiable");

    let selected_in_subgroup = selection
        .rows()
        .iter()
        .filter(|row| row.as_u64() >= 90)
        .count();
    assert!(
        selected_in_subgroup >= 5,
        "{selected_in_subgroup} subgroup rows selected where the minimum demands 5",
    );
    assert_eq!(selection.len(), 8);
}

#[test]
fn selection_prefers_heavier_candidates() {
    // Rows 0..10 carry a thousandfold weight; across many seeds they
    // dominate a capacity-10 selection of 200 candidates.
    let mut candidates = candidates(200);
    for candidate in &mut candidates[..10] {
        candidate.sampling_weight = SamplingWeight::new(1000.0).expect("a thousand is a weight");
    }

    let mut heavy_selected = 0_usize;
    for seed in 0..50 {
        let selection = select(
            &candidates,
            &[],
            options(10),
            Xoshiro256PlusPlus::seed_from_u64(seed),
        )
        .expect("the unconstrained selection succeeds");
        heavy_selected += selection
            .rows()
            .iter()
            .filter(|row| row.as_u64() < 10)
            .count();
    }

    assert!(
        heavy_selected >= 450,
        "{heavy_selected}/500 heavy selections; weighted sampling should select nearly all of the \
         thousandfold-weighted rows",
    );
}

#[test]
fn selection_retains_prior_landmarks() {
    // A quarter of a capacity-20 selection is reserved for the ten
    // prior landmarks at rows 100..110.
    let mut candidates = candidates(200);
    for candidate in &mut candidates[100..110] {
        candidate.prior_landmark = true;
    }

    let selection =
        select(&candidates, &[], options(20), rng()).expect("the unconstrained selection succeeds");

    assert!(
        selection.retained_count() >= 5,
        "{} prior landmarks retained where the target reserves 5",
        selection.retained_count(),
    );
}

#[test]
fn selection_rejects_malformed_inputs() {
    assert_eq!(
        select(&[], &[], options(10), rng()),
        Err(SelectionError::EmptyCorpus),
    );

    let mut unordered = candidates(4);
    unordered.swap(1, 2);
    assert_eq!(
        select(&unordered, &[], options(10), rng()),
        Err(SelectionError::UnorderedCandidates { index: 2 }),
    );

    let subgroup = Subgroup {
        dimension: SubgroupDimension::Source,
        value: 0,
    };
    let minimum = SubgroupMinimum {
        subgroup,
        count: NonZero::new(1).expect("one is nonzero"),
    };
    assert_eq!(
        select(&candidates(4), &[minimum, minimum], options(10), rng()),
        Err(SelectionError::DuplicateMinimum { subgroup }),
    );
}

#[test]
fn constrained_scalars_reject_out_of_domain_values() {
    assert_eq!(SamplingWeight::new(0.0), None);
    assert_eq!(SamplingWeight::new(-1.0), None);
    assert_eq!(SamplingWeight::new(f64::NAN), None);
    assert_eq!(SamplingWeight::new(f64::INFINITY), None);
    assert_eq!(SamplingWeight::new(1.0), Some(SamplingWeight::UNIFORM));

    assert_eq!(LearningRate::new(0.0), None);
    assert_eq!(LearningRate::new(f32::NAN), None);
    assert!(LearningRate::new(0.5).is_some());

    assert!(RepulsionStrength::new(0.0).is_some());
    assert_eq!(RepulsionStrength::new(-1.0), None);
    assert_eq!(RepulsionStrength::new(f32::INFINITY), None);
}

#[test]
fn selection_rejects_unsatisfiable_minimums() {
    let subgroup = Subgroup {
        dimension: SubgroupDimension::Community,
        value: 9,
    };

    // Nothing carries community 9.
    assert_eq!(
        select(
            &candidates(10),
            &[SubgroupMinimum {
                subgroup,
                count: NonZero::new(2).expect("two is nonzero"),
            }],
            options(5),
            rng(),
        ),
        Err(SelectionError::InsufficientSubgroup {
            subgroup,
            required: 2,
            available: 0,
        }),
    );

    // The minimum alone exceeds the capacity.
    let mut tagged = candidates(10);
    for candidate in &mut tagged {
        candidate.axes[SubgroupDimension::Community] = 9;
    }
    assert_eq!(
        select(
            &tagged,
            &[SubgroupMinimum {
                subgroup,
                count: NonZero::new(6).expect("six is nonzero"),
            }],
            options(5),
            rng(),
        ),
        Err(SelectionError::MinimumExceedsCapacity {
            requested: 6,
            capacity: 5,
        }),
    );
}

#[test]
fn selection_counts_rows_toward_every_minimum_they_satisfy() {
    // Rows 0..4 carry both marked axes, so the same three rows can
    // satisfy both three-row minimums at once; a capacity of three
    // suffices. Counting the overlap per minimum would demand six rows
    // and fail with MinimumExceedsCapacity.
    let mut candidates = candidates(50);
    for candidate in &mut candidates[..4] {
        candidate.axes[SubgroupDimension::Language] = 7;
        candidate.axes[SubgroupDimension::Community] = 3;
    }

    let minimums = [
        SubgroupMinimum {
            subgroup: Subgroup {
                dimension: SubgroupDimension::Language,
                value: 7,
            },
            count: NonZero::new(3).expect("three is nonzero"),
        },
        SubgroupMinimum {
            subgroup: Subgroup {
                dimension: SubgroupDimension::Community,
                value: 3,
            },
            count: NonZero::new(3).expect("three is nonzero"),
        },
    ];

    let selection = select(&candidates, &minimums, options(3), rng())
        .expect("three rows satisfy both minimums at once");

    assert_eq!(selection.len(), 3);
    assert!(
        selection.rows().iter().all(|row| row.as_u64() < 4),
        "every selected row carries both subgroups",
    );
}

#[test]
fn selection_is_invariant_across_thread_counts() {
    // Ten thousand candidates span three seeded priority chunks, with
    // weights, retention flags, and a minimum in play: the one-worker
    // and eight-worker pools must select bit-equal rows.
    let mut candidates = candidates(10_000);
    for (index, candidate) in (0_u32..).zip(&mut candidates) {
        candidate.sampling_weight =
            SamplingWeight::new(1.0 + f64::from(index % 7)).expect("small offsets are weights");
        candidate.prior_landmark = index % 13 == 0;
        candidate.axes[SubgroupDimension::Language] = index % 3;
    }
    let minimums = [SubgroupMinimum {
        subgroup: Subgroup {
            dimension: SubgroupDimension::Language,
            value: 2,
        },
        count: NonZero::new(40).expect("forty is nonzero"),
    }];

    let single = in_pool(1, || select(&candidates, &minimums, options(128), rng()))
        .expect("the selection succeeds");
    let many = in_pool(8, || select(&candidates, &minimums, options(128), rng()))
        .expect("the selection succeeds");

    assert_eq!(single, many);
}

/// A brute-force cosine backend over resident rows.
struct ExactIndex {
    rows: Vec<(NodeRowId, BoxedVecN<PROJECTOR_DIMENSIONS>)>,
}

impl ExactIndex {
    fn new() -> Self {
        Self { rows: Vec::new() }
    }
}

impl NearestNeighboursIndex<NodeRowId> for ExactIndex {
    type Error = !;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding, NodeRowId>>,
    ) -> Result<(), Self::Error> {
        self.rows.extend(embeddings.into_iter().map(|embedding| {
            let mut boxed = BoxedVecN::zero();
            boxed
                .as_array_mut()
                .copy_from_slice(embedding.components.as_array());
            (embedding.id, boxed)
        }));
        Ok(())
    }

    fn build<P>(
        &mut self,
        _: impl rand::Rng + rand::SeedableRng,
        _progress: &P,
    ) -> Result<(), Self::Error>
    where
        P: crate::progress::Progress,
    {
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let mut all: Vec<Neighbour<NodeRowId>> = self
            .rows
            .iter()
            .map(|(id, stored)| Neighbour {
                id: *id,
                distance: query.cosine_distance(stored),
            })
            .collect();
        all.sort_unstable_by(|left, right| {
            left.distance
                .total_cmp(&right.distance)
                .then_with(|| left.id.as_u64().cmp(&right.id.as_u64()))
        });
        all.truncate(limit);
        Ok(all)
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let stored = self
            .rows
            .iter()
            .find(|(row, _)| *row == id)
            .map(|(_, stored)| {
                let mut copy = BoxedVecN::zero();
                copy.as_array_mut().copy_from_slice(stored.as_array());
                copy
            })
            .expect("searched ids are inserted rows");
        let mut found: Vec<Neighbour<NodeRowId>> = self
            .search_by_vector(&stored, limit + 1)?
            .into_iter()
            .filter(|neighbour| neighbour.id != id)
            .collect();
        found.truncate(limit);
        Ok(found)
    }
}

/// Six rows in three well-separated directions.
///
/// Rows 0 and 1 point one way, 2 and 3 another, 4 and 5 a third.
fn clustered_embeddings() -> Vec<BoxedVecN<PROJECTOR_DIMENSIONS>> {
    let directions = [(0_usize, 1_usize), (2, 3), (4, 5)];
    let mut rows = Vec::new();
    for (main, side) in directions {
        for member in 0..2 {
            let mut boxed = BoxedVecN::<PROJECTOR_DIMENSIONS>::zero();
            let array = boxed.as_array_mut();
            // Unit vectors tilted slightly per member keep members of
            // one cluster nearer to each other than to other clusters.
            let tilt = if member == 0 { 0.0_f32 } else { 0.1 };
            let norm = (1.0 + tilt * tilt).sqrt();
            array[main] = 1.0 / norm;
            array[side] = tilt / norm;
            rows.push(boxed);
        }
    }
    rows
}

/// Fixture rows in SIMD-aligned row-major storage.
///
/// The shape a mapped `f32[N, 512]` artifact yields.
struct Matrix {
    storage: BoxedVecN<{ 8 * PROJECTOR_DIMENSIONS }>,
    rows: usize,
}

impl Matrix {
    fn new(rows: &[BoxedVecN<PROJECTOR_DIMENSIONS>]) -> Self {
        let mut storage = BoxedVecN::zero();
        let (chunks, _) = storage
            .as_array_mut()
            .as_chunks_mut::<PROJECTOR_DIMENSIONS>();
        assert!(rows.len() <= chunks.len(), "the fixture fits the capacity");
        for (slot, row) in chunks.iter_mut().zip(rows) {
            *slot = *row.as_array();
        }
        Self {
            storage,
            rows: rows.len(),
        }
    }

    fn view(&self) -> &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> {
        IdSlice::from_raw(
            AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * PROJECTOR_DIMENSIONS])
                .expect("boxed storage is aligned"),
        )
    }
}

fn selection_of(rows: &[u64]) -> super::select::LandmarkSelection<NodeRowId> {
    let candidates: Vec<LandmarkCandidate<NodeRowId>> =
        rows.iter().map(|&row| candidate(row)).collect();
    let capacity = u32::try_from(rows.len()).expect("test fixtures are small");
    select(&candidates, &[], options(capacity), rng()).expect("selecting every candidate succeeds")
}

/// Ordinals from bare positions, for fixtures.
fn ordinals(positions: &[u32]) -> Box<[LandmarkOrdinal]> {
    positions
        .iter()
        .copied()
        .map(LandmarkOrdinal::new)
        .collect()
}

#[test]
fn assignment_maps_rows_to_their_nearest_landmark() {
    let matrix = Matrix::new(&clustered_embeddings());
    // One landmark per cluster: rows 0, 2, 4.
    let selection = selection_of(&[0, 2, 4]);

    let assignment = assign_landmarks(&mut ExactIndex::new(), rng(), matrix.view(), &selection)
        .expect("the exact backend assigns every row");

    assert_eq!(
        assignment.as_slice().as_raw(),
        &*ordinals(&[0, 0, 1, 1, 2, 2])
    );
    assert_eq!(assignment.get(NodeRowId::new(3)), LandmarkOrdinal::new(1));
    assert_eq!(assignment.landmarks(), 3);
}

#[test]
fn assignment_rejects_landmarks_outside_the_corpus() {
    let matrix = Matrix::new(&clustered_embeddings());
    let selection = selection_of(&[0, 99]);

    let result = assign_landmarks(&mut ExactIndex::new(), rng(), matrix.view(), &selection);

    assert_matches!(
        result,
        Err(AssignmentError::UnknownRow { row, rows: 6 }) if row == NodeRowId::new(99),
    );
}

/// An assignment straight from ordinals, for quotient fixtures.
fn assignment_of(positions: &[u32], landmarks: usize) -> LandmarkAssignment<NodeRowId> {
    LandmarkAssignment::from_ordinals(IdSlice::from_boxed_slice(ordinals(positions)), landmarks)
}

/// A semantic graph over `count` rows from undirected weighted edges.
fn semantic_from_edges(count: usize, edges: &[(u32, u32, f32)]) -> SemanticGraph<NodeRowId> {
    let mut rows: Vec<Vec<(u32, f32)>> = vec![Vec::new(); count];
    for &(left, right, weight) in edges {
        rows[left as usize].push((right, weight));
        rows[right as usize].push((left, weight));
    }

    let mut indptr = vec![0_u64];
    let mut indices = Vec::new();
    let mut weights = Vec::new();
    for row in &mut rows {
        row.sort_unstable_by_key(|&(column, _)| column);
        indices.extend(row.iter().map(|&(column, _)| column));
        weights.extend(row.iter().map(|&(_, weight)| weight));
        indptr.push(indices.len() as u64);
    }
    let matrix = SemanticMatrix::try_new((count, count), indptr, indices, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture is structurally valid");
    SemanticGraph::new(matrix).expect("the fixture satisfies the graph invariants")
}

/// A corpus semantic graph over six rows.
///
/// Edges within clusters carry weight 1.0, one bridge edge (1, 2) carries 0.5, and one weaker
/// bridge (3, 4) carries 0.25.
fn corpus_graph() -> SemanticGraph<NodeRowId> {
    semantic_from_edges(
        6,
        &[
            (0, 1, 1.0),
            (2, 3, 1.0),
            (4, 5, 1.0),
            (1, 2, 0.5),
            (3, 4, 0.25),
        ],
    )
}

#[test]
fn quotient_contracts_cross_landmark_edges() {
    let graph = corpus_graph();
    let assignment = assignment_of(&[0, 0, 1, 1, 2, 2], 3);

    let quotient = quotient_graph(&graph.view(), &assignment, QuotientOptions { .. })
        .expect("the fixture quotient has edges");

    // Directed inflows: L0 <- 0.5 (edge 1-2), L1 <- 0.5 + 0.25, L2 <-
    // 0.25. Every row max-normalizes, then pairs combine by the
    // probabilistic union: (L0, L1) = 1 + 1 - 1 = 1.0 and (L1, L2) =
    // 0.5 + 1 - 0.5 = 1.0.
    let view = quotient.view();
    assert_eq!(view.rows(), 3);
    let row0: Vec<(u64, f32)> = view
        .row(LandmarkOrdinal::new(0))
        .map(|edge| (edge.id.as_u64(), edge.weight))
        .collect();
    let row1: Vec<(u64, f32)> = view
        .row(LandmarkOrdinal::new(1))
        .map(|edge| (edge.id.as_u64(), edge.weight))
        .collect();
    assert_eq!(row0, [(1, 1.0)]);
    assert_eq!(row1, [(0, 1.0), (2, 1.0)]);
}

#[test]
fn quotient_keeps_only_the_strongest_neighbours() {
    // A hub landmark connected to three others; a neighbour cap of one
    // keeps only the strongest quotient edge per row. Landmarks: rows
    // 0/1 → L0, 2/3 → L1, 4/5 → L2, 6/7 → L3.
    let graph = semantic_from_edges(
        8,
        &[
            (0, 2, 1.0),  // L0 - L1, strongest
            (1, 4, 0.5),  // L0 - L2
            (1, 6, 0.25), // L0 - L3
        ],
    );
    let assignment = assignment_of(&[0, 0, 1, 1, 2, 2, 3, 3], 4);

    let quotient = quotient_graph(
        &graph.view(),
        &assignment,
        QuotientOptions {
            maximum_neighbours: NonZero::new(1).expect("one is nonzero"),
        },
    )
    .expect("the fixture quotient has edges");

    // L0 keeps only L1; L2 and L3 keep their single inflow (normalized
    // to 1.0 within their own rows), so their edges to L0 survive from
    // the other direction.
    assert!(
        quotient
            .view()
            .row(LandmarkOrdinal::new(0))
            .any(|edge| edge.id.as_u64() == 1),
        "the strongest edge survives the cap"
    );
}

#[test]
fn quotient_rejects_inconsistent_inputs() {
    let graph = corpus_graph();

    assert_eq!(
        quotient_graph(
            &graph.view(),
            &assignment_of(&[0, 0, 1, 1], 2),
            QuotientOptions { .. },
        )
        .expect_err("the inconsistent assignment must be rejected"),
        QuotientError::AssignmentRows {
            expected: 6,
            actual: 4,
        },
    );

    // Everything in one landmark: nothing crosses.
    assert_eq!(
        quotient_graph(
            &graph.view(),
            &assignment_of(&[0, 0, 0, 0, 0, 0], 1),
            QuotientOptions { .. },
        )
        .expect_err("the edgeless quotient must be rejected"),
        QuotientError::EmptyQuotient,
    );
}

#[test]
#[should_panic(expected = "every ordinal lies below the landmark count")]
fn assignment_fixtures_validate_their_domain() {
    assignment_of(&[0, 0, 1, 1, 2, 9], 3);
}

#[test]
fn quotient_is_invariant_across_thread_counts() {
    // A 200-row ring with chords and cycling weights, contracted into
    // ten landmarks: the one-worker and eight-worker contractions must
    // emit bit-equal matrices.
    let mut edges = Vec::new();
    for row in 0_u32..200 {
        let weight = [0.1, 0.35, 0.6, 0.85][(row % 4) as usize];
        edges.push((row, (row + 1) % 200, weight));
        if row % 5 == 0 {
            edges.push((row, (row + 37) % 200, 0.35));
        }
    }
    let graph = semantic_from_edges(200, &edges);
    let ordinals: Vec<u32> = (0_u32..200).map(|row| row % 10).collect();
    let assignment = assignment_of(&ordinals, 10);

    let single = in_pool(1, || {
        quotient_graph(&graph.view(), &assignment, QuotientOptions { .. })
    })
    .expect("the fixture quotient has edges");
    let many = in_pool(8, || {
        quotient_graph(&graph.view(), &assignment, QuotientOptions { .. })
    })
    .expect("the fixture quotient has edges");

    assert_eq!(
        single.matrix().into_raw_storage(),
        many.matrix().into_raw_storage(),
    );
}

fn curve() -> AffinityCurve {
    AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned")
}

fn layout_options(epochs: u32) -> LayoutOptions {
    LayoutOptions {
        epochs: NonZero::new(epochs).expect("test epoch budgets are nonzero"),
        ..
    }
}

#[test]
fn layout_is_deterministic_under_a_seed() {
    let graph = corpus_graph();

    let first = layout_landmarks(&graph.view(), curve(), layout_options(50), rng())
        .expect("the fixture graph lays out");
    let second = layout_landmarks(&graph.view(), curve(), layout_options(50), rng())
        .expect("the fixture graph lays out");
    assert_eq!(first, second);

    let third = layout_landmarks(
        &graph.view(),
        curve(),
        layout_options(50),
        Xoshiro256PlusPlus::seed_from_u64(43),
    )
    .expect("the fixture graph lays out");
    assert_ne!(first, third, "a different seed draws a different layout");
}

/// Two 3-cliques with no edge between them.
fn clique_pair() -> SemanticGraph<NodeRowId> {
    semantic_from_edges(
        6,
        &[
            (0, 1, 1.0),
            (0, 2, 1.0),
            (1, 2, 1.0),
            (3, 4, 1.0),
            (3, 5, 1.0),
            (4, 5, 1.0),
        ],
    )
}

/// The clique-pair vertex groups.
const CLIQUES: [&[usize]; 2] = [&[0, 1, 2], &[3, 4, 5]];

/// Longest pairwise distance inside either clique.
fn widest_within<N>(coordinates: &IdSlice<N, Vec2>) -> f32
where
    N: Id,
{
    let mut widest = 0.0_f32;
    for clique in CLIQUES {
        for (position, &left) in clique.iter().enumerate() {
            for &right in &clique[position + 1..] {
                widest = widest.max(
                    coordinates[N::from_usize(left)].distance(coordinates[N::from_usize(right)]),
                );
            }
        }
    }
    widest
}

/// Shortest distance between the two cliques.
fn narrowest_across<N>(coordinates: &IdSlice<N, Vec2>) -> f32
where
    N: Id,
{
    let mut narrowest = f32::INFINITY;
    for &left in CLIQUES[0] {
        for &right in CLIQUES[1] {
            narrowest = narrowest
                .min(coordinates[N::from_usize(left)].distance(coordinates[N::from_usize(right)]));
        }
    }
    narrowest
}

#[test]
fn layout_separates_clusters() {
    // Attraction gathers each clique tighter than the gap between them.
    let graph = clique_pair();
    let coordinates = layout_landmarks(&graph.view(), curve(), layout_options(200), rng())
        .expect("the fixture graph lays out");

    assert_eq!(coordinates.len(), 6);
    for point in coordinates.iter() {
        assert!(
            point.x().is_finite() && point.y().is_finite(),
            "every optimized coordinate is finite",
        );
    }

    let within = widest_within(&coordinates);
    let across = narrowest_across(&coordinates);
    assert!(
        within < across,
        "cliques gather ({within}) closer than the gap between them ({across})",
    );
}

#[test]
fn repulsion_widens_the_gap_between_disconnected_components() {
    // Same graph, same seed, one knob: with repulsion disabled the
    // cliques only contract in place, so the gap the default schedule
    // opens must exceed the unrepelled one.
    let graph = clique_pair();
    let repelled = layout_landmarks(&graph.view(), curve(), layout_options(200), rng())
        .expect("the fixture graph lays out");
    let unrepelled = layout_landmarks(
        &graph.view(),
        curve(),
        LayoutOptions {
            epochs: NonZero::new(200).expect("test epoch budgets are nonzero"),
            repulsion_strength: RepulsionStrength::new(0.0).expect("zero disables repulsion"),
            ..
        },
        rng(),
    )
    .expect("the fixture graph lays out");

    let opened = narrowest_across(&repelled);
    let contracted = narrowest_across(&unrepelled);
    assert!(
        opened > contracted,
        "the repelled gap ({opened}) exceeds the unrepelled gap ({contracted})",
    );
}

#[test]
fn layout_drops_edges_weaker_than_the_epoch_budget() {
    // The (2, 3) weight needs a hundred epochs between samples, beyond
    // the fifty-epoch budget: the pair is never scheduled, receives no
    // attraction, and keeps its initial separation while the
    // full-weight pair gathers.
    let graph = semantic_from_edges(4, &[(0, 1, 1.0), (2, 3, 0.01)]);

    let coordinates = layout_landmarks(&graph.view(), curve(), layout_options(50), rng())
        .expect("the fixture graph lays out");
    assert_eq!(coordinates.len(), 4);

    let attracted = coordinates[NodeRowId::new(0)].distance(coordinates[NodeRowId::new(1)]);
    let dropped = coordinates[NodeRowId::new(2)].distance(coordinates[NodeRowId::new(3)]);
    assert!(attracted < 2.0, "the scheduled pair gathers ({attracted})");
    assert!(
        dropped > 6.0,
        "the dropped pair keeps its initial separation ({dropped})",
    );
}

#[test]
fn layout_leaves_edgeless_rows_on_the_initial_circle() {
    // One edge between rows 0 and 1; rows 2 and 3 are isolated.
    let graph = semantic_from_edges(4, &[(0, 1, 1.0)]);

    let coordinates = layout_landmarks(&graph.view(), curve(), layout_options(200), rng())
        .expect("the fixture graph lays out");
    assert_eq!(coordinates.len(), 4);

    // The initial circle has radius 5 with up to 1% radial jitter; no
    // force acts on an edgeless row, so it stays in that annulus (the
    // bounds carry rounding slop from the trigonometric placement).
    for &isolated in &[2_usize, 3] {
        let radius = coordinates[NodeRowId::from_usize(isolated)].length();
        assert!(
            (4.999..=5.051).contains(&radius),
            "row {isolated} sits at radius {radius}, off the initial annulus",
        );
    }

    // The connected pair starts half a circle apart (distance ~10) and
    // attraction draws it in.
    assert!(
        coordinates[NodeRowId::new(0)].distance(coordinates[NodeRowId::new(1)]) < 2.0,
        "the connected pair gathers",
    );
}

#[test]
fn layout_rejects_an_edgeless_graph() {
    let edgeless = semantic_from_edges(2, &[]);
    assert_eq!(
        layout_landmarks(&edgeless.view(), curve(), LayoutOptions { .. }, rng()),
        Err(EdgelessGraphError),
    );
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-landmark-skeleton-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

/// A skeleton from real stage outputs over the clustered fixture.
///
/// Alongside the stage outputs it was assembled from.
fn fixture_skeleton() -> (
    LandmarkSkeleton<NodeRowId>,
    LandmarkAssignment<NodeRowId>,
    Box<IdSlice<LandmarkOrdinal, Vec2>>,
) {
    let matrix = Matrix::new(&clustered_embeddings());
    let selection = selection_of(&[0, 2, 4]);
    let assignment = assign_landmarks(&mut ExactIndex::new(), rng(), matrix.view(), &selection)
        .expect("the exact backend assigns every row");
    let quotient = quotient_graph(&corpus_graph().view(), &assignment, QuotientOptions { .. })
        .expect("the fixture quotient has edges");
    let coordinates = layout_landmarks(&quotient.view(), curve(), layout_options(50), rng())
        .expect("the quotient lays out");

    let skeleton = LandmarkSkeleton::new(selection, assignment.clone(), coordinates.clone());
    (skeleton, assignment, coordinates)
}

#[test]
fn skeleton_round_trips_through_its_file() {
    let (skeleton, assignment, coordinates) = fixture_skeleton();

    let mut bytes = Vec::new();
    let first = skeleton
        .write_into(&mut bytes)
        .expect("writing into a vector cannot fail");
    let second = skeleton
        .write_into(&mut Vec::new())
        .expect("writing into a vector cannot fail");
    assert_eq!(first, second, "the encoding is deterministic");

    let path = scratch("roundtrip.lndm");
    fs::write(&path, &bytes).expect("the scratch file is writable");
    let mapped =
        LandmarkSkeletonArchive::new(LandmarkFile::open(&path).expect("the written file reopens"))
            .expect("the written skeleton is valid");

    assert_eq!(mapped.landmarks(), 3);
    assert_eq!(mapped.rows(), 6);
    assert_eq!(
        mapped.selected_rows().as_raw(),
        [NodeRowId::new(0), NodeRowId::new(2), NodeRowId::new(4)],
    );
    assert_eq!(mapped.assignment(), assignment.as_slice());
    assert_eq!(mapped.coordinates(), &*coordinates);
}

#[test]
fn mapped_skeleton_rejects_violated_invariants() {
    let (skeleton, _, _) = fixture_skeleton();
    let mut bytes = Vec::new();
    skeleton
        .write_into(&mut bytes)
        .expect("writing into a vector cannot fail");

    // The fixture's geometry: rows at 4096, assignment at 8192,
    // coordinates at 12288 (each region padded to one 4096 unit).
    let open = |name: &str, bytes: &[u8]| {
        let path = scratch(name);
        fs::write(&path, bytes).expect("the scratch file is writable");
        LandmarkSkeletonArchive::new(LandmarkFile::open(&path).expect("the geometry is intact"))
    };

    let mut unordered = bytes.clone();
    unordered[4096..4112].copy_from_slice(&[2_u64.to_le_bytes(), 0_u64.to_le_bytes()].concat());
    assert_eq!(
        open("unordered.lndm", &unordered).expect_err("descending rows are rejected"),
        InvalidLandmarkFile::UnorderedRows { ordinal: 1 },
    );

    let mut foreign = bytes.clone();
    foreign[8192..8196].copy_from_slice(&9_u32.to_le_bytes());
    assert_eq!(
        open("foreign-ordinal.lndm", &foreign).expect_err("out-of-domain ordinals are rejected"),
        InvalidLandmarkFile::OrdinalOutOfDomain {
            row: 0,
            ordinal: 9,
            landmarks: 3,
        },
    );

    let mut nan = bytes.clone();
    nan[12288..12292].copy_from_slice(&f32::NAN.to_le_bytes());
    assert_eq!(
        open("nan-coordinate.lndm", &nan).expect_err("non-finite coordinates are rejected"),
        InvalidLandmarkFile::NonFiniteCoordinate { ordinal: 0 },
    );
}

#[test]
#[should_panic(expected = "one coordinate per landmark")]
fn skeleton_assembly_rejects_disagreeing_parts() {
    let (_, assignment, _) = fixture_skeleton();
    let selection = selection_of(&[0, 2, 4]);

    let _skeleton = LandmarkSkeleton::new(
        selection,
        assignment,
        IdSlice::from_boxed_slice(Box::from([Vec2::ZERO])),
    );
}
