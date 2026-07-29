//! k-nearest-neighbour list construction.
//!
//! [`KnnConstruction`] separates what the pipeline needs - every row's nearest-neighbour list -
//! from how a constructor produces it. [`NeighbourLists`] is the produced currency: the recall
//! spot check reads sampled rows from it, and the persisted table slices its stored prefix from
//! it, so one construction at one width feeds both consumers.
//!
//! [`IndexConstruction`] adapts any [`NearestNeighboursIndex`] search backend to the seam: it
//! ingests every row, links the backend, and answers the lists by one search per row. A
//! constructor that derives the lists directly, without a search structure, implements the trait
//! itself.

use core::{
    num::NonZero,
    sync::atomic::{Atomic, Ordering},
};

use hashql_core::id::{Id, IdSlice};
use rand::{Rng, SeedableRng};
use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};

use super::{Embedding, NearestNeighboursIndex, Neighbour, error::KnnError};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::AlignedVecN,
    progress::{Batch, Progress},
    salt::knn::table::KnnValidationError,
};

/// Rows one batched loop covers between progress reports.
///
/// The insertion and the readback both report at this cadence: a corpus of a million rows draws a
/// couple of hundred observations, so a watching operator sees the counter move while the loops
/// pay one report per few thousand rows rather than one per row.
const REPORT_CADENCE: usize = 4_096;

/// Whether a batched loop over `total` rows reports at `done` rows covered.
///
/// A loop reports every [`REPORT_CADENCE`] rows and once more as its last row lands, so a corpus
/// below the cadence reports exactly once - at completion - and the last report of any corpus is
/// the complete one.
const fn reports_at(done: usize, total: usize) -> bool {
    done.is_multiple_of(REPORT_CADENCE) || done == total
}

/// Every row's nearest non-self neighbours, at one uniform width.
///
/// Row-major storage: row `i` holds exactly [`width`](Self::width) entries in ascending
/// `(distance, id)` order, with distances on the `[0, 2]` cosine scale. The producing constructor
/// guarantees the entries; the type only carries them.
#[derive(Debug)]
pub(crate) struct NeighbourLists<N> {
    entries: Box<[Neighbour<N>]>,
    width: usize,
}

impl<N> NeighbourLists<N>
where
    N: Id,
{
    /// Wraps row-major entries whose per-row contract the producer established.
    pub(super) fn new(entries: Box<[Neighbour<N>]>, width: usize) -> Self {
        debug_assert!(width > 0 && entries.len().is_multiple_of(width));

        Self { entries, width }
    }

    /// Returns the row count.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the width divides the entry count exactly by construction"
    )]
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.entries.len() / self.width
    }

    /// Returns the neighbours held per row.
    #[inline]
    #[must_use]
    pub(crate) const fn width(&self) -> usize {
        self.width
    }

    /// Returns row `row`'s neighbours in ascending `(distance, id)` order.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the row domain.
    #[inline]
    #[must_use]
    pub(crate) fn row(&self, row: N) -> &[Neighbour<N>] {
        &self.entries[row.as_usize() * self.width..(row.as_usize() + 1) * self.width]
    }
}

/// A constructor of every row's nearest-neighbour list.
///
/// One construction serves one generation's rows: `embeddings` holds the l2-normalized projector
/// representations in node-row order, and the result holds each row's `width` nearest non-self
/// neighbours. A `width` at or beyond the corpus is clamped to every non-self row. `rng` drives
/// the constructor's randomized choices, so a seeded generator pins its sampling streams.
pub(crate) trait KnnConstruction<N>
where
    N: Id,
{
    type Error;

    /// Produces every row's `width` nearest non-self neighbours.
    ///
    /// The construction reports its batched loops and its named phases to `progress` as they
    /// happen; it observes nothing the run acts on, so the lists are identical under any observer.
    ///
    /// # Errors
    ///
    /// Returns a constructor error when the corpus is degenerate or the construction fails.
    fn construct<P>(
        &mut self,
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        width: NonZero<usize>,
        rng: impl Rng + SeedableRng,
        progress: P,
    ) -> Result<(NeighbourLists<N>, P), Self::Error>
    where
        P: Progress + Send + Sync + 'static;
}

/// Adapts a [`NearestNeighboursIndex`] search backend to [`KnnConstruction`].
///
/// The construction ingests every row, links the backend under `rng`, and queries each row's
/// neighbours in parallel; the assembled lists are deterministic for a deterministic backend
/// because each row's results land in that row's slot regardless of completion order. The
/// backend's responses are distrusted at the seam: a short result, a duplicate, or a neighbour
/// outside the row domain fails the construction.
#[derive(Debug)]
pub(crate) struct IndexConstruction<I>(I);

impl<I> IndexConstruction<I> {
    /// Wraps an empty backend.
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
        progress: P,
    ) -> Result<(NeighbourLists<N>, P), Self::Error>
    where
        P: Progress + Send + Sync + 'static,
    {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }
        let width = width.get().min(rows - 1);

        self.0
            .insert_many(embeddings.iter().enumerate().map(|(row, components)| {
                // A backend ingests the whole corpus inside one write
                // transaction, so the insertion reports from the iterator
                // it draws the rows through rather than from a batched
                // call sequence - which would commit once per batch and
                // let an observer change what the run costs.
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

        let progress = self.0.build(rng, progress).map_err(KnnError::Backend)?;

        let placeholder = Neighbour {
            id: N::MIN,
            distance: 0.0,
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

                // Rows finish out of order, so the readback's position is
                // how many rows have landed, never this row's index.
                let done = covered.fetch_add(1, Ordering::Relaxed) + 1;
                if reports_at(done, rows) {
                    progress.knn_readback(Batch { done, total: rows });
                }

                Ok(())
            })?;

        Ok((NeighbourLists::new(entries, width), progress))
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
