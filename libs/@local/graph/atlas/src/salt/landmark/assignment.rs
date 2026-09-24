//! Corpus-to-landmark assignment through nearest-neighbour search.
//!
//! Landmarks map to themselves without a search. Every other row takes the first result from a
//! backend built over exactly the selected landmarks, inheriting that backend's approximation
//! quality. Search keys are input row ids. The selection translates them to [`LandmarkOrdinal`]
//! positions shared with the quotient and layout.

use core::{error::Error, fmt};

use hashql_core::id::{Id, IdSlice};
use rand::{Rng, SeedableRng};
use rayon::iter::ParallelIterator as _;

use super::select::{LandmarkOrdinal, LandmarkSelection};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::AlignedVecN,
    progress::NoProgress,
    runs::Runs,
    salt::knn::{Embedding, NearestNeighboursIndex},
};

/// Dense corpus-to-landmark assignment in node-row order.
///
/// Every stored ordinal lies below [`landmarks`](Self::landmarks), the length of the selection
/// whose ordinals it stores.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LandmarkAssignment<N> {
    landmark_by_row: Box<IdSlice<N, LandmarkOrdinal>>,
    landmarks: usize,
}

impl<N> LandmarkAssignment<N>
where
    N: Id,
{
    /// Validates precomputed fixture ordinals against `landmarks`.
    ///
    /// # Panics
    ///
    /// This panics when an ordinal lies at or beyond `landmarks`.
    #[cfg(test)]
    pub(super) fn from_ordinals(
        landmark_by_row: Box<IdSlice<N, LandmarkOrdinal>>,
        landmarks: usize,
    ) -> Self {
        assert!(
            landmark_by_row
                .iter()
                .all(|ordinal| ordinal.as_usize() < landmarks),
            "every ordinal lies below the landmark count",
        );

        Self {
            landmark_by_row,
            landmarks,
        }
    }

    /// Borrows every assignment ordinal in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &IdSlice<N, LandmarkOrdinal> {
        &self.landmark_by_row
    }

    /// Returns the ordinal domain size: every stored ordinal lies below it.
    #[inline]
    #[must_use]
    pub(crate) const fn landmarks(&self) -> usize {
        self.landmarks
    }

    /// Groups the assigned corpus rows by landmark ordinal.
    ///
    /// Each run preserves ascending row order. Folding it therefore uses the same order as a serial
    /// pass over the assigned row domain.
    #[must_use]
    pub(super) fn runs(&self) -> Runs<LandmarkOrdinal, N> {
        Runs::from_pairs(
            self.landmarks,
            self.landmark_by_row
                .iter_enumerated()
                .map(|(row, &ordinal)| (ordinal, row)),
        )
    }

    /// Re-indexes the assignment through the rows yielded in order.
    ///
    /// Result entry `i` takes this assignment's entry at the `i`-th yielded row. This expands an
    /// assignment built over a quotient domain onto the domain `rows` maps from: every row of
    /// the wider domain takes its representative's landmark, under the unchanged
    /// ordinal vocabulary.
    ///
    /// # Panics
    ///
    /// This panics when a yielded row lies outside the assigned domain.
    #[must_use]
    pub(crate) fn reindex<M>(&self, rows: impl ExactSizeIterator<Item = N>) -> LandmarkAssignment<M>
    where
        M: Id,
    {
        let landmark_by_row: Vec<_> = rows.map(|row| self.landmark_by_row[row]).collect();

        LandmarkAssignment {
            landmark_by_row: IdSlice::from_boxed_slice(landmark_by_row.into_boxed_slice()),
            landmarks: self.landmarks,
        }
    }
}

/// The assignment inputs or backend misbehaved.
#[derive(Debug)]
pub(crate) enum AssignmentError<N, E> {
    /// A selected row lies outside the corpus.
    UnknownRow { row: N, rows: usize },
    /// The backend reported an error.
    Backend(E),
    /// A search over a nonempty index returned nothing.
    MissingMatch { row: N },
    /// The backend returned a neighbour that is not a landmark.
    ForeignNeighbour { row: N, neighbour: N },
}

impl<N, E> AssignmentError<N, E> {
    /// Maps the rows the error names into another row domain, and the backend error with them.
    pub(crate) fn map_rows<M, F>(
        self,
        mut row: impl FnMut(N) -> M,
        backend: impl FnOnce(E) -> F,
    ) -> AssignmentError<M, F> {
        match self {
            Self::UnknownRow { row: unknown, rows } => AssignmentError::UnknownRow {
                row: row(unknown),
                rows,
            },
            Self::Backend(error) => AssignmentError::Backend(backend(error)),
            Self::MissingMatch { row: searched } => {
                AssignmentError::MissingMatch { row: row(searched) }
            }
            Self::ForeignNeighbour {
                row: searched,
                neighbour,
            } => AssignmentError::ForeignNeighbour {
                row: row(searched),
                neighbour: row(neighbour),
            },
        }
    }
}

impl<N: fmt::Display, E: fmt::Display> fmt::Display for AssignmentError<N, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownRow { row, rows } => {
                write!(
                    fmt,
                    "the landmark row {row} lies outside {rows} corpus rows"
                )
            }
            Self::Backend(error) => write!(fmt, "the search backend failed: {error}"),
            Self::MissingMatch { row } => {
                write!(fmt, "the search for row {row} returned no neighbour")
            }
            Self::ForeignNeighbour { row, neighbour } => write!(
                fmt,
                "the search for row {row} returned row {neighbour}, which is not a landmark",
            ),
        }
    }
}

impl<N: fmt::Debug + fmt::Display, E: Error + 'static> Error for AssignmentError<N, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Backend(error) => Some(error),
            Self::UnknownRow { .. } | Self::MissingMatch { .. } | Self::ForeignNeighbour { .. } => {
                None
            }
        }
    }
}

impl<N> LandmarkSelection<N>
where
    N: Id,
{
    /// Assigns every input row to a selected landmark using `index`.
    ///
    /// `embeddings` must hold l2-normalized projector representations in row order, and `index`
    /// must be empty. The backend ingests exactly the selected rows and builds under `rng`.
    /// Landmarks map to themselves. Non-landmark rows use the backend's first vector-search result,
    /// with no independent check of nearestness. A deterministic backend gives deterministic
    /// assignments despite parallel queries.
    ///
    /// # Errors
    ///
    /// Returns [`AssignmentError`] for an out-of-domain selected row, a backend failure, or a
    /// missing or non-landmark search result.
    #[tracing::instrument(skip_all)]
    pub(crate) fn assign<I>(
        &self,
        index: &mut I,
        rng: impl Rng + SeedableRng,
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> Result<LandmarkAssignment<N>, AssignmentError<N, I::Error>>
    where
        I: NearestNeighboursIndex<N, Error: Send> + Sync,
    {
        for &row in self.rows() {
            if row >= embeddings.bound() {
                return Err(AssignmentError::UnknownRow {
                    row,
                    rows: embeddings.len(),
                });
            }
        }

        index
            .insert_many(self.rows().iter().map(|&row| Embedding {
                id: row,
                components: &embeddings[row],
            }))
            .map_err(AssignmentError::Backend)?;
        // Unobserved: the backend's build phases are a knn-stage observation,
        // and this index links the landmark selection inside the landmark
        // stage, which reports its progress by completion alone.
        index
            .build(rng, &NoProgress)
            .map_err(AssignmentError::Backend)?;

        let landmark_by_row = embeddings
            .par_iter_enumerated()
            .map(|(row, components)| {
                if let Some(ordinal) = self.ordinal(row) {
                    return Ok(ordinal);
                }

                let nearest = index
                    .search_by_vector(components, 1)
                    .map_err(AssignmentError::Backend)?
                    .into_iter()
                    .next()
                    .ok_or(AssignmentError::MissingMatch { row })?;

                self.ordinal(nearest.id)
                    .ok_or(AssignmentError::ForeignNeighbour {
                        row,
                        neighbour: nearest.id,
                    })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(LandmarkAssignment {
            landmark_by_row: IdSlice::from_boxed_slice(landmark_by_row.into_boxed_slice()),
            landmarks: self.len(),
        })
    }
}
