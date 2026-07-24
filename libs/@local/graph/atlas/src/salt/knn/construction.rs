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

use core::num::NonZero;

use rand::{Rng, SeedableRng};
use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};

use super::{Embedding, NearestNeighboursIndex, Neighbour, error::KnnError};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::{Identity as _, NodeRowId},
    math::AlignedVecN,
    salt::knn::table::KnnValidationError,
};

/// Every row's nearest non-self neighbours, at one uniform width.
///
/// Row-major storage: row `i` holds exactly [`width`](Self::width) entries in ascending
/// `(distance, id)` order, with distances on the `[0, 2]` cosine scale. The producing constructor
/// guarantees the entries; the type only carries them.
#[derive(Debug)]
pub(crate) struct NeighbourLists {
    entries: Box<[Neighbour]>,
    width: usize,
}

impl NeighbourLists {
    /// Wraps row-major entries whose per-row contract the producer established.
    pub(super) fn new(entries: Box<[Neighbour]>, width: usize) -> Self {
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
    pub(crate) fn row(&self, row: usize) -> &[Neighbour] {
        &self.entries[row * self.width..(row + 1) * self.width]
    }
}

/// A constructor of every row's nearest-neighbour list.
///
/// One construction serves one generation's rows: `embeddings` holds the l2-normalized projector
/// representations in node-row order, and the result holds each row's `width` nearest non-self
/// neighbours. A `width` at or beyond the corpus is clamped to every non-self row. `rng` drives
/// the constructor's randomized choices, so a seeded generator pins its sampling streams.
pub(crate) trait KnnConstruction {
    type Error;

    /// Produces every row's `width` nearest non-self neighbours.
    ///
    /// # Errors
    ///
    /// Returns a constructor error when the corpus is degenerate or the construction fails.
    fn construct(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        width: NonZero<usize>,
        rng: impl Rng + SeedableRng,
    ) -> Result<NeighbourLists, Self::Error>;
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

impl<I> KnnConstruction for IndexConstruction<I>
where
    I: NearestNeighboursIndex + Sync,
    I::Error: Send,
{
    type Error = KnnError<I::Error>;

    fn construct(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        width: NonZero<usize>,
        rng: impl Rng + SeedableRng,
    ) -> Result<NeighbourLists, Self::Error> {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }
        let width = width.get().min(rows - 1);

        self.0
            .insert_many(
                embeddings
                    .iter()
                    .enumerate()
                    .map(|(row, components)| Embedding {
                        id: NodeRowId::from_index(row),
                        components,
                    }),
            )
            .map_err(KnnError::Backend)?;
        self.0.build(rng).map_err(KnnError::Backend)?;

        let placeholder = Neighbour {
            id: NodeRowId::new(0),
            distance: 0.0,
        };
        let mut entries = vec![placeholder; rows * width].into_boxed_slice();
        entries
            .par_chunks_mut(width)
            .enumerate()
            .try_for_each(|(row, slots)| {
                let found: Vec<Neighbour> = self
                    .0
                    .search_by_id(NodeRowId::from_index(row), width)
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

                let mut ids: Vec<u64> = found.iter().map(|neighbour| neighbour.id.get()).collect();
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
                Ok(())
            })?;

        Ok(NeighbourLists::new(entries, width))
    }
}
