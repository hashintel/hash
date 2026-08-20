//! Byte-exact representation quotient forming the fit's distinct-row training domain.
//!
//! Corpora render distinct entities onto byte-identical representation rows, and whole entity types
//! collapse onto a handful of cards. The geometric constructions downstream of the matrix then
//! degenerate on the copies. The copies saturate neighbour lists and make local scales measure
//! zero, and the semantic graph calibrates memberships across their self-edges. The quotient
//! maps every corpus row to its first byte-identical occurrence, which keeps those stages over
//! distinct rows. The published coordinate artifacts still evaluate the full corpus directly,
//! because identical representations project onto one coordinate up to the last-bit motion of
//! the batched forward pass.

use std::{collections::HashMap, io};

use hashql_core::id::{Id as _, IdSlice, IdVec};
use rayon::slice::ParallelSliceMut as _;
use zerocopy::IntoBytes as _;

use crate::{
    file::{
        array::{ArrayVariant, Dim, SizedArrayWriter},
        generation::ScratchDirectory,
    },
    identity::{EdgeRowId, NodeRowId},
    math::{AlignedVecN, FinitePointField, NonNegative},
    salt::{
        file::VectorFile,
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

/// The byte-exact quotient of a representation matrix, holding both row domains of one fit.
///
/// The quotient owns the two row maps and keeps the corpus matrix it was built over; where
/// copies exist it also owns the materialized distinct matrix. It is therefore the one value that
/// answers every domain question of a fit: [`corpus`](Self::corpus) is the publication domain,
/// [`training`](Self::training) the training domain, and [`class_of`](Self::class_of) and
/// [`representative`](Self::representative) translate between them.
pub(super) struct Quotient<'corpus, const N: usize> {
    /// The distinct class of every corpus row.
    classes: IdVec<NodeRowId, DistinctRowId>,
    /// The representative of every distinct class: its first corpus row, strictly ascending.
    representatives: IdVec<DistinctRowId, NodeRowId>,
    /// The corpus matrix the quotient was built over: the publication row domain.
    corpus: &'corpus IdSlice<NodeRowId, AlignedVecN<N>>,
    /// The materialized distinct matrix, present exactly when copies exist.
    ///
    /// An identity quotient materializes nothing: the corpus rows are the distinct rows, and
    /// [`training`](Self::training) reborrows the corpus under the distinct key.
    materialized: Option<VectorFile<DistinctRowId, N>>,
}

impl<'corpus, const N: usize> Quotient<'corpus, N> {
    /// Quotients the corpus by byte equality of its rows and materializes the training matrix.
    ///
    /// Every corpus row maps to a distinct row, and every distinct row names its first corpus
    /// row. Distinct rows ascend with their first occurrence, so gathering the first rows from
    /// the corpus preserves stream order. Row equality is raw byte equality of the representation
    /// vectors: the key distinguishes every representable bit pattern.
    ///
    /// The distinct matrix materializes under `scratch` exactly when copies exist, gathering each
    /// distinct row's bytes from its first corpus occurrence. An identity quotient writes nothing,
    /// because the corpus and the distinct domain are the same rows in the same order.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the scratch file or writing the distinct matrix fails.
    ///
    /// # Panics
    ///
    /// A corpus row count exceeding the store's `u32` row domain panics here: every published
    /// column and the neighbour table's packed columns address rows as `u32`, so a wider corpus
    /// refuses before any stage spends time on it. The call also panics when the matrix it just
    /// wrote does not map back as aligned `f32` rows, which is a defect of the writer rather
    /// than of the input.
    #[tracing::instrument(name = "quotient-build", skip_all)]
    pub(super) fn build(
        corpus: &'corpus IdSlice<NodeRowId, AlignedVecN<N>>,
        scratch: &ScratchDirectory,
    ) -> io::Result<Self> {
        u32::try_from(corpus.len())
            .expect("the corpus row count should fit the store's u32 row domain");

        let mut unique = HashMap::with_capacity(corpus.len());
        let mut classes = IdVec::with_capacity(corpus.len());
        let mut representatives: IdVec<DistinctRowId, NodeRowId> = IdVec::new();

        for (row, vector) in corpus.iter_enumerated() {
            let distinct = *unique
                .entry(vector.as_bytes())
                .or_insert_with(|| representatives.push(row));

            classes.push(distinct);
        }
        tracing::info!(
            rows = classes.len(),
            distinct = representatives.len(),
            "built the representation quotient"
        );

        let materialized = if representatives.len() == classes.len() {
            None
        } else {
            let (path, file) = scratch.file("quotient-distinct.arr")?;
            let mut writer = SizedArrayWriter::new(
                file,
                ArrayVariant::F32,
                &[Dim::new(representatives.len() as u64), Dim::new(N as u64)],
            )?;
            for &row in &representatives {
                writer.write_row(corpus[row].as_bytes())?;
            }
            writer.finish()?;

            Some(VectorFile::open(path).expect("the distinct matrix should map back"))
        };

        Ok(Self {
            classes,
            representatives,
            corpus,
            materialized,
        })
    }

    /// Number of corpus rows.
    pub(super) const fn len(&self) -> usize {
        self.classes.len()
    }

    /// Number of distinct representation rows.
    pub(super) const fn distinct_len(&self) -> usize {
        self.representatives.len()
    }

    /// Whether every corpus row is already distinct.
    ///
    /// An identity quotient lets a fit skip the distinct detour entirely: the corpus and the
    /// distinct domain are the same rows in the same order.
    pub(super) const fn is_identity(&self) -> bool {
        self.representatives.len() == self.classes.len()
    }

    /// The corpus matrix the quotient was built over: the publication row domain.
    pub(super) const fn corpus(&self) -> &'corpus IdSlice<NodeRowId, AlignedVecN<N>> {
        self.corpus
    }

    /// The training matrix of every distinct representation row, in first-occurrence order.
    ///
    /// Where copies exist this is the materialized distinct matrix. Under the identity quotient
    /// it is the corpus matrix reborrowed under the distinct key, because the two domains are
    /// then the same rows in the same order, so no second mapping and no copy exists.
    pub(super) const fn training(&self) -> &IdSlice<DistinctRowId, AlignedVecN<N>> {
        match &self.materialized {
            Some(matrix) => matrix,
            None => IdSlice::from_raw(self.corpus.as_raw()),
        }
    }

    /// Returns the distinct class of a corpus row.
    pub(super) const fn class_of(&self, row: NodeRowId) -> DistinctRowId {
        self.classes[row]
    }

    /// Returns a distinct class's representative: its first corpus row.
    pub(super) const fn representative(&self, distinct: DistinctRowId) -> NodeRowId {
        self.representatives[distinct]
    }

    /// The distinct class of every corpus row, in corpus order.
    pub(super) const fn classes(&self) -> &IdSlice<NodeRowId, DistinctRowId> {
        &self.classes
    }

    /// The representative of every distinct class, strictly ascending.
    pub(super) const fn representatives(&self) -> &IdSlice<DistinctRowId, NodeRowId> {
        &self.representatives
    }

    /// Gathers a corpus frame at the representatives: the training domain's own frame.
    ///
    /// Identical representations project identically, so the gathered frame is the distinct
    /// rows' own coordinates rather than a sample of them.
    pub(super) fn training_frame(
        &self,
        frame: &FinitePointField<NodeRowId>,
    ) -> Box<FinitePointField<DistinctRowId>> {
        frame.gather(self.representatives())
    }

    /// Expands a distinct-domain neighbour table onto the corpus row domain.
    ///
    /// Every corpus row takes its representative's neighbour list, each neighbour named by its own
    /// first corpus row. The gather preserves every table invariant: `representatives` ascends
    /// strictly, so row entries stay strictly ascending, and no entry names its own row - a
    /// distinct list excludes its own index, and expanded entries name first rows only.
    ///
    /// Under the identity quotient the two domains are the same rows in the same order, so the
    /// table is already the corpus's own and no expansion materializes: the call returns `None`.
    pub(super) fn expand_neighbours(
        &self,
        table: &KnnView<'_, DistinctRowId>,
    ) -> Option<Knn<NodeRowId>> {
        if self.is_identity() {
            return None;
        }

        let rows = self.len();
        let neighbours = table.neighbours();

        let entries = rows
            .checked_mul(neighbours)
            .expect("the expanded table stays addressable");
        let (_, columns, distances) = table.matrix().into_raw_storage();

        let mut expanded_columns = vec![0_u32; entries];
        let mut expanded_distances = vec![NonNegative::ZERO; entries];

        for (row, &distinct) in self.classes().iter_enumerated() {
            let source_start = distinct.as_usize() * neighbours;
            let source = source_start..source_start + neighbours;
            let target_start = row.as_usize() * neighbours;
            let target = target_start..target_start + neighbours;

            for (slot, &column) in expanded_columns[target.clone()]
                .iter_mut()
                .zip(&columns[source.clone()])
            {
                let neighbour = self.representative(DistinctRowId::from_u32(column));
                *slot = u32::try_from(neighbour)
                    .expect("corpus rows fit the table's u32 column encoding");
            }

            expanded_distances[target].copy_from_slice(&distances[source]);
        }

        let indptr: Vec<u64> = (0..=rows).map(|row| (row * neighbours) as u64).collect();
        let matrix = KnnMatrix::try_new((rows, rows), indptr, expanded_columns, expanded_distances)
            .map_err(|(_, _, _, error)| error)
            .expect(
                "the gather of a validated table through the ascending first rows stays compressed",
            );

        Some(
            Knn::new(matrix)
                .expect("the gather of a validated table preserves every table invariant"),
        )
    }

    /// Maps relation instances onto the distinct row domain and collapses duplicate readings.
    ///
    /// Endpoints map to their representations' distinct indices. Instances that agree on
    /// `(relation, source, target)` after the map collapse to the one with the highest
    /// effective confidence, breaking ties toward the lowest edge row. Byte-identical rows
    /// render one asserted link as many edge rows, and the trainer weighs the assertion once
    /// rather than per copy. Instances whose endpoints collapse onto one distinct row pass
    /// through, and the index build drops and counts them as self-references. The collapse
    /// orders totally before deduplicating, so the result is a function of the instance set.
    pub(super) fn collapse_instances(
        &self,
        instances: &[RelationInstance<NodeRowId, EdgeRowId>],
    ) -> Vec<RelationInstance<DistinctRowId, EdgeRowId>> {
        let mut mapped: Vec<_> = instances
            .iter()
            .map(|&instance| RelationInstance {
                source: self.class_of(instance.source),
                target: self.class_of(instance.target),
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
                        .cmp(&left.confidence.effective().value())
                })
                .then_with(|| left.edge.cmp(&right.edge))
        });

        mapped.dedup_by(|later, kept| {
            (later.relation, later.source, later.target)
                == (kept.relation, kept.source, kept.target)
        });

        mapped
    }
}

#[cfg(test)]
#[expect(
    clippy::significant_drop_tightening,
    reason = "each test's scratch directory backs the quotient's mapped distinct matrix, so it \
              lives to the end of the assertions on purpose"
)]
mod tests {
    use hashql_core::id::Id as _;
    use zerocopy::IntoBytes as _;

    use super::Quotient;
    use crate::{
        file::generation::ScratchDirectory,
        identity::{EdgeRowId, NodeRowId, OntologyRowId},
        math::{AlignedVecN, BoxedVecN, UnitFraction, non_negative, unit_fraction},
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

    /// A scratch directory of its own per call, under the test process's temp root.
    fn scratch() -> ScratchDirectory {
        static NEXT: core::sync::atomic::AtomicUsize = core::sync::atomic::AtomicUsize::new(0);
        let unique = NEXT.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
        let directory = camino::Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is utf-8")
            .join(format!(
                "hash-graph-atlas-quotient-{}-{unique}",
                std::process::id(),
            ));
        std::fs::create_dir_all(&directory).expect("the temp directory is writable");
        ScratchDirectory::rooted(directory)
    }

    /// The quotient's two maps as raw positions, for compact assertions.
    fn maps(quotient: &Quotient<'_, WIDTH>) -> (Vec<u32>, Vec<u64>) {
        (
            quotient
                .classes()
                .iter()
                .map(|distinct| distinct.as_u32())
                .collect(),
            quotient
                .representatives()
                .iter()
                .map(|&row| row.as_u64())
                .collect(),
        )
    }

    #[test]
    fn identity_quotient() {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(3.0)]);
        let directory = scratch();
        let quotient = Quotient::build(matrix.view(), &directory)
            .expect("the identity quotient persists nothing");

        assert!(quotient.is_identity());
        assert_eq!(quotient.distinct_len(), 3);
        // The identity training matrix is the corpus reborrowed, never a copy.
        assert_eq!(
            quotient.training().as_raw().as_ptr(),
            matrix.view().as_raw().as_ptr(),
        );
        let (classes, representatives) = maps(&quotient);
        assert_eq!(classes, [0, 1, 2]);
        assert_eq!(representatives, [0, 1, 2]);

        // Under the identity quotient the distinct table is already the corpus's own, so no
        // expansion materializes.
        let table_matrix = KnnMatrix::try_new(
            (3, 3),
            vec![0, 1, 2, 3],
            vec![1, 0, 1],
            vec![non_negative!(0.5), non_negative!(0.5), non_negative!(0.25)],
        )
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is compressed");
        let table: Knn<super::DistinctRowId> =
            Knn::new(table_matrix).expect("the fixture table is valid");
        assert!(quotient.expand_neighbours(&table.view()).is_none());
    }

    #[test]
    fn copies_first_occurrence() {
        // The rows A B A C B have distinct classes A(0), B(1), C(3).
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0), row(2.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");

        assert!(!quotient.is_identity());
        assert_eq!(quotient.distinct_len(), 3);
        // Copies materialize a distinct matrix of their own rather than reborrowing the corpus.
        assert_ne!(
            quotient.training().as_raw().as_ptr(),
            matrix.view().as_raw().as_ptr(),
        );
        let (classes, representatives) = maps(&quotient);
        assert_eq!(classes, [0, 1, 0, 2, 1]);
        assert_eq!(representatives, [0, 1, 3]);

        // The maps invert on the distinct domain: a representative's
        // class is the distinct row that named it.
        for (distinct, &representative) in quotient.representatives().iter_enumerated() {
            assert_eq!(quotient.class_of(representative), distinct);
        }
    }

    #[test]
    fn byte_exact_equality() {
        // 0.0 and -0.0 compare equal as floats and differ as bytes; the
        // quotient keys on bytes.
        let mut negative = row(0.0);
        negative[0] = -0.0;
        let matrix = Matrix::new(&[row(0.0), negative, row(0.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");

        assert_eq!(quotient.distinct_len(), 2);
        let (classes, representatives) = maps(&quotient);
        assert_eq!(classes, [0, 1, 0]);
        assert_eq!(representatives, [0, 1]);
    }

    #[test]
    fn representatives_ascending() {
        let matrix = Matrix::new(&[row(5.0), row(5.0), row(4.0), row(4.0), row(6.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");

        let (_, representatives) = maps(&quotient);
        assert_eq!(representatives, [0, 2, 4]);
        let ascending = representatives.is_sorted_by(|one, other| one < other);
        assert!(ascending, "distinct rows follow first occurrence order");
    }

    #[test]
    fn expand_names_representatives() {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0), row(2.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");
        // Distinct table over A(0) B(1) C(2), one neighbour per row.
        let table_matrix = KnnMatrix::try_new(
            (3, 3),
            vec![0, 1, 2, 3],
            vec![1, 0, 1],
            vec![non_negative!(0.5), non_negative!(0.5), non_negative!(0.25)],
        )
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is compressed");
        let table: Knn<super::DistinctRowId> =
            Knn::new(table_matrix).expect("the fixture table is valid");

        let expanded = quotient
            .expand_neighbours(&table.view())
            .expect("a real quotient expands");

        assert_eq!(expanded.rows(), 5);
        assert_eq!(expanded.neighbours(), 1);
        let view = expanded.view();
        let lists: Vec<_> = (0..5)
            .flat_map(|row| {
                view.row(NodeRowId::from_usize(row))
                    .map(|neighbour| (neighbour.id.as_u64(), neighbour.distance.get()))
            })
            .collect();
        // For rows A B A C B, copies take their representative's list and neighbours name first
        // rows (B's first row is 1).
        assert_eq!(lists, [(1, 0.5), (0, 0.5), (1, 0.5), (1, 0.25), (0, 0.5)],);
    }

    #[test]
    fn collapse_strongest_per_triple() {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0), row(2.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");
        let instance =
            |edge: u64, relation: u64, source: u64, target: u64, link: Option<UnitFraction>| {
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
            instance(10, 7, 2, 1, Some(unit_fraction!(0.8))),
            instance(11, 7, 0, 4, Some(unit_fraction!(0.9))),
            // Equal confidence: the lower edge row wins.
            instance(13, 8, 2, 3, None),
            instance(12, 8, 0, 3, None),
            // Endpoints collapsing onto one distinct row pass through.
            instance(14, 7, 0, 2, Some(unit_fraction!(0.5))),
            // A different relation stays a separate reading.
            instance(15, 9, 0, 4, Some(unit_fraction!(0.1))),
        ];

        let collapsed = quotient.collapse_instances(&instances);

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
    fn materialize_gathers_representatives() {
        let matrix = Matrix::new(&[row(1.0), row(2.0), row(1.0), row(3.0)]);
        let directory = scratch();
        let quotient =
            Quotient::build(matrix.view(), &directory).expect("the distinct matrix writes");
        let distinct = quotient.training();

        assert_eq!(distinct.len(), 3);
        for (index, &representative) in quotient.representatives().iter().enumerate() {
            assert_eq!(
                distinct.as_raw()[index].as_bytes(),
                matrix.view()[representative].as_bytes(),
                "distinct row {index} gathers corpus row {representative}",
            );
        }
    }
}
