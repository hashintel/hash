#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts; fixtures use exactly representable values or \
              compare cross-path results of the same kernel"
)]

use core::num::NonZero;

use rand::{Rng, RngExt as _, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    DEFAULT_NEIGHBOURS, Embedding, NearestNeighboursIndex, Neighbour,
    artifact::{InvalidKnnFile, MappedKnn},
    error::KnnError,
    hannoy::{HannoyIndex, HannoyIndexOptions},
    recall,
    table::{Knn, KnnMatrix, KnnValidationError},
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayShape, Dim},
        sprs::{
            FileHeader, IndexVariant, StorageVariant, ValueTag,
            read::{OpenSprsError, SprsFile},
        },
    },
    math::{AlignedVecN, BoxedVecN},
};

/// Fixture capacity in components: the largest test corpus.
const MATRIX_CAPACITY: usize = 128 * PROJECTOR_DIMENSIONS;

/// Fixture rows in SIMD-aligned row-major storage, the shape a mapped
/// `f32[T, 512]` artifact yields.
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

    fn view(&self) -> &[AlignedVecN<PROJECTOR_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * PROJECTOR_DIMENSIONS])
            .expect("boxed storage is aligned")
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
    ) -> Vec<Neighbour> {
        let mut all: Vec<Neighbour> = self
            .rows
            .iter()
            .enumerate()
            .filter(|&(row, _)| Some(row) != exclude)
            .map(|(row, stored)| Neighbour {
                id: NodeRowId::new(row as u64),
                distance: query.cosine_distance(stored),
            })
            .collect();
        all.sort_unstable_by(|left, right| {
            left.distance
                .total_cmp(&right.distance)
                .then_with(|| left.id.get().cmp(&right.id.get()))
        });
        all
    }

    fn ranked_by_id(&self, id: NodeRowId) -> Vec<Neighbour> {
        let row = usize::try_from(id.get()).expect("test rows fit usize");
        self.ranked(&self.rows[row], Some(row))
    }
}

impl NearestNeighboursIndex for ExactIndex {
    type Error = !;

    #[expect(
        clippy::panic_in_result_fn,
        reason = "the fixture asserts its own dense-insert contract"
    )]
    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
    ) -> Result<(), Self::Error> {
        for embedding in embeddings {
            assert_eq!(
                usize::try_from(embedding.id.get()).expect("test rows fit usize"),
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

    fn build(&mut self, _rng: impl Rng + SeedableRng) -> Result<(), Self::Error> {
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let mut ranked = self.ranked(query, None);
        ranked.truncate(limit);
        Ok(ranked)
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
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

macro_rules! delegate_all_but_search_by_id {
    () => {
        type Error = !;

        fn insert_many<'embedding>(
            &mut self,
            embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
        ) -> Result<(), Self::Error> {
            self.0.insert_many(embeddings)
        }

        fn build(&mut self, rng: impl Rng + SeedableRng) -> Result<(), Self::Error> {
            self.0.build(rng)
        }

        fn search_by_vector(
            &self,
            query: &crate::math::AlignedVecN<PROJECTOR_DIMENSIONS>,
            limit: usize,
        ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
            self.0.search_by_vector(query, limit)
        }
    };
}

impl NearestNeighboursIndex for FarthestIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let ranked = self.0.ranked_by_id(id);
        let skip = ranked.len().saturating_sub(limit);
        Ok(ranked.into_iter().skip(skip))
    }
}

impl NearestNeighboursIndex for ShortIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit.saturating_sub(1));
        Ok(ranked)
    }
}

impl NearestNeighboursIndex for DoubledIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit);
        ranked[1] = ranked[0];
        Ok(ranked)
    }
}

impl NearestNeighboursIndex for EscapingIndex {
    delegate_all_but_search_by_id!();

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let rows = self.0.rows.len() as u64;
        let mut ranked = self.0.ranked_by_id(id);
        ranked.truncate(limit);
        Ok(ranked.into_iter().map(move |neighbour| Neighbour {
            id: NodeRowId::new(neighbour.id.get() + rows),
            distance: neighbour.distance,
        }))
    }
}

fn axis(component: usize, value: f32) -> [f32; PROJECTOR_DIMENSIONS] {
    let mut row = [0.0; PROJECTOR_DIMENSIONS];
    row[component] = value;
    row
}

/// `e0`, `e1`, `e0 + e1`, and `-e0`: every pairwise distance is known
/// geometry.
fn plane_fixture() -> [[f32; PROJECTOR_DIMENSIONS]; 4] {
    let mut mix = [0.0; PROJECTOR_DIMENSIONS];
    mix[0] = 1.0;
    mix[1] = 1.0;
    [axis(0, 1.0), axis(1, 1.0), mix, axis(0, -1.0)]
}

/// Distinct unit vectors fanned through the `(0, 1)` plane; distance is
/// strictly monotone in index separation.
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

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn build_matches_hand_computed_neighbours() {
    let rows = plane_fixture();
    let index = ExactIndex::from_rows(&rows);
    let knn = Knn::build(&index, rows.len(), two_neighbours()).expect("the fixture is well-formed");

    assert_eq!(knn.rows(), 4);
    assert_eq!(knn.neighbours(), 2);

    let matrix = Matrix::new(&rows);
    let embeddings = matrix.view();
    let distance = |left: usize, right: usize| embeddings[left].cosine_distance(&embeddings[right]);
    let diagonal = distance(0, 2);
    assert!((f64::from(diagonal) - (1.0 - 0.5_f64.sqrt())).abs() < 1e-6);

    let view = knn.view();
    let stored: Vec<Vec<(u64, f32)>> = (0..4)
        .map(|row| {
            view.row(row)
                .map(|neighbour| (neighbour.id.get(), neighbour.distance))
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
fn build_rejects_unsatisfiable_shapes() {
    let rows = plane_fixture();
    let index = ExactIndex::from_rows(&rows);

    assert!(matches!(
        Knn::build(&index, 1, two_neighbours()),
        Err(KnnError::Invalid(KnnValidationError::InsufficientRows {
            rows: 1
        })),
    ));
    assert!(matches!(
        Knn::build(&index, 4, NonZero::new(4).expect("four is nonzero")),
        Err(KnnError::Invalid(KnnValidationError::NeighbourBounds {
            neighbours: 4,
            rows: 4,
        })),
    ));
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn build_rejects_malformed_backend_responses() {
    let rows = plane_fixture();

    let short = ShortIndex(ExactIndex::from_rows(&rows));
    assert!(matches!(
        Knn::build(&short, rows.len(), two_neighbours()),
        Err(KnnError::SearchCount {
            expected: 2,
            actual: 1,
            ..
        }),
    ));

    let doubled = DoubledIndex(ExactIndex::from_rows(&rows));
    assert!(matches!(
        Knn::build(&doubled, rows.len(), two_neighbours()),
        Err(KnnError::DuplicateNeighbour { .. }),
    ));

    let escaping = EscapingIndex(ExactIndex::from_rows(&rows));
    assert!(matches!(
        Knn::build(&escaping, rows.len(), two_neighbours()),
        Err(KnnError::NeighbourOutOfBounds { rows: 4, .. }),
    ));
}

#[test]
fn validation_rejects_each_broken_invariant() {
    // Row 0 referencing itself.
    let matrix = KnnMatrix::new((2, 2), vec![0, 1, 2], vec![0, 0], vec![0.5, 0.5]);
    assert_eq!(
        Knn::new(matrix).expect_err("self reference"),
        KnnValidationError::SelfNeighbour { row: 0 }
    );

    // A distance beyond the cosine range.
    let matrix = KnnMatrix::new((3, 3), vec![0, 1, 2, 3], vec![1, 2, 0], vec![2.5, 1.0, 1.0]);
    assert_eq!(
        Knn::new(matrix).expect_err("distance beyond 2"),
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
    assert!(matches!(
        Knn::new(matrix).expect_err("non-finite distance"),
        KnnValidationError::NonFiniteDistance {
            row: 0,
            neighbour: 1,
            ..
        },
    ));

    // Ragged rows.
    let matrix = KnnMatrix::new(
        (3, 3),
        vec![0, 2, 3, 4],
        vec![1, 2, 0, 0],
        vec![0.5, 0.5, 0.5, 0.5],
    );
    assert_eq!(
        Knn::new(matrix).expect_err("ragged rows"),
        KnnValidationError::RaggedRow {
            row: 0,
            expected: 1,
            actual: 2,
        },
    );

    // Column-compressed storage.
    let matrix = KnnMatrix::new_csc((2, 2), vec![0, 1, 2], vec![1, 0], vec![0.5, 0.5]);
    assert_eq!(
        Knn::new(matrix).expect_err("column compression"),
        KnnValidationError::ColumnCompressed,
    );

    // A rectangular domain.
    let matrix = KnnMatrix::new((2, 3), vec![0, 1, 2], vec![1, 2], vec![0.5, 0.5]);
    assert_eq!(
        Knn::new(matrix).expect_err("rectangular domain"),
        KnnValidationError::NotSquare {
            rows: 2,
            columns: 3
        },
    );

    // An empty neighbour set.
    let matrix = KnnMatrix::new((2, 2), vec![0, 0, 0], vec![], vec![]);
    assert_eq!(
        Knn::new(matrix).expect_err("empty rows"),
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
    assert!(check.meets_minimum());
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
    assert!(!check.meets_minimum());
}

#[test]
#[cfg_attr(
    miri,
    ignore = "rayon's crossbeam-epoch registry trips a known Stacked Borrows false positive"
)]
fn spot_check_honours_configured_options() {
    // The same degraded backend passes under a laxer gate: the gate
    // travels with the options, and the evidence records it.
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
    assert!(check.meets_minimum(), "recall 0.82 passes a 0.8 gate");

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
fn spot_check_rejects_a_meaningless_sampling_budget() {
    let rows = fan_fixture(2, 0.15);
    let matrix = Matrix::new(&rows);
    let index = ExactIndex::from_rows(&rows);
    let result = recall::spot_check(
        &index,
        matrix.view(),
        recall::SpotCheckOptions {
            defect_rate: 0.0,
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    );
    assert!(matches!(
        result,
        Err(KnnError::SampleBudget {
            defect_rate: 0.0,
            confidence: 0.999,
        }),
    ));
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
    let index = ExactIndex::from_rows(&rows);
    let knn = Knn::build(&index, rows.len(), two_neighbours()).expect("the fixture is well-formed");

    let mut bytes = Vec::new();
    knn.write_into(&mut bytes)
        .expect("writing to a buffer succeeds");
    let path = dir.join("table.sprs");
    std::fs::write(&path, &bytes).expect("the table file writes");

    let mapped = MappedKnn::new(SprsFile::open(&path).expect("the published file reopens"))
        .expect("the published file opens as a table");

    // The mapped view is the owned table, entry for entry.
    let owned = knn.view();
    let reopened = mapped.view();
    assert_eq!(reopened.rows(), owned.rows());
    assert_eq!(reopened.neighbours(), owned.neighbours());
    for row in 0..owned.rows() {
        let owned_row: Vec<(u64, f32)> = owned
            .row(row)
            .map(|neighbour| (neighbour.id.get(), neighbour.distance))
            .collect();
        let reopened_row: Vec<(u64, f32)> = reopened
            .row(row)
            .map(|neighbour| (neighbour.id.get(), neighbour.distance))
            .collect();
        assert_eq!(reopened_row, owned_row);
    }

    // Foreign bytes fail the pinned parse.
    let mut foreign = bytes.clone();
    foreign[0] ^= 0x01;
    let foreign_path = dir.join("foreign.sprs");
    std::fs::write(&foreign_path, &foreign).expect("the foreign file writes");
    assert!(matches!(
        SprsFile::open(&foreign_path),
        Err(OpenSprsError::Header(_)),
    ));

    // A truncated file contradicts the length equation.
    let truncated_path = dir.join("truncated.sprs");
    std::fs::write(&truncated_path, &bytes[..bytes.len() - 4]).expect("the short file writes");
    assert!(matches!(
        SprsFile::open(&truncated_path),
        Err(OpenSprsError::Length { .. }),
    ));

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
    assert!(matches!(
        MappedKnn::new(SprsFile::open(&tampered_path).expect("the tampered file parses")),
        Err(InvalidKnnFile::Invalid(
            KnnValidationError::DistanceOutOfRange { row: 0, .. },
        )),
    ));

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg_attr(miri, ignore = "LMDB maps files through FFI Miri cannot execute")]
fn hannoy_honours_the_seam_contract() {
    let dir = std::env::temp_dir().join(format!("hash-graph-atlas-knn-{}", std::process::id()));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");
    let base = camino::Utf8PathBuf::from_path_buf(dir.clone()).expect("the temp path is UTF-8");

    let rows: Vec<[f32; PROJECTOR_DIMENSIONS]> = {
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
    };
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
                    id: NodeRowId::new(row as u64),
                    components,
                }),
        )
        .expect("insertion succeeds");
    index
        .build(Xoshiro256PlusPlus::seed_from_u64(42))
        .expect("the build succeeds");

    let query_row = 3_usize;
    let found: Vec<Neighbour> = index
        .search_by_id(NodeRowId::new(3), 10)
        .expect("the search succeeds")
        .into_iter()
        .collect();
    assert_eq!(found.len(), 10);
    assert!(found.iter().all(|neighbour| neighbour.id.get() != 3));
    assert!(
        found.is_sorted_by(|left, right| {
            (left.distance, left.id.get()) <= (right.distance, right.id.get())
        }),
        "results are ordered by ascending (distance, id)",
    );
    for neighbour in &found {
        let row = usize::try_from(neighbour.id.get()).expect("test rows fit usize");
        let exact = embeddings[query_row].cosine_distance(&embeddings[row]);
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

    let by_vector: Vec<Neighbour> = index
        .search_by_vector(&embeddings[query_row], 5)
        .expect("the search succeeds")
        .into_iter()
        .collect();
    assert_eq!(by_vector.first().map(|nearest| nearest.id.get()), Some(3));
    assert!(
        by_vector[0].distance < 1e-5,
        "a stored vector matches itself"
    );

    let knn = Knn::build(&index, rows.len(), DEFAULT_NEIGHBOURS)
        .expect("the table assembles and validates");
    assert_eq!(knn.rows(), 128);
    assert_eq!(knn.neighbours(), 30);

    let check = recall::spot_check(
        &index,
        embeddings,
        recall::SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(9),
    )
    .expect("the spot check completes");
    assert!(
        check.meets_minimum(),
        "recall {} misses the gate",
        check.recall(),
    );

    drop(index);
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}
