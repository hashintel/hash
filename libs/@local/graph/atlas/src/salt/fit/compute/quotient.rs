//! Byte-exact representation quotient forming the fit's distinct-row training domain.
//!
//! Corpora render distinct entities onto byte-identical representation rows, and whole entity types
//! collapse onto a handful of cards. The geometric constructions downstream of the matrix then
//! degenerate on the copies. The copies saturate neighbour lists and make local scales measure
//! zero, and the semantic graph calibrates memberships across their self-edges. The quotient
//! maps every corpus row to its first byte-identical occurrence, which keeps those stages over
//! distinct rows. The published coordinate artifacts still evaluate the full corpus directly,
//! because identical representations project identically through the trained model.

use std::{
    collections::HashMap,
    io::{self, BufWriter, Write as _},
};

use camino::Utf8PathBuf;
use hashql_core::id::{Id as _, IdSlice, IdVec};
use rayon::slice::ParallelSliceMut as _;
use zerocopy::IntoBytes as _;

use crate::{
    file::{
        WriteInto,
        array::{ArrayVariant, ArrayWriter, Dim},
        generation::ScratchDirectory,
    },
    identity::{EdgeRowId, NodeRowId},
    math::AlignedVecN,
    salt::{
        knn::table::{Knn, KnnMatrix, KnnView},
        relation::RelationInstance,
    },
};

hashql_core::id::newtype! {
    /// A distinct representation row, one byte-exact class of corpus rows.
    ///
    /// The fit's training row domain, distinct by design from the corpus's [`NodeRowId`]. A corpus
    /// row and its representation's distinct row are different keys, and confusing them is the
    /// wiring defect this type exists to prevent. The `u32` width matches the store's row encoding,
    /// which bounds the corpus and with it the quotient.
    #[id(const)]
    pub(super) struct DistinctRowId(u32)
}

/// Writes one artifact under `directory` and returns its path.
///
/// The scratch twin of the staged-write plumbing: distinct-domain artifacts live beside the
/// generation's scratch files, map back for the stages that consume them, and vanish with the
/// scratch directory. Nothing records the digest - scratch files have no repository binding.
///
/// # Errors
///
/// Returns an error when creating the scratch directory fails, and when creating or writing the
/// file fails.
pub(super) fn write_scratch<A>(
    directory: &ScratchDirectory,
    name: &str,
    artifact: &A,
) -> io::Result<Utf8PathBuf>
where
    A: WriteInto<Error = io::Error>,
{
    let (path, file) = directory.file(name)?;
    let mut writer = BufWriter::new(file);

    let _digest = artifact.write_into(&mut writer)?;
    writer.flush()?;

    Ok(path)
}

/// The byte-exact quotient of a representation matrix.
///
/// Every corpus row maps to a distinct row, and every distinct row names its first corpus row.
/// Distinct rows ascend with their first occurrence, so gathering the first rows from the corpus
/// preserves stream order. Row equality is raw byte equality of the representation vectors: the
/// key distinguishes every representable bit pattern.
pub(super) struct RowQuotient {
    /// The distinct row of every corpus row.
    representative: IdVec<NodeRowId, DistinctRowId>,
    /// The first corpus row of every distinct row, strictly ascending.
    first_rows: IdVec<DistinctRowId, NodeRowId>,
}

impl RowQuotient {
    /// Builds the quotient over the mapped representation rows.
    ///
    /// # Panics
    ///
    /// This panics when the corpus exceeds `u32::MAX` rows. Row identifiers are `u32` throughout
    /// the store.
    pub(super) fn build<const N: usize>(rows: &IdSlice<NodeRowId, AlignedVecN<N>>) -> Self {
        u32::try_from(rows.len()).expect("the corpus row count fits the store's u32 row domain");

        let mut lookup: HashMap<&[u8], DistinctRowId> = HashMap::with_capacity(rows.len());
        let mut representative = IdVec::with_capacity(rows.len());
        let mut first_rows = IdVec::new();

        for (row, vector) in rows.iter_enumerated() {
            let distinct = *lookup
                .entry(vector.as_bytes())
                .or_insert_with(|| first_rows.push(row));

            representative.push(distinct);
        }

        Self {
            representative,
            first_rows,
        }
    }

    /// Number of distinct representation rows.
    pub(super) const fn distinct_len(&self) -> usize {
        self.first_rows.len()
    }

    /// Whether every corpus row is already distinct.
    ///
    /// An identity quotient lets a fit skip the distinct detour entirely: the corpus and the
    /// distinct domain are the same rows in the same order.
    pub(super) const fn is_identity(&self) -> bool {
        self.first_rows.len() == self.representative.len()
    }

    /// Returns the distinct row representing a corpus row.
    pub(super) const fn representative(&self, row: NodeRowId) -> DistinctRowId {
        self.representative[row]
    }

    /// Returns the first corpus row of a distinct row.
    pub(super) const fn first_row(&self, distinct: DistinctRowId) -> NodeRowId {
        self.first_rows[distinct]
    }

    /// The distinct row of every corpus row, in corpus order.
    pub(super) const fn representatives(&self) -> &IdSlice<NodeRowId, DistinctRowId> {
        &self.representative
    }

    /// The first corpus row of every distinct row, strictly ascending.
    pub(super) const fn first_rows(&self) -> &IdSlice<DistinctRowId, NodeRowId> {
        &self.first_rows
    }
}

/// Materializes the distinct representation matrix under the given directory.
///
/// The written file is the standard `f32[D, N]` array artifact: the distinct rows gathered from
/// the corpus in first-occurrence order, mapping exactly as the corpus matrix maps.
///
/// # Errors
///
/// Returns an error when creating the scratch directory or the file fails. Writing a row returns
/// an error when it fails.
pub(super) fn materialize_distinct<const N: usize>(
    directory: &ScratchDirectory,
    rows: &IdSlice<NodeRowId, AlignedVecN<N>>,
    quotient: &RowQuotient,
) -> io::Result<Utf8PathBuf> {
    let (path, file) = directory.file("quotient-distinct.arr")?;

    let mut writer = ArrayWriter::new(
        BufWriter::new(file),
        ArrayVariant::F32,
        &[Dim::new(N as u64)],
    )?;

    for &row in quotient.first_rows() {
        writer.write_row(rows[row].as_bytes())?;
    }
    writer.finish()?;

    Ok(path)
}

/// Expands a distinct-domain neighbour table onto the corpus row domain.
///
/// Every corpus row takes its representative's neighbour list, each neighbour named by its own
/// first corpus row. The gather preserves every table invariant: `first_rows` ascends strictly, so
/// row entries stay strictly ascending, and no entry names its own row - a distinct list excludes
/// its own index, and expanded entries name first rows only.
pub(super) fn expand_neighbours(
    table: &KnnView<'_, DistinctRowId>,
    quotient: &RowQuotient,
) -> Knn<NodeRowId> {
    let rows = quotient.representatives().len();
    let neighbours = table.neighbours();
    let entries = rows
        .checked_mul(neighbours)
        .expect("the expanded table stays addressable");
    let (_, columns, distances) = table.matrix().into_raw_storage();

    let mut expanded_columns = vec![0_u32; entries];
    let mut expanded_distances = vec![0.0_f32; entries];

    for (row, &distinct) in quotient.representatives().iter_enumerated() {
        let source_start = distinct.as_usize() * neighbours;
        let source = source_start..source_start + neighbours;
        let target_start = row.as_usize() * neighbours;
        let target = target_start..target_start + neighbours;

        for (slot, &column) in expanded_columns[target.clone()]
            .iter_mut()
            .zip(&columns[source.clone()])
        {
            let neighbour = quotient.first_row(DistinctRowId::from_u32(column));
            *slot =
                u32::try_from(neighbour).expect("corpus rows fit the table's u32 column encoding");
        }

        expanded_distances[target].copy_from_slice(&distances[source]);
    }

    let indptr: Vec<u64> = (0..=rows).map(|row| (row * neighbours) as u64).collect();
    let matrix = KnnMatrix::try_new((rows, rows), indptr, expanded_columns, expanded_distances)
        .map_err(|(_, _, _, error)| error)
        .expect(
            "the gather of a validated table through the ascending first rows stays compressed",
        );

    Knn::new(matrix).expect("the gather of a validated table preserves every table invariant")
}

/// Maps relation instances onto the distinct row domain and collapses duplicate readings.
///
/// Endpoints map to their representations' distinct indices. Instances that agree on `(relation,
/// source, target)` after the map collapse to the one with the highest effective confidence,
/// breaking ties toward the lowest edge row. Byte-identical rows render one asserted link as many
/// edge rows, and the trainer weighs the assertion once rather than per copy. Instances whose
/// endpoints collapse onto one distinct row pass through, and the index build drops and counts them
/// as self-references. The collapse orders totally before deduplicating, so the result is a
/// function of the instance set.
pub(super) fn collapse_instances(
    instances: &[RelationInstance<NodeRowId, EdgeRowId>],
    quotient: &RowQuotient,
) -> Vec<RelationInstance<DistinctRowId, EdgeRowId>> {
    let mut mapped: Vec<_> = instances
        .iter()
        .map(|&instance| RelationInstance {
            source: quotient.representative(instance.source),
            target: quotient.representative(instance.target),
            edge: instance.edge,
            relation: instance.relation,
            confidence: instance.confidence,
            multiplicity: instance.multiplicity,
        })
        .collect();

    mapped.par_sort_unstable_by(|left, right| {
        (left.relation, left.source, left.target)
            .cmp(&(right.relation, right.source, right.target))
            .then_with(|| {
                right
                    .confidence
                    .effective()
                    .value()
                    .total_cmp(&left.confidence.effective().value())
            })
            .then_with(|| left.edge.cmp(&right.edge))
    });

    mapped.dedup_by(|later, kept| {
        (later.relation, later.source, later.target) == (kept.relation, kept.source, kept.target)
    });

    mapped
}

#[cfg(test)]
mod tests {
    use hashql_core::id::Id as _;
    use zerocopy::IntoBytes as _;

    use super::RowQuotient;
    use crate::{
        file::array::ArrayFile,
        identity::{EdgeRowId, NodeRowId, OntologyRowId},
        math::{AlignedVecN, BoxedVecN},
        salt::{
            knn::table::{Knn, KnnMatrix},
            relation::{RelationConfidence, RelationInstance},
        },
    };

    /// Component width keeping every row on the aligned-load boundary.
    const WIDTH: usize = 8;

    /// Fixture capacity in components: the largest test corpus.
    const CAPACITY: usize = 8 * WIDTH;

    /// Fixture rows in SIMD-aligned row-major storage.
    struct Matrix {
        storage: BoxedVecN<CAPACITY>,
        rows: usize,
    }

    impl Matrix {
        fn new(rows: &[[f32; WIDTH]]) -> Self {
            let mut storage = BoxedVecN::zero();
            let (chunks, _) = storage.as_array_mut().as_chunks_mut::<WIDTH>();
            assert!(rows.len() <= chunks.len(), "the fixture fits the capacity");
            for (slot, row) in chunks.iter_mut().zip(rows) {
                *slot = *row;
            }
            Self {
                storage,
                rows: rows.len(),
            }
        }

        fn view(&self) -> &hashql_core::id::IdSlice<NodeRowId, AlignedVecN<WIDTH>> {
            hashql_core::id::IdSlice::from_raw(
                AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * WIDTH])
                    .expect("boxed storage is aligned"),
            )
        }
    }

    fn row(fill: f32) -> [f32; WIDTH] {
        [fill; WIDTH]
    }

    /// The quotient's two maps as raw positions, for compact assertions.
    fn maps(quotient: &RowQuotient) -> (Vec<u32>, Vec<u64>) {
        (
            quotient
                .representatives()
                .iter()
                .map(|distinct| distinct.as_u32())
                .collect(),
            quotient
                .first_rows()
                .iter()
                .map(|&row| row.as_u64())
                .collect(),
        )
    }

    #[test]
    fn distinct_corpus_is_the_identity() {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(3.0)]);
        let quotient = RowQuotient::build(matrix.view());

        assert!(quotient.is_identity());
        assert_eq!(quotient.distinct_len(), 3);
        let (representatives, first_rows) = maps(&quotient);
        assert_eq!(representatives, [0, 1, 2]);
        assert_eq!(first_rows, [0, 1, 2]);
    }

    #[test]
    fn copies_map_to_their_first_occurrence() {
        // The rows A B A C B have distinct classes A(0), B(1), C(3).
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0), row(2.0)]);
        let quotient = RowQuotient::build(matrix.view());

        assert!(!quotient.is_identity());
        assert_eq!(quotient.distinct_len(), 3);
        let (representatives, first_rows) = maps(&quotient);
        assert_eq!(representatives, [0, 1, 0, 2, 1]);
        assert_eq!(first_rows, [0, 1, 3]);

        // The maps invert on the distinct domain: a first row's
        // representative is the distinct row that named it.
        for (distinct, &first) in quotient.first_rows().iter_enumerated() {
            assert_eq!(quotient.representative(first), distinct);
        }
    }

    #[test]
    fn equality_is_byte_exact() {
        // 0.0 and -0.0 compare equal as floats and differ as bytes; the
        // quotient keys on bytes.
        let mut negative = row(0.0);
        negative[0] = -0.0;
        let matrix = Matrix::new(&[row(0.0), negative, row(0.0)]);
        let quotient = RowQuotient::build(matrix.view());

        assert_eq!(quotient.distinct_len(), 2);
        let (representatives, first_rows) = maps(&quotient);
        assert_eq!(representatives, [0, 1, 0]);
        assert_eq!(first_rows, [0, 1]);
    }

    #[test]
    fn first_rows_ascend_with_the_stream() {
        let matrix = Matrix::new(&[row(5.0), row(5.0), row(4.0), row(4.0), row(6.0)]);
        let quotient = RowQuotient::build(matrix.view());

        let (_, first_rows) = maps(&quotient);
        assert_eq!(first_rows, [0, 2, 4]);
        let ascending = first_rows.is_sorted_by(|one, other| one < other);
        assert!(ascending, "distinct rows follow first occurrence order");
    }

    /// The A B A C B quotient every remap test reads against.
    fn fixture_quotient() -> RowQuotient {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0), row(2.0)]);
        RowQuotient::build(matrix.view())
    }

    #[test]
    fn expanded_neighbours_name_first_rows() {
        let quotient = fixture_quotient();
        // Distinct table over A(0) B(1) C(2), one neighbour per row.
        let matrix = KnnMatrix::try_new(
            (3, 3),
            vec![0, 1, 2, 3],
            vec![1, 0, 1],
            vec![0.5, 0.5, 0.25],
        )
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is compressed");
        let table: Knn<super::DistinctRowId> =
            Knn::new(matrix).expect("the fixture table is valid");

        let expanded = super::expand_neighbours(&table.view(), &quotient);

        assert_eq!(expanded.rows(), 5);
        assert_eq!(expanded.neighbours(), 1);
        let view = expanded.view();
        let lists: Vec<(u64, f32)> = (0..5)
            .flat_map(|row| {
                view.row(NodeRowId::from_usize(row))
                    .map(|neighbour| (neighbour.id.as_u64(), neighbour.distance))
            })
            .collect();
        // For rows A B A C B, copies take their representative's list and neighbours name first
        // rows (B's first row is 1).
        assert_eq!(lists, [(1, 0.5), (0, 0.5), (1, 0.5), (1, 0.25), (0, 0.5)],);
    }

    #[test]
    fn collapse_keeps_the_strongest_reading_per_triple() {
        let quotient = fixture_quotient();
        let instance = |edge: u64, relation: u64, source: u64, target: u64, link: Option<f32>| {
            RelationInstance {
                edge: EdgeRowId::new(edge),
                relation: OntologyRowId::new(relation),
                source: NodeRowId::new(source),
                target: NodeRowId::new(target),
                confidence: RelationConfidence {
                    link,
                    source: None,
                    target: None,
                },
                multiplicity: 1,
            }
        };

        let instances = [
            // A ghost pair, because rows 2 and 0 are copies of A and rows 1 and 4 are copies of B.
            // The stronger reading wins.
            instance(10, 7, 2, 1, Some(0.8)),
            instance(11, 7, 0, 4, Some(0.9)),
            // Equal confidence: the lower edge row wins.
            instance(13, 8, 2, 3, None),
            instance(12, 8, 0, 3, None),
            // Endpoints collapsing onto one distinct row pass through.
            instance(14, 7, 0, 2, Some(0.5)),
            // A different relation stays a separate reading.
            instance(15, 9, 0, 4, Some(0.1)),
        ];

        let collapsed = super::collapse_instances(&instances, &quotient);

        let readings: Vec<(u64, u64, u64, u64)> = collapsed
            .iter()
            .map(|instance| {
                (
                    instance.relation.as_u64(),
                    instance.source.as_u64(),
                    instance.target.as_u64(),
                    instance.edge.as_u64(),
                )
            })
            .collect();
        assert_eq!(
            readings,
            [(7, 0, 0, 14), (7, 0, 1, 11), (8, 0, 2, 12), (9, 0, 1, 15)],
        );
    }

    #[test]
    fn materialized_distinct_matrix_maps_back_byte_for_byte() {
        let directory = camino::Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is utf-8")
            .join(format!("hash-graph-atlas-quotient-{}", std::process::id()));
        std::fs::create_dir_all(&directory).expect("the temp directory is writable");

        let directory = crate::file::generation::ScratchDirectory::rooted(directory);

        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0)]);
        let quotient = RowQuotient::build(matrix.view());
        let path = super::materialize_distinct(&directory, matrix.view(), &quotient)
            .expect("the distinct matrix writes");

        let file = ArrayFile::open(&path).expect("the distinct matrix reopens");
        let distinct: &[AlignedVecN<WIDTH>] = file.vectors().expect("the file is aligned f32 rows");

        assert_eq!(distinct.len(), 3);
        for (index, &first) in quotient.first_rows().iter().enumerate() {
            assert_eq!(
                distinct[index].as_bytes(),
                matrix.view()[first].as_bytes(),
                "distinct row {index} gathers corpus row {first}",
            );
        }

        // The distinct matrix is scratch: its storage lives and dies with the directory.
        drop(file);
        drop(directory);
        assert!(
            ArrayFile::open(&path).is_err(),
            "the scratch storage is removed with its directory",
        );
    }
}
