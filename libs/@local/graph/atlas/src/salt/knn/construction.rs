//! k-nearest-neighbour list construction.
//!
//! [`KnnConstruction`] produces one [`NeighbourLists`] value at a width sufficient for both recall
//! measurement and table storage. Keeping the wider lists lets a recall check inspect more
//! neighbours than the persisted prefix contains, without a second construction.
//!
//! [`IndexConstruction`] produces these lists through a [`NearestNeighboursIndex`] search backend.
//! A constructor that derives lists directly can implement the trait without maintaining a search
//! index.

use core::{
    num::NonZero,
    sync::atomic::{Atomic, Ordering},
};

use hashql_core::id::{Id, IdMatrix, IdSlice};
use rand::{Rng, SeedableRng};
use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};

use super::{Embedding, NearestNeighboursIndex, Neighbour, error::KnnError};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, NonNegative},
    progress::{Batch, Progress},
    salt::knn::table::KnnValidationError,
};

/// Rows one batched loop covers between progress reports.
///
/// Insertion and readback each report once per 4,096 rows and at completion. A million-row loop
/// produces ceil(1,000,000 / 4,096) = 245 observations, retaining progress updates without per-row
/// reporting.
const REPORT_CADENCE: usize = 4_096;

/// Tests whether `done` is a report-cadence multiple or the completed total.
///
/// For a nonempty loop over `1..=total`, this reports every [`REPORT_CADENCE`] rows and at
/// completion. A loop below the cadence reports exactly once.
const fn reports_at(done: usize, total: usize) -> bool {
    done.is_multiple_of(REPORT_CADENCE) || done == total
}

hashql_core::id::newtype! {
    /// One slot of a row's neighbour list, ascending by `(distance, id)`.
    #[id(const)]
    pub(crate) struct NeighbourSlot(u32)
}

/// Per-row approximate neighbour lists at one uniform width.
///
/// Row `i` holds exactly [`width`](Self::width) entries. Producers must supply distinct non-self
/// neighbours in ascending `(distance, id)` order, with distances on the `[0, 2]` cosine scale.
/// This type checks the rectangular shape only.
#[derive(Debug)]
pub(crate) struct NeighbourLists<N> {
    entries: IdMatrix<N, NeighbourSlot, Neighbour<N>>,
}

impl<N> NeighbourLists<N>
where
    N: Id,
{
    /// Stores row-major entries satisfying the producer's per-row contract.
    ///
    /// # Panics
    ///
    /// This panics when `width` is zero or does not divide the entry count exactly.
    pub(super) fn new(entries: Box<[Neighbour<N>]>, width: usize) -> Self {
        Self {
            entries: IdMatrix::from_flat(entries.into_vec(), width),
        }
    }

    /// Returns the row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.entries.rows()
    }

    /// Returns the neighbours held per row.
    #[inline]
    #[must_use]
    pub(crate) const fn width(&self) -> usize {
        self.entries.columns()
    }

    /// Returns row `row`'s neighbours in ascending `(distance, id)` order.
    ///
    /// # Panics
    ///
    /// This panics when `row` is outside the row domain.
    #[inline]
    #[must_use]
    pub(crate) const fn row(&self, row: N) -> &[Neighbour<N>]
    where
        N: [const] Id,
    {
        self.entries.row(row).as_raw()
    }
}

/// A constructor of approximate neighbour lists over one row domain.
pub(crate) trait KnnConstruction<N>
where
    N: Id,
{
    /// The failure [`construct`](Self::construct) reports.
    type Error;

    /// Produces every row's approximate non-self neighbours at a requested width.
    ///
    /// `embeddings` must hold l2-normalized projector representations in row order. The result
    /// clamps `width` to the number of non-self rows. `rng` drives randomized choices. A seed
    /// determines the random stream, without requiring deterministic parallel update order.
    ///
    /// # Implementation Note
    ///
    /// Implementations must satisfy the per-row [`NeighbourLists`] contract and report batched
    /// loops and named phases through `progress`. Reports observe the construction without
    /// supplying algorithm inputs. Parallel constructions can still vary between runs with the same
    /// inputs and observer.
    ///
    /// # Errors
    ///
    /// Returns a constructor error when the corpus is degenerate or the construction fails.
    fn construct<P>(
        &mut self,
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        width: NonZero<usize>,
        rng: impl Rng + SeedableRng,
        progress: &P,
    ) -> Result<NeighbourLists<N>, Self::Error>
    where
        P: Progress + Sync;
}

/// A [`KnnConstruction`] that obtains lists from a [`NearestNeighboursIndex`].
///
/// The construction ingests every row and links the backend under `rng`, then queries each row's
/// neighbours in parallel. The assembled lists are deterministic for a deterministic backend
/// because the construction writes each row's results into that row's slot regardless of completion
/// order.
///
/// A result of the wrong length, a duplicate neighbour or a neighbour outside the row domain fails
/// construction. Ordering, self-exclusion and distance semantics rely on the backend's trait
/// contract.
#[derive(Debug)]
pub(crate) struct IndexConstruction<I>(I);

impl<I> IndexConstruction<I> {
    /// Creates a list constructor from an empty search backend.
    pub(crate) const fn new(index: I) -> Self {
        Self(index)
    }
}

impl<N, I> KnnConstruction<N> for IndexConstruction<I>
where
    N: Id,
    I: NearestNeighboursIndex<N> + Sync,
    I::Error: Send,
{
    type Error = KnnError<N, I::Error>;

    fn construct<P>(
        &mut self,
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        width: NonZero<usize>,
        rng: impl Rng + SeedableRng,
        progress: &P,
    ) -> Result<NeighbourLists<N>, Self::Error>
    where
        P: Progress + Sync,
    {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }
        let width = width.get().min(rows - 1);

        self.0
            .insert_many(embeddings.iter().enumerate().map(|(row, components)| {
                // report iterator consumption without splitting insert_many into batches.
                // Transactional backends can keep their single write transaction independently of
                // the report cadence.
                let done = row + 1;
                if reports_at(done, rows) {
                    progress.knn_insert(Batch { done, total: rows });
                }

                Embedding {
                    id: N::from_usize(row),
                    components,
                }
            }))
            .map_err(KnnError::Backend)?;

        self.0.build(rng, progress).map_err(KnnError::Backend)?;

        let placeholder = Neighbour {
            id: N::MIN,
            distance: NonNegative::ZERO,
        };

        let mut entries = vec![placeholder; rows * width].into_boxed_slice();
        let covered = Atomic::<usize>::new(0);
        entries
            .par_chunks_mut(width)
            .enumerate()
            .try_for_each(|(row, slots)| {
                let row = N::from_usize(row);
                let found: Vec<Neighbour<N>> = self
                    .0
                    .search_by_id(row, width)
                    .map_err(KnnError::Backend)?
                    .into_iter()
                    .collect();

                if found.len() != width {
                    return Err(KnnError::SearchCount {
                        row,
                        expected: width,
                        actual: found.len(),
                    });
                }

                let mut ids: Vec<u64> = found
                    .iter()
                    .map(|neighbour| neighbour.id.as_u64())
                    .collect();
                ids.sort_unstable();

                if let Some(&[duplicate, _]) =
                    ids.array_windows::<2>().find(|[left, right]| left == right)
                {
                    return Err(KnnError::DuplicateNeighbour {
                        row,
                        neighbour: duplicate,
                    });
                }

                if let Some(&neighbour) = ids.last().filter(|&&last| last >= rows as u64) {
                    return Err(KnnError::NeighbourOutOfBounds {
                        row,
                        neighbour,
                        rows,
                    });
                }

                slots.copy_from_slice(&found);

                // count completed rows, never the row index: completion order is parallel.
                let done = covered.fetch_add(1, Ordering::Relaxed) + 1;
                if reports_at(done, rows) {
                    progress.knn_readback(Batch { done, total: rows });
                }

                Ok(())
            })?;

        Ok(NeighbourLists::new(entries, width))
    }
}

#[cfg(test)]
mod tests {
    use super::{REPORT_CADENCE, reports_at};

    #[test]
    fn a_loop_reports_on_cadence_multiples_and_on_its_last_row() {
        let total = REPORT_CADENCE * 3 + 17;

        assert!(!reports_at(1, total));
        assert!(!reports_at(REPORT_CADENCE - 1, total));
        assert!(reports_at(REPORT_CADENCE, total));
        assert!(!reports_at(REPORT_CADENCE + 1, total));
        assert!(reports_at(REPORT_CADENCE * 3, total));
        assert!(reports_at(total, total));
    }

    #[test]
    fn a_corpus_below_the_cadence_reports_once_at_completion() {
        let total = REPORT_CADENCE - 1;
        let reports: Vec<usize> = (1..=total)
            .filter(|&done| reports_at(done, total))
            .collect();

        assert_eq!(reports, vec![total]);
    }
}
