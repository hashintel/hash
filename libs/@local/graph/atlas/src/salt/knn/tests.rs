#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts; fixtures use exactly representable values or \
              compare cross-path results of the same kernel"
)]
use alloc::sync::Arc;
use core::{assert_matches, num::NonZero, time::Duration};
use std::sync::Mutex;

use hashql_core::id::{Id as _, IdSlice};
use rand::{Rng, RngExt as _, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    DEFAULT_NEIGHBOURS, Embedding, NearestNeighboursIndex, Neighbour,
    artifact::{InvalidKnnFile, KnnArchive},
    construction::{IndexConstruction, KnnConstruction as _, NeighbourLists},
    descent::{NnDescent, NnDescentOptions},
    error::KnnError,
    hannoy::{HannoyIndex, HannoyIndexOptions},
    recall,
    table::{Knn, KnnMatrix, KnnValidationError},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        WriteInto as _,
        array::{ArrayShape, Dim},
        sprs::{
            FileHeader, IndexVariant, StorageVariant, ValueTag,
            read::{OpenSprsError, SprsFile},
        },
    },
    identity::NodeRowId,
    math::{AlignedVecN, BoxedVecN},
    progress::{Batch, DescentIteration, NoProgress, Progress},
    random::normal_quantile,
};

/// Fixture capacity in components: the largest test corpus.
const MATRIX_CAPACITY: usize = 128 * PROJECTOR_DIMENSIONS;

/// Fixture rows in SIMD-aligned row-major storage.
///
/// The shape a mapped `f32[T, 512]` artifact yields.
struct Matrix {
    storage: BoxedVecN<MATRIX_CAPACITY>,
    rows: usize,
}

impl Matrix {
    fn new(rows: &[[f32; PROJECTOR_DIMENSIONS]]) -> Self {
        let mut storage = BoxedVecN::zero();
        let (chunks, _) = storage
            .as_array_mut()
            .as_chunks_mut::<PROJECTOR_DIMENSIONS>();
        assert!(rows.len() <= chunks.len(), "the fixture fits the capacity");
        for (slot, row) in chunks.iter_mut().zip(rows) {
            *slot = *row;
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

/// A brute-force reference backend over resident rows.
struct ExactIndex {
    rows: Vec<BoxedVecN<PROJECTOR_DIMENSIONS>>,
}

impl ExactIndex {
    fn from_rows(rows: &[[f32; PROJECTOR_DIMENSIONS]]) -> Self {
        Self {
            rows: rows
                .iter()
                .map(|row| {
                    let mut boxed = BoxedVecN::zero();
                    boxed.as_array_mut().copy_from_slice(row);
                    boxed
                })
                .collect(),
        }
    }

    /// Ranks every stored row against `query` by `(distance, id)`.
    fn ranked(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        exclude: Option<usize>,
    ) -> Vec<Neighbour<NodeRowId>> {
        let mut all: Vec<Neighbour<NodeRowId>> = self
            .rows
            .iter()
            .enumerate()
            .filter(|&(row, _)| Some(row) != exclude)
            .map(|(row, stored)| Neighbour {
                id: NodeRowId::from_usize(row),
                distance: query.cosine_distance(stored),
            })
            .collect();
        all.sort_unstable_by(|left, right| {
            left.distance
                .total_cmp(&right.distance)
                .then_with(|| left.id.as_u64().cmp(&right.id.as_u64()))
        });
        all
    }

    fn ranked_by_id(&self, id: NodeRowId) -> Vec<Neighbour<NodeRowId>> {
        let row = usize::try_from(id.as_u64()).expect("test rows fit usize");
        self.ranked(&self.rows[row], Some(row))
    }
}

impl NearestNeighboursIndex<NodeRowId> for ExactIndex {
    type Error = !;

    #[expect(
        clippy::panic_in_result_fn,
        reason = "the fixture asserts its own dense-insert contract"
    )]
    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding, NodeRowId>>,
    ) -> Result<(), Self::Error> {
        for embedding in embeddings {
            assert_eq!(
                usize::try_from(embedding.id.as_u64()).expect("test rows fit usize"),
                self.rows.len(),
                "the fixture inserts rows densely in order",
            );
            let mut boxed = BoxedVecN::zero();
            boxed
                .as_array_mut()
                .copy_from_slice(embedding.components.as_array());
            self.rows.push(boxed);
        }
        Ok(())
    }

    fn build<P>(&mut self, _rng: impl Rng + SeedableRng, _progress: &P) -> Result<(), Self::Error>
    where
        P: Progress,
    {
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let mut ranked = self.ranked(query, None);
        ranked.truncate(limit);
        Ok(ranked)
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let mut ranked = self.ranked_by_id(id);
        ranked.truncate(limit);
        Ok(ranked)
    }
}

/// A degraded backend answering with the farthest rows.
struct FarthestIndex(ExactIndex);

/// A misbehaving backend returning fewer neighbours than requested.
struct ShortIndex(ExactIndex);

/// A misbehaving backend repeating its nearest neighbour.
struct DoubledIndex(ExactIndex);

/// A misbehaving backend naming rows outside the domain.
struct EscapingIndex(ExactIndex);

/// A backend degraded by a per-row offset.
///
/// Row `i` skips the nearest `i & 7` candidates, so per-row recall spans a linear ramp and any
/// non-degenerate sample measures real spread.
struct MixedIndex(ExactIndex);

macro_rules! delegate_all_but_search_by_id {
    () => {
        type Error = !;

        fn insert_many<'embedding>(
            &mut self,
            embeddings: impl IntoIterator<Item = Embedding<'embedding, NodeRowId>>,
        ) -> Result<(), Self::Error> {
            self.0.insert_many(embeddings)
        }

        fn build<P>(&mut self, rng: impl Rng + SeedableRng, progress: &P) -> Result<(), Self::Error>
        where
            P: crate::progress::Progress,
        {
            self.0.build(rng, progress)
        }

        fn search_by_vector(
            &self,
            query: &crate::math::AlignedVecN<PROJECTOR_DIMENSIONS>,
            limit: usize,
        ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
            self.0.search_by_vector(query, limit)
        }
    };
}

impl NearestNeighboursIndex<NodeRowId> for FarthestIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let ranked = self.0.ranked_by_id(id);
        let skip = ranked.len().saturating_sub(limit);
        Ok(ranked.into_iter().skip(skip))
    }
}

impl NearestNeighboursIndex<NodeRowId> for ShortIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit.saturating_sub(1));
        Ok(ranked)
    }
}

impl NearestNeighboursIndex<NodeRowId> for DoubledIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit);
        ranked[1] = ranked[0];
        Ok(ranked)
    }
}

impl NearestNeighboursIndex<NodeRowId> for EscapingIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let rows = self.0.rows.len() as u64;
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit);
        Ok(ranked.into_iter().map(move |neighbour| Neighbour {
            id: NodeRowId::new(neighbour.id.as_u64() + rows),
            distance: neighbour.distance,
        }))
    }
}

impl NearestNeighboursIndex<NodeRowId> for MixedIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<NodeRowId>>, Self::Error> {
        let ranked = self.0.ranked_by_id(id);
        let skip = (id.as_u64() & 7) as usize;
        Ok(ranked
            .into_iter()
            .skip(skip)
            .take(limit)
            .collect::<Vec<_>>())
    }
}

fn axis(component: usize, value: f32) -> [f32; PROJECTOR_DIMENSIONS] {
    let mut row = [0.0; PROJECTOR_DIMENSIONS];
    row[component] = value;
    row
}

/// The vectors `e0`, `e1`, `e0 + e1`, and `-e0`, where known geometry gives every pairwise
/// distance.
fn plane_fixture() -> [[f32; PROJECTOR_DIMENSIONS]; 4] {
    let mut mix = [0.0; PROJECTOR_DIMENSIONS];
    mix[0] = 1.0;
    mix[1] = 1.0;
    [axis(0, 1.0), axis(1, 1.0), mix, axis(0, -1.0)]
}

/// Distinct unit vectors fanned through the `(0, 1)` plane.
///
/// Distance is strictly monotone in index separation.
fn fan_fixture(rows: usize, step: f32) -> Vec<[f32; PROJECTOR_DIMENSIONS]> {
    (0..rows)
        .map(|index| {
            #[expect(
                clippy::cast_precision_loss,
                reason = "test indices are tiny exact integers"
            )]
            let angle = index as f32 * step;
            let mut row = [0.0; PROJECTOR_DIMENSIONS];
            row[0] = angle.cos();
            row[1] = angle.sin();
            row
        })
        .collect()
}

fn two_neighbours() -> NonZero<usize> {
    NonZero::new(2).expect("two is nonzero")
}

fn test_rng() -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(0x0A75)
}

/// One observation a construction reported.
#[derive(Debug, Clone, PartialEq)]
enum Reported {
    /// A batch of rows entered the backend.
    Insert(Batch),
    /// The backend named a build phase.
    Phase(String),
    /// An NN-Descent iteration completed.
    Descent(DescentIteration),
    /// A batch of rows came back out.
    Readback(Batch),
}

/// An observer keeping every observation a construction reported, in arrival order.
///
/// Cloneable and shareable because the seam hands the backend an observer of its own: every clone
/// records into the one log, so the backend's phases and the loops around it arrive interleaved as
/// the construction reported them.
#[derive(Debug, Clone, Default)]
struct RecordingProgress(Arc<Mutex<Vec<Reported>>>);

impl RecordingProgress {
    /// Records one observation.
    fn push(&self, reported: Reported) {
        self.0
            .lock()
            .expect("no reporter panicked holding the log")
            .push(reported);
    }

    /// Every observation so far, in arrival order.
    fn reported(&self) -> Vec<Reported> {
        self.0
            .lock()
            .expect("no reporter panicked holding the log")
            .clone()
    }

    /// The batches one loop reported, in arrival order.
    fn batches(&self, select: fn(&Reported) -> Option<Batch>) -> Vec<Batch> {
        self.reported().iter().filter_map(select).collect()
    }
}

impl Progress for RecordingProgress {
    /// A detached half shares the log, so it records into the same fixture.
    type Detached = Self;

    fn detach(&self) -> Self {
        self.clone()
    }

    fn knn_build_phase(&self, phase: &str) {
        self.push(Reported::Phase(phase.to_owned()));
    }

    fn knn_insert(&self, batch: Batch) {
        self.push(Reported::Insert(batch));
    }

    fn descent_iteration(&self, iteration: DescentIteration) {
        self.push(Reported::Descent(iteration));
    }

    fn knn_readback(&self, batch: Batch) {
        self.push(Reported::Readback(batch));
    }
}

/// The insertion's batch, when the observation is one.
const fn inserted(reported: &Reported) -> Option<Batch> {
    match reported {
        Reported::Insert(batch) => Some(*batch),
        Reported::Phase(_) | Reported::Descent(_) | Reported::Readback(_) => None,
    }
}

/// The readback's batch, when the observation is one.
const fn readback(reported: &Reported) -> Option<Batch> {
    match reported {
        Reported::Readback(batch) => Some(*batch),
        Reported::Phase(_) | Reported::Descent(_) | Reported::Insert(_) => None,
    }
}

/// Constructs lists over `embeddings` through an initially empty backend.
fn lists_via<I>(
    index: I,
    embeddings: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    width: NonZero<usize>,
) -> Result<NeighbourLists<NodeRowId>, KnnError<NodeRowId, I::Error>>
where
    I: NearestNeighboursIndex<NodeRowId> + Sync,
    I::Error: Send,
{
    IndexConstruction::new(index).construct(embeddings, width, test_rng(), &NoProgress)
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn build_matches_hand_computed_neighbours() {
    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);
    let lists = lists_via(ExactIndex::from_rows(&[]), matrix.view(), two_neighbours())
        .expect("the fixture is well-formed");
    let knn = Knn::from_lists::<!>(&lists, two_neighbours()).expect("the fixture is well-formed");

    assert_eq!(knn.rows(), 4);
    assert_eq!(knn.neighbours(), 2);

    let embeddings = matrix.view();
    let distance = |left: usize, right: usize| {
        embeddings[NodeRowId::from_usize(left)]
            .cosine_distance(&embeddings[NodeRowId::from_usize(right)])
    };
    let diagonal = distance(0, 2);
    assert!((f64::from(diagonal) - (1.0 - 0.5_f64.sqrt())).abs() < 1e-6);

    let view = knn.view();
    let stored: Vec<Vec<(u64, f32)>> = (0..4)
        .map(|row| {
            view.row(NodeRowId::from_usize(row))
                .map(|neighbour| (neighbour.id.as_u64(), neighbour.distance))
                .collect()
        })
        .collect();

    // Rows key their neighbours in ascending row order; the values are
    // the exact kernel outputs, so equality is bit-exact.
    assert_eq!(stored[0], vec![(1, 1.0), (2, diagonal)]);
    assert_eq!(stored[1], vec![(0, 1.0), (2, distance(1, 2))]);
    assert_eq!(stored[2], vec![(0, diagonal), (1, distance(2, 1))]);
    assert_eq!(stored[3], vec![(1, 1.0), (2, distance(3, 2))]);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn build_rejects_unsatisfiable_shapes() {
    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);

    assert_matches!(
        lists_via(
            ExactIndex::from_rows(&[]),
            IdSlice::<NodeRowId, _>::from_raw(&matrix.view().as_raw()[..1]),
            two_neighbours()
        ),
        Err(KnnError::Invalid(KnnValidationError::InsufficientRows {
            rows: 1
        })),
    );

    // Construction clamps the width to the corpus; the table's stored
    // count still must stay below the row domain.
    let lists = lists_via(
        ExactIndex::from_rows(&[]),
        matrix.view(),
        NonZero::new(4).expect("four is nonzero"),
    )
    .expect("the clamped construction succeeds");
    assert_eq!(lists.width(), 3);
    assert_matches!(
        Knn::from_lists::<!>(&lists, NonZero::new(4).expect("four is nonzero")),
        Err(KnnError::Invalid(KnnValidationError::NeighbourBounds {
            neighbours: 4,
            rows: 4,
        })),
    );

    // Lists narrower than the stored width cannot fill the table.
    let narrow = lists_via(ExactIndex::from_rows(&[]), matrix.view(), two_neighbours())
        .expect("the fixture is well-formed");
    assert_matches!(
        Knn::from_lists::<!>(&narrow, NonZero::new(3).expect("three is nonzero")),
        Err(KnnError::ListsWidth {
            width: 2,
            neighbours: 3,
        }),
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn build_rejects_malformed_backend_responses() {
    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);

    assert_matches!(
        lists_via(
            ShortIndex(ExactIndex::from_rows(&[])),
            matrix.view(),
            two_neighbours()
        ),
        Err(KnnError::SearchCount {
            expected: 2,
            actual: 1,
            ..
        }),
    );

    assert_matches!(
        lists_via(
            DoubledIndex(ExactIndex::from_rows(&[])),
            matrix.view(),
            two_neighbours()
        ),
        Err(KnnError::DuplicateNeighbour { .. }),
    );

    assert_matches!(
        lists_via(
            EscapingIndex(ExactIndex::from_rows(&[])),
            matrix.view(),
            two_neighbours()
        ),
        Err(KnnError::NeighbourOutOfBounds { rows: 4, .. }),
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn descent_converges_on_known_geometry() {
    let rows = fan_fixture(64, 0.02);
    let matrix = Matrix::new(&rows);
    let embeddings = matrix.view();
    let width = NonZero::new(4).expect("four is nonzero");

    let lists = NnDescent::new(NnDescentOptions::default())
        .construct(embeddings, width, test_rng(), &NoProgress)
        .expect("the fixture is well-formed");
    assert_eq!(lists.rows(), 64);
    assert_eq!(lists.width(), 4);

    let exact = ExactIndex::from_rows(&rows);
    let mut matched = 0;
    for row in 0..64 {
        let entries = lists.row(NodeRowId::from_usize(row));
        assert!(
            entries.is_sorted_by(|left, right| {
                (left.distance, left.id.as_u64()) <= (right.distance, right.id.as_u64())
            }),
            "rows arrive in ascending (distance, id) order",
        );
        let mut ids: Vec<u64> = entries
            .iter()
            .map(|neighbour| neighbour.id.as_u64())
            .collect();
        assert!(!ids.contains(&(row as u64)), "no row references itself");
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 4, "neighbours within a row are unique");
        for neighbour in entries {
            assert!((0.0..=2.0).contains(&neighbour.distance));
        }

        let reference: Vec<u64> = exact
            .ranked_by_id(NodeRowId::from_usize(row))
            .into_iter()
            .take(4)
            .map(|neighbour| neighbour.id.as_u64())
            .collect();
        matched += ids.iter().filter(|id| reference.contains(id)).count();
    }

    // The join's update application is parallel and unordered, so the
    // converged lists are not replayable; on this smooth fan geometry
    // the join converges to (near-)exact lists under any order, and
    // the bound leaves room for the residual variance.
    assert!(
        matched >= 230,
        "descent matched {matched}/256 exact neighbours",
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn descent_passes_the_admission_gate() {
    // l2-normalized, honouring the construction's input contract: the
    // production pipeline admits representations through the norm spot
    // check before any construction sees them.
    let rows: Vec<[f32; PROJECTOR_DIMENSIONS]> = {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
        core::iter::repeat_with(|| {
            let mut row = [0.0; PROJECTOR_DIMENSIONS];
            for component in &mut row {
                *component = rng.random::<f32>().mul_add(2.0, -1.0);
            }
            let norm = row
                .iter()
                .map(|&component| component * component)
                .sum::<f32>()
                .sqrt();
            for component in &mut row {
                *component /= norm;
            }
            row
        })
        .take(128)
        .collect()
    };
    let matrix = Matrix::new(&rows);
    let embeddings = matrix.view();

    // The width is the wider of the spot check's depth and the stored count, so the admitted lists
    // and the persisted table are the same lists.
    let width = recall::SpotCheckOptions::default()
        .neighbours
        .max(DEFAULT_NEIGHBOURS);
    let lists = NnDescent::new(NnDescentOptions::default())
        .construct(embeddings, width, test_rng(), &NoProgress)
        .expect("the fixture is well-formed");

    let knn = Knn::from_lists::<!>(&lists, DEFAULT_NEIGHBOURS)
        .expect("the table assembles and validates");
    assert_eq!(knn.rows(), 128);
    assert_eq!(knn.neighbours(), 30);

    let check = recall::spot_check_lists::<_, !>(
        &lists,
        embeddings,
        recall::SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(9),
    )
    .expect("the spot check completes");
    assert_eq!(
        check.admission(),
        recall::RecallAdmission::Admitted,
        "recall {} misses the admission minimum",
        check.recall(),
    );
}

#[test]
fn descent_rejects_degenerate_corpora() {
    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);

    assert_matches!(
        NnDescent::new(NnDescentOptions::default()).construct(
            IdSlice::<NodeRowId, _>::from_raw(&matrix.view().as_raw()[..1]),
            two_neighbours(),
            test_rng(),
            &NoProgress
        ),
        Err(super::descent::NnDescentError::InsufficientRows { rows: 1 }),
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn descent_clamps_the_width_to_the_corpus() {
    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);

    let lists = NnDescent::new(NnDescentOptions::default())
        .construct(
            matrix.view(),
            NonZero::new(16).expect("sixteen is nonzero"),
            test_rng(),
            &NoProgress,
        )
        .expect("the clamped construction succeeds");
    assert_eq!(lists.width(), 3, "the width clamps to every non-self row");
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn an_observed_construction_reports_its_insertion_then_its_readback() {
    let rows = fan_fixture(64, 0.02);
    let matrix = Matrix::new(&rows);
    let progress = RecordingProgress::default();

    // The backend starts empty, and the construction fills it.
    IndexConstruction::new(ExactIndex::from_rows(&[]))
        .construct(
            matrix.view(),
            NonZero::new(4).expect("four is nonzero"),
            test_rng(),
            &progress,
        )
        .expect("the fixture is well-formed");

    // A corpus below the report cadence reports each loop once, as its last row lands. This backend
    // names no build phases, so the whole log is the two loops' completions, insertion first.
    let complete = Batch {
        done: 64,
        total: 64,
    };
    assert_eq!(
        progress.reported(),
        vec![Reported::Insert(complete), Reported::Readback(complete)],
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn watching_a_construction_does_not_change_its_lists() {
    let rows = fan_fixture(64, 0.02);
    let matrix = Matrix::new(&rows);
    let width = NonZero::new(4).expect("four is nonzero");

    let watched = IndexConstruction::new(ExactIndex::from_rows(&[]))
        .construct(
            matrix.view(),
            width,
            test_rng(),
            &RecordingProgress::default(),
        )
        .expect("the fixture is well-formed");
    let unwatched = IndexConstruction::new(ExactIndex::from_rows(&[]))
        .construct(matrix.view(), width, test_rng(), &NoProgress)
        .expect("the fixture is well-formed");

    assert_eq!(watched.rows(), unwatched.rows());
    for row in 0..watched.rows() {
        let row = NodeRowId::from_usize(row);
        assert_eq!(
            watched.row(row),
            unwatched.row(row),
            "row {row} differs between a watched and an unwatched construction",
        );
    }
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn an_observed_descent_reports_every_iteration_it_ran() {
    let rows = fan_fixture(64, 0.02);
    let matrix = Matrix::new(&rows);
    let options = NnDescentOptions::default();
    let progress = RecordingProgress::default();

    NnDescent::new(options)
        .construct(
            matrix.view(),
            NonZero::new(4).expect("four is nonzero"),
            test_rng(),
            &progress,
        )
        .expect("the fixture is well-formed");

    let iterations: Vec<DescentIteration> = progress
        .reported()
        .into_iter()
        .filter_map(|reported| match reported {
            Reported::Descent(iteration) => Some(iteration),
            Reported::Insert(_) | Reported::Phase(_) | Reported::Readback(_) => None,
        })
        .collect();

    assert!(
        iterations.len() < options.maximum_iterations,
        "the fan fixture's join exhausts itself before the iteration cap",
    );
    for (position, iteration) in iterations.iter().enumerate() {
        assert_eq!(
            iteration.iteration,
            position + 1,
            "iterations report in order, one-based",
        );
        assert_eq!(iteration.threshold, options.termination);
        assert!(
            iteration.accepted_per_entry.is_finite() && iteration.accepted_per_entry >= 0.0,
            "an accepted rate of {} is not a reading",
            iteration.accepted_per_entry,
        );
    }

    // The reading is a convergence reading: the join accepts less as
    // the lists sharpen, and the last iteration is the one that met the
    // termination threshold.
    let [first, last] = [iterations.first(), iterations.last()].map(|reading| {
        reading
            .expect("the construction ran at least one iteration")
            .accepted_per_entry
    });
    assert!(
        last < first,
        "the accepted rate {last} did not fall below the first iteration's {first}",
    );
}

#[test]
fn validation_rejects_each_broken_invariant() {
    // Row 0 referencing itself.
    let matrix = KnnMatrix::new((2, 2), vec![0, 1, 2], vec![0, 0], vec![0.5, 0.5]);
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("self reference"),
        KnnValidationError::SelfNeighbour { row: 0 }
    );

    // A distance beyond the cosine range.
    let matrix = KnnMatrix::new((3, 3), vec![0, 1, 2, 3], vec![1, 2, 0], vec![2.5, 1.0, 1.0]);
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("distance beyond 2"),
        KnnValidationError::DistanceOutOfRange {
            row: 0,
            neighbour: 1,
            distance: 2.5,
        },
    );

    // A non-finite distance.
    let matrix = KnnMatrix::new(
        (3, 3),
        vec![0, 1, 2, 3],
        vec![1, 2, 0],
        vec![f32::NAN, 1.0, 1.0],
    );
    assert_matches!(
        Knn::<NodeRowId>::new(matrix).expect_err("non-finite distance"),
        KnnValidationError::NonFiniteDistance {
            row: 0,
            neighbour: 1,
            ..
        },
    );

    // Ragged rows.
    let matrix = KnnMatrix::new(
        (3, 3),
        vec![0, 2, 3, 4],
        vec![1, 2, 0, 0],
        vec![0.5, 0.5, 0.5, 0.5],
    );
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("ragged rows"),
        KnnValidationError::RaggedRow {
            row: 0,
            expected: 1,
            actual: 2,
        },
    );

    // Column-compressed storage.
    let matrix = KnnMatrix::new_csc((2, 2), vec![0, 1, 2], vec![1, 0], vec![0.5, 0.5]);
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("column compression"),
        KnnValidationError::ColumnCompressed,
    );

    // A rectangular domain.
    let matrix = KnnMatrix::new((2, 3), vec![0, 1, 2], vec![1, 2], vec![0.5, 0.5]);
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("rectangular domain"),
        KnnValidationError::NotSquare {
            rows: 2,
            columns: 3
        },
    );

    // An empty neighbour set.
    let matrix = KnnMatrix::new((2, 2), vec![0, 0, 0], vec![], vec![]);
    assert_eq!(
        Knn::<NodeRowId>::new(matrix).expect_err("empty rows"),
        KnnValidationError::NeighbourBounds {
            neighbours: 0,
            rows: 2,
        },
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_scores_an_exact_backend_perfectly() {
    let rows = fan_fixture(8, 0.15);
    let matrix = Matrix::new(&rows);
    let index = ExactIndex::from_rows(&rows);
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the exact backend answers every query");

    assert_eq!(check.sampled_rows, 8);
    assert_eq!(check.neighbours_per_row, 7);
    assert_eq!(check.matched, 56);
    assert_eq!(check.expected, 56);
    assert_eq!(check.recall(), 1.0);
    assert_eq!(check.admission(), recall::RecallAdmission::Admitted);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_fails_a_degraded_backend() {
    let rows = fan_fixture(60, 0.02);
    let matrix = Matrix::new(&rows);
    let index = FarthestIndex(ExactIndex::from_rows(&rows));
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the degraded backend still answers every query");

    // Per row: the nearest 50 and farthest 50 of 59 candidates share
    // exactly 41 rows, whatever the distances.
    assert_eq!(check.sampled_rows, 60);
    assert_eq!(check.neighbours_per_row, 50);
    assert_eq!(check.matched, 60 * 41);
    assert_eq!(check.expected, 60 * 50);
    assert_eq!(check.admission(), recall::RecallAdmission::Refused);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_honours_configured_options() {
    // The same degraded backend passes under a laxer minimum: the
    // criterion travels with the options, and the evidence records it.
    let rows = fan_fixture(60, 0.02);
    let matrix = Matrix::new(&rows);
    let index = FarthestIndex(ExactIndex::from_rows(&rows));
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            minimum_recall: 0.8,
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the degraded backend still answers every query");
    assert_eq!(check.minimum_recall, 0.8);
    assert_eq!(
        check.admission(),
        recall::RecallAdmission::Admitted,
        "recall 0.82 passes a 0.8 minimum",
    );

    // The comparison depth is the k of the measured recall@k.
    let rows = fan_fixture(8, 0.15);
    let matrix = Matrix::new(&rows);
    let index = ExactIndex::from_rows(&rows);
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            neighbours: NonZero::new(3).expect("three is nonzero"),
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the exact backend answers every query");
    assert_eq!(check.neighbours_per_row, 3);
    assert_eq!(check.expected, 8 * 3);
    assert_eq!(check.matched, 8 * 3);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_rejects_a_degenerate_confidence() {
    let rows = fan_fixture(4, 0.15);
    let matrix = Matrix::new(&rows);
    let index = ExactIndex::from_rows(&rows);
    let result = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            confidence: 1.0,
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    );
    assert_matches!(result, Err(KnnError::SampleConfidence { confidence: 1.0 }),);
}

/// A backend far above the floor resolves its clearance at the pilot's size.
#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_sizes_a_decisive_verdict_sample_at_the_pilot_floor() {
    let rows = fan_fixture(60, 0.02);
    let matrix = Matrix::new(&rows);
    let index = ExactIndex::from_rows(&rows);

    // An exact backend reads recall 1.0 on every pilot row: zero spread
    // over a clearance of 0.11 sizes zero rows, and the pilot's own
    // size is the floor the verdict sample draws at.
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            pilot: NonZero::new(4).expect("four is nonzero"),
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the exact backend answers every query");

    assert_eq!(check.sampled_rows, 4);
    assert_eq!(check.deviation, 0.0);
    assert_eq!(check.recall(), 1.0);
    assert_eq!(check.resolution, 0.0);
    assert_eq!(check.admission(), recall::RecallAdmission::Admitted);
}

/// A minimum close to the measured recall sizes the verdict sample up to the corpus.
#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_sizes_the_verdict_sample_to_the_measured_clearance() {
    let rows = fan_fixture(60, 0.02);
    let matrix = Matrix::new(&rows);
    let index = MixedIndex(ExactIndex::from_rows(&rows));

    // Row `i` matches exactly `50 - (i & 7)` of its exact top 50, so
    // per-row recall ramps 0.86..1.0 and any pilot mixing residues
    // measures real spread. Against a minimum a third of a percent
    // below the aggregate, the clearance the pilot measures sizes a
    // sample far past the corpus, so the verdict sample is exhaustive:
    // ids 0..59 sum their residues to 7 · 28 + 6 = 202 skipped rows.
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            minimum_recall: 0.93,
            pilot: NonZero::new(4).expect("four is nonzero"),
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the mixed backend answers every query");

    assert_eq!(check.sampled_rows, 60, "the verdict sample is exhaustive");
    assert_eq!(check.matched, 60 * 50 - 202);
    assert_eq!(check.expected, 60 * 50);
    assert!(check.deviation > 0.0);
    // A census of the corpus leaves no sampling error to bound, so the
    // aggregate itself clears the minimum.
    assert_eq!(check.resolution, 0.0);
    assert_eq!(check.admission(), recall::RecallAdmission::Admitted);
}

/// A budget that buys nothing leaves the verdict sample at the pilot's size, and a shortfall it
/// cannot demonstrate reads as unresolved rather than refused.
#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_stops_at_the_sampling_budget() {
    let rows = fan_fixture(60, 0.02);
    let matrix = Matrix::new(&rows);
    let index = MixedIndex(ExactIndex::from_rows(&rows));

    // The same ramp runs against a minimum above its aggregate. The sizing asks for the corpus
    // while the budget affords nothing beyond the pilot's own size, and four rows cannot separate
    // 0.94 from what they read.
    let check = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            minimum_recall: 0.94,
            pilot: NonZero::new(4).expect("four is nonzero"),
            budget: Duration::ZERO,
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("the mixed backend answers every query");

    assert_eq!(
        check.sampled_rows, 4,
        "the budget buys no rows past the pilot"
    );
    // Those four rows skip 18 of their 200 exact neighbours, so the
    // aggregate reads 0.91 - below the minimum, and by less than the
    // 0.047 such a sample resolves. A shortfall the sample cannot
    // demonstrate is not a refusal.
    assert_eq!(check.matched, 200 - 18);
    assert_eq!(check.recall(), 0.91);
    assert!(check.recall() < check.minimum_recall);
    assert!(check.resolution > check.minimum_recall - check.recall());
    assert_eq!(check.admission(), recall::RecallAdmission::Unresolved);

    // The recorded resolution is the achieved half-width: the normal
    // quantile of the configured confidence over the sample's own
    // spread, narrowed by the finite-population factor.
    let quantile = normal_quantile(check.confidence).expect("0.99 is in domain");
    let correction = ((60.0 - 4.0) / 59.0_f64).sqrt();
    let expected = quantile * check.deviation / 2.0 * correction;
    assert!(
        (check.resolution - expected).abs() < 1e-12,
        "resolution {} does not follow the recorded deviation {}",
        check.resolution,
        check.deviation,
    );
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings and the parallel build go through machinery Miri cannot execute"
)]
fn published_table_reopens_mapped() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-knn-artifact-{}",
        std::process::id(),
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let rows = plane_fixture();
    let matrix = Matrix::new(&rows);
    let lists = lists_via(ExactIndex::from_rows(&[]), matrix.view(), two_neighbours())
        .expect("the fixture is well-formed");
    let knn = Knn::from_lists::<!>(&lists, two_neighbours()).expect("the fixture is well-formed");

    let mut bytes = Vec::new();
    knn.write_into(&mut bytes)
        .expect("writing to a buffer succeeds");
    let path = dir.join("table.sprs");
    std::fs::write(&path, &bytes).expect("the table file writes");

    let mapped = KnnArchive::new(SprsFile::open(&path).expect("the published file reopens"))
        .expect("the published file opens as a table");

    // The mapped view is the owned table, entry for entry.
    let owned = knn.view();
    let reopened = mapped.view();
    assert_eq!(reopened.rows(), owned.rows());
    assert_eq!(reopened.neighbours(), owned.neighbours());
    for row in 0..owned.rows() {
        let row = NodeRowId::from_usize(row);
        let owned_row: Vec<(u64, f32)> = owned
            .row(row)
            .map(|neighbour| (neighbour.id.as_u64(), neighbour.distance))
            .collect();
        let reopened_row: Vec<(u64, f32)> = reopened
            .row(row)
            .map(|neighbour| (neighbour.id.as_u64(), neighbour.distance))
            .collect();
        assert_eq!(reopened_row, owned_row);
    }

    // Foreign bytes fail the pinned parse.
    let mut foreign = bytes.clone();
    foreign[0] ^= 0x01;
    let foreign_path = dir.join("foreign.sprs");
    std::fs::write(&foreign_path, &foreign).expect("the foreign file writes");
    assert_matches!(SprsFile::open(&foreign_path), Err(OpenSprsError::Header(_)),);

    // A truncated file contradicts the length equation.
    let truncated_path = dir.join("truncated.sprs");
    std::fs::write(&truncated_path, &bytes[..bytes.len() - 4]).expect("the short file writes");
    assert_matches!(
        SprsFile::open(&truncated_path),
        Err(OpenSprsError::Length { .. }),
    );

    // A tampered distance fails the table invariants at open.
    let values_offset = usize::try_from(
        FileHeader::new(
            ValueTag::F32,
            4,
            IndexVariant::U32,
            IndexVariant::U64,
            StorageVariant::Csr,
            ArrayShape::new(&[Dim::new(4), Dim::new(4)])
                .expect("two dimensions fit the maximum shape rank"),
            8,
        )
        .values_offset()
        .expect("the fixture geometry fits u64"),
    )
    .expect("the fixture geometry fits usize");
    let mut tampered = bytes.clone();
    #[expect(
        clippy::little_endian_bytes,
        reason = "the format stores little-endian elements"
    )]
    tampered[values_offset..values_offset + 4].copy_from_slice(&3.0_f32.to_le_bytes());
    let tampered_path = dir.join("tampered.sprs");
    std::fs::write(&tampered_path, &tampered).expect("the tampered file writes");
    assert_matches!(
        KnnArchive::<NodeRowId>::new(
            SprsFile::open(&tampered_path).expect("the tampered file parses")
        ),
        Err(InvalidKnnFile::Invalid(
            KnnValidationError::DistanceOutOfRange { row: 0, .. },
        )),
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg_attr(miri, ignore = "LMDB maps files through FFI Miri cannot execute")]
fn hannoy_honours_the_seam_contract() {
    let dir = std::env::temp_dir().join(format!("hash-graph-atlas-knn-{}", std::process::id()));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");
    let base = camino::Utf8PathBuf::from_path_buf(dir.clone()).expect("the temp path is UTF-8");

    let rows = uniform_rows();
    let matrix = Matrix::new(&rows);
    let embeddings = matrix.view();

    let mut index = HannoyIndex::new(
        &base,
        HannoyIndexOptions {
            map_size: 64 << 20,
            ..
        },
    )
    .expect("the environment opens on a fresh directory");
    index
        .insert_many(
            embeddings
                .iter()
                .enumerate()
                .map(|(row, components)| Embedding {
                    id: NodeRowId::from_usize(row),
                    components,
                }),
        )
        .expect("insertion succeeds");
    NearestNeighboursIndex::<NodeRowId>::build(
        &mut index,
        Xoshiro256PlusPlus::seed_from_u64(42),
        &NoProgress,
    )
    .expect("the build succeeds");

    let query_row = 3_usize;
    let found: Vec<Neighbour<NodeRowId>> = index
        .search_by_id(NodeRowId::new(3), 10)
        .expect("the search succeeds")
        .into_iter()
        .collect();
    assert_eq!(found.len(), 10);
    assert!(found.iter().all(|neighbour| neighbour.id.as_u64() != 3));
    assert!(
        found.is_sorted_by(|left, right| {
            (left.distance, left.id.as_u64()) <= (right.distance, right.id.as_u64())
        }),
        "results are ordered by ascending (distance, id)",
    );
    for neighbour in &found {
        let row = usize::try_from(neighbour.id.as_u64()).expect("test rows fit usize");
        let exact = embeddings[NodeRowId::from_usize(query_row)]
            .cosine_distance(&embeddings[NodeRowId::from_usize(row)]);
        assert!(
            (0.0..=2.0).contains(&neighbour.distance),
            "distances arrive on the [0, 2] cosine scale",
        );
        // hannoy accumulates in f32; the rescaled seam distance agrees
        // with the crate kernel to vector-sum rounding.
        assert!(
            (neighbour.distance - exact).abs() < 1e-4,
            "backend distance {} disagrees with exact distance {exact}",
            neighbour.distance,
        );
    }

    let by_vector: Vec<Neighbour<NodeRowId>> = index
        .search_by_vector(&embeddings[NodeRowId::from_usize(query_row)], 5)
        .expect("the search succeeds")
        .into_iter()
        .collect();
    assert_eq!(
        by_vector.first().map(|nearest| nearest.id.as_u64()),
        Some(3)
    );
    assert!(
        by_vector[0].distance < 1e-5,
        "a stored vector matches itself"
    );

    assert_construction_path_admits(&base, embeddings);

    drop(index);
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

/// 128 fixture rows, each component drawn uniformly from `[-1, 1)` under seed 7.
fn uniform_rows() -> Vec<[f32; PROJECTOR_DIMENSIONS]> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
    core::iter::repeat_with(|| {
        let mut row = [0.0; PROJECTOR_DIMENSIONS];
        for component in &mut row {
            *component = rng.random::<f32>().mul_add(2.0, -1.0);
        }
        row
    })
    .take(128)
    .collect()
}

/// Asserts the production path admits the fixture rows.
///
/// The production path puts a fresh backend behind the construction wrapper. Exact recall admits
/// the lists, and the table comes from those same lists.
fn assert_construction_path_admits(
    base: &camino::Utf8Path,
    embeddings: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
) {
    let construction_base = base.join("construction");
    std::fs::create_dir_all(&construction_base).expect("the temp directory is writable");
    let lists = IndexConstruction::new(
        HannoyIndex::new(
            &construction_base,
            HannoyIndexOptions {
                map_size: 64 << 20,
                ..
            },
        )
        .expect("the environment opens on a fresh directory"),
    )
    .construct(
        embeddings,
        // The width is the wider of the spot check's depth and the stored count.
        recall::SpotCheckOptions::default()
            .neighbours
            .max(DEFAULT_NEIGHBOURS),
        Xoshiro256PlusPlus::seed_from_u64(42),
        &NoProgress,
    )
    .expect("the construction succeeds");
    assert_eq!(lists.rows(), 128);
    assert_eq!(lists.width(), 50);

    let knn = Knn::from_lists::<!>(&lists, DEFAULT_NEIGHBOURS)
        .expect("the table assembles and validates");
    assert_eq!(knn.rows(), 128);
    assert_eq!(knn.neighbours(), 30);

    let check = recall::spot_check_lists::<_, !>(
        &lists,
        embeddings,
        recall::SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(9),
    )
    .expect("the spot check completes");
    assert_eq!(
        check.admission(),
        recall::RecallAdmission::Admitted,
        "recall {} misses the admission minimum",
        check.recall(),
    );
}

#[test]
#[cfg_attr(miri, ignore = "LMDB maps files through FFI Miri cannot execute")]
fn a_watched_hannoy_construction_reports_its_phases_between_the_loops() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-knn-watched-{}",
        std::process::id()
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");
    let base = camino::Utf8PathBuf::from_path_buf(dir.clone()).expect("the temp path is UTF-8");

    let rows = fan_fixture(128, 0.01);
    let matrix = Matrix::new(&rows);
    let progress = RecordingProgress::default();

    let lists = IndexConstruction::new(
        HannoyIndex::new(
            &base,
            HannoyIndexOptions {
                map_size: 64 << 20,
                ..
            },
        )
        .expect("the environment opens on a fresh directory"),
    )
    .construct(
        matrix.view(),
        NonZero::new(4).expect("four is nonzero"),
        Xoshiro256PlusPlus::seed_from_u64(42),
        &progress,
    )
    .expect("the construction succeeds");
    assert_eq!(lists.rows(), 128);

    let reported = progress.reported();
    let phases: Vec<&str> = reported
        .iter()
        .filter_map(|observation| match observation {
            Reported::Phase(phase) => Some(phase.as_str()),
            Reported::Insert(_) | Reported::Descent(_) | Reported::Readback(_) => None,
        })
        .collect();
    assert!(
        !phases.is_empty() && phases.iter().all(|phase| !phase.is_empty()),
        "the backend named no build phase: {phases:?}",
    );

    // The construction's order, and the reason the phases are worth
    // reporting: the rows all enter the backend, the backend links them
    // under its own named phases - the long part - and only then does
    // every row's list come back out.
    let inserted_last = reported
        .iter()
        .rposition(|observation| inserted(observation).is_some());
    let phase_first = reported
        .iter()
        .position(|observation| matches!(observation, Reported::Phase(_)));
    let read_first = reported
        .iter()
        .position(|observation| readback(observation).is_some());
    assert!(
        inserted_last < phase_first && phase_first < read_first,
        "insertion {inserted_last:?}, phases {phase_first:?} and readback {read_first:?} are out \
         of the construction's order",
    );

    let complete = Batch {
        done: 128,
        total: 128,
    };
    assert_eq!(progress.batches(inserted).last(), Some(&complete));
    assert_eq!(progress.batches(readback).last(), Some(&complete));

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}
