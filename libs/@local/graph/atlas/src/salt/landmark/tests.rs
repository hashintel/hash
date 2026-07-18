use core::num::NonZero;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    assignment::{AssignmentError, LandmarkAssignment, assign_landmarks},
    quotient::{QuotientError, QuotientOptions, quotient_graph},
    select::{
        LandmarkCandidate, SelectionError, SelectionOptions, Subgroup, SubgroupDimension,
        SubgroupMinimum, select_landmarks,
    },
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::{AlignedVecN, BoxedVecN},
    salt::{
        knn::{Embedding, NearestNeighboursIndex, Neighbour},
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

fn rng() -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(42)
}

fn candidate(row: u64) -> LandmarkCandidate {
    LandmarkCandidate {
        row: NodeRowId::new(row),
        sampling_weight: 1.0,
        density: 0,
        language: 0,
        source: 0,
        entity_role: 0,
        type_family: 0,
        community: 0,
        temporal_cohort: 0,
        prior_landmark: false,
    }
}

fn candidates(count: u64) -> Vec<LandmarkCandidate> {
    (0..count).map(candidate).collect()
}

fn options(maximum: usize) -> SelectionOptions {
    SelectionOptions {
        maximum_count: NonZero::new(maximum).expect("test capacities are nonzero"),
        ..
    }
}

#[test]
fn selection_is_deterministic_under_a_seed() {
    let candidates = candidates(100);
    let first = select_landmarks(&candidates, &[], options(10), rng())
        .expect("the unconstrained selection succeeds");
    let second = select_landmarks(&candidates, &[], options(10), rng())
        .expect("the unconstrained selection succeeds");

    assert_eq!(first, second);
    assert_eq!(first.len(), 10);
    assert!(
        first.rows().is_sorted_by(|left, right| left < right),
        "selected rows are strictly ascending"
    );

    let third = select_landmarks(
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
    let selection = select_landmarks(&candidates, &[], options(100), rng())
        .expect("a small corpus selects wholesale");

    assert_eq!(selection.len(), 4);
}

#[test]
fn selection_honors_subgroup_minimums() {
    // Rows 90..100 carry language 7; demand five of them.
    let mut candidates = candidates(100);
    for candidate in &mut candidates[90..100] {
        candidate.language = 7;
    }
    let subgroup = Subgroup {
        dimension: SubgroupDimension::Language,
        value: 7,
    };

    let selection = select_landmarks(
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
        .filter(|row| row.get() >= 90)
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
        candidate.sampling_weight = 1000.0;
    }

    let mut heavy_selected = 0_usize;
    for seed in 0..50 {
        let selection = select_landmarks(
            &candidates,
            &[],
            options(10),
            Xoshiro256PlusPlus::seed_from_u64(seed),
        )
        .expect("the unconstrained selection succeeds");
        heavy_selected += selection.rows().iter().filter(|row| row.get() < 10).count();
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

    let selection = select_landmarks(&candidates, &[], options(20), rng())
        .expect("the unconstrained selection succeeds");

    assert!(
        selection.retained_count() >= 5,
        "{} prior landmarks retained where the target reserves 5",
        selection.retained_count(),
    );
}

#[test]
fn selection_rejects_malformed_inputs() {
    assert_eq!(
        select_landmarks(&[], &[], options(10), rng()),
        Err(SelectionError::EmptyCorpus),
    );

    let mut unordered = candidates(4);
    unordered.swap(1, 2);
    assert_eq!(
        select_landmarks(&unordered, &[], options(10), rng()),
        Err(SelectionError::UnorderedCandidates { index: 2 }),
    );

    let mut weightless = candidates(4);
    weightless[2].sampling_weight = 0.0;
    assert_eq!(
        select_landmarks(&weightless, &[], options(10), rng()),
        Err(SelectionError::InvalidSamplingWeight {
            index: 2,
            value: 0.0,
        }),
    );

    assert_eq!(
        select_landmarks(
            &candidates(4),
            &[],
            SelectionOptions {
                maximum_count: NonZero::new(2).expect("two is nonzero"),
                retained_fraction: 1.5,
            },
            rng()
        ),
        Err(SelectionError::InvalidRetainedFraction { value: 1.5 }),
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
        select_landmarks(&candidates(4), &[minimum, minimum], options(10), rng()),
        Err(SelectionError::DuplicateMinimum { subgroup }),
    );
}

#[test]
fn selection_rejects_unsatisfiable_minimums() {
    let subgroup = Subgroup {
        dimension: SubgroupDimension::Community,
        value: 9,
    };

    // Nothing carries community 9.
    assert_eq!(
        select_landmarks(
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
        candidate.community = 9;
    }
    assert_eq!(
        select_landmarks(
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

/// A brute-force cosine backend over resident rows.
struct ExactIndex {
    rows: Vec<(NodeRowId, BoxedVecN<PROJECTOR_DIMENSIONS>)>,
}

impl ExactIndex {
    fn new() -> Self {
        Self { rows: Vec::new() }
    }
}

impl NearestNeighboursIndex for ExactIndex {
    type Error = !;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
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

    fn build(&mut self, _: impl rand::Rng + rand::SeedableRng) -> Result<(), Self::Error> {
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let mut all: Vec<Neighbour> = self
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
                .then_with(|| left.id.get().cmp(&right.id.get()))
        });
        all.truncate(limit);
        Ok(all)
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
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
        let mut found: Vec<Neighbour> = self
            .search_by_vector(&stored, limit + 1)?
            .into_iter()
            .filter(|neighbour| neighbour.id != id)
            .collect();
        found.truncate(limit);
        Ok(found)
    }
}

/// Six rows in three well-separated directions: rows 0 and 1 point one
/// way, 2 and 3 another, 4 and 5 a third.
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

/// Fixture rows in SIMD-aligned row-major storage, the shape a mapped
/// `f32[N, 512]` artifact yields.
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

    fn view(&self) -> &[AlignedVecN<PROJECTOR_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * PROJECTOR_DIMENSIONS])
            .expect("boxed storage is aligned")
    }
}

fn selection_of(rows: &[u64]) -> super::select::LandmarkSelection {
    let candidates: Vec<LandmarkCandidate> = rows.iter().map(|&row| candidate(row)).collect();
    select_landmarks(&candidates, &[], options(rows.len()), rng())
        .expect("selecting every candidate succeeds")
}

#[test]
fn assignment_maps_rows_to_their_nearest_landmark() {
    let matrix = Matrix::new(&clustered_embeddings());
    // One landmark per cluster: rows 0, 2, 4.
    let selection = selection_of(&[0, 2, 4]);

    let assignment = assign_landmarks(&mut ExactIndex::new(), rng(), matrix.view(), &selection)
        .expect("the exact backend assigns every row");

    assert_eq!(assignment.as_slice(), [0, 0, 1, 1, 2, 2]);
    assert_eq!(assignment.get(NodeRowId::new(3)), 1);
}

#[test]
fn assignment_rejects_landmarks_outside_the_corpus() {
    let matrix = Matrix::new(&clustered_embeddings());
    let selection = selection_of(&[0, 99]);

    let result = assign_landmarks(&mut ExactIndex::new(), rng(), matrix.view(), &selection);

    assert!(matches!(
        result,
        Err(AssignmentError::UnknownRow { row: 99, rows: 6 }),
    ));
}

/// An assignment straight from ordinals, for quotient fixtures.
fn assignment_of(ordinals: &[u32]) -> LandmarkAssignment {
    LandmarkAssignment::from_ordinals(ordinals.to_vec().into_boxed_slice())
}

/// A semantic graph over `count` rows from undirected weighted edges.
fn semantic_from_edges(count: usize, edges: &[(u32, u32, f32)]) -> SemanticGraph {
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

/// A corpus semantic graph over six rows: edges within clusters carry
/// weight 1.0, one bridge edge (1, 2) carries 0.5, and one weaker
/// bridge (3, 4) carries 0.25.
fn corpus_graph() -> SemanticGraph {
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
    let assignment = assignment_of(&[0, 0, 1, 1, 2, 2]);

    let quotient = quotient_graph(&graph.view(), &assignment, 3, QuotientOptions { .. })
        .expect("the fixture quotient has edges");

    // Directed inflows: L0 <- 0.5 (edge 1-2), L1 <- 0.5 + 0.25, L2 <-
    // 0.25. Every row max-normalizes, then pairs take the maximum
    // direction: (L0, L1) = max(0.5/0.5, 0.5/0.5) = 1.0 and (L1, L2) =
    // max(0.25/0.5, 0.25/0.25) = 1.0.
    let view = quotient.view();
    assert_eq!(view.rows(), 3);
    let row0: Vec<(u64, f32)> = view
        .row(0)
        .map(|edge| (edge.id.get(), edge.weight))
        .collect();
    let row1: Vec<(u64, f32)> = view
        .row(1)
        .map(|edge| (edge.id.get(), edge.weight))
        .collect();
    assert_eq!(row0, [(1, 1.0)]);
    assert_eq!(row1, [(0, 1.0), (2, 1.0)]);
}

#[test]
fn quotient_keeps_only_the_strongest_neighbours() {
    // A hub landmark connected to three others; a neighbour cap of one
    // keeps only the strongest quotient edge per row. Landmarks: rows
    // 0/1 -> L0, 2/3 -> L1, 4/5 -> L2, 6/7 -> L3.
    let graph = semantic_from_edges(
        8,
        &[
            (0, 2, 1.0),  // L0 - L1, strongest
            (1, 4, 0.5),  // L0 - L2
            (1, 6, 0.25), // L0 - L3
        ],
    );
    let assignment = assignment_of(&[0, 0, 1, 1, 2, 2, 3, 3]);

    let quotient = quotient_graph(
        &graph.view(),
        &assignment,
        4,
        QuotientOptions {
            maximum_neighbours: NonZero::new(1).expect("one is nonzero"),
        },
    )
    .expect("the fixture quotient has edges");

    // L0 keeps only L1; L2 and L3 keep their single inflow (normalized
    // to 1.0 within their own rows), so their edges to L0 survive from
    // the other direction.
    assert!(
        quotient.view().row(0).any(|edge| edge.id.get() == 1),
        "the strongest edge survives the cap"
    );
}

#[test]
fn quotient_rejects_inconsistent_inputs() {
    let graph = corpus_graph();

    assert_eq!(
        quotient_graph(
            &graph.view(),
            &assignment_of(&[0, 0, 1, 1]),
            2,
            QuotientOptions { .. },
        )
        .expect_err("the inconsistent assignment must be rejected"),
        QuotientError::AssignmentRows {
            expected: 6,
            actual: 4,
        },
    );

    assert_eq!(
        quotient_graph(
            &graph.view(),
            &assignment_of(&[0, 0, 1, 1, 2, 9]),
            3,
            QuotientOptions { .. },
        )
        .expect_err("the out-of-domain ordinal must be rejected"),
        QuotientError::AssignmentOrdinal {
            row: 5,
            ordinal: 9,
            landmarks: 3,
        },
    );

    // Everything in one landmark: nothing crosses.
    assert_eq!(
        quotient_graph(
            &graph.view(),
            &assignment_of(&[0, 0, 0, 0, 0, 0]),
            1,
            QuotientOptions { .. },
        )
        .expect_err("the edgeless quotient must be rejected"),
        QuotientError::EmptyQuotient,
    );
}
