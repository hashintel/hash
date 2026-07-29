//! Nearest-landmark assignment over the search backend.
//!
//! Every corpus row maps to the ordinal of its nearest selected landmark by cosine distance over
//! the projector representations. Landmarks map to themselves without a search; every other row
//! asks a backend built over exactly the landmark rows for its single nearest neighbour. The
//! backend keys landmarks by their corpus node row, and ordinals fall out of the selection's
//! ascending order.

use core::{error::Error, fmt};

use hashql_core::id::{Id, IdSlice};
use rand::{Rng, SeedableRng};
use rayon::iter::ParallelIterator as _;

use super::select::{LandmarkOrdinal, LandmarkSelection};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::AlignedVecN,
    salt::knn::{Embedding, NearestNeighboursIndex},
};

/// Dense corpus-to-landmark assignment in node-row order.
///
/// Every stored ordinal lies below [`landmarks`](Self::landmarks), the length of the selection the
/// assignment was built against, so consumers index landmark-domain tables without re-validation.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct LandmarkAssignment<N> {
    landmark_by_row: Box<IdSlice<N, LandmarkOrdinal>>,
    landmarks: usize,
}

// Not derived: the boxed slice clones through the `Id` machinery, which the derive's `N: Clone`
// bound cannot prove.
impl<N> Clone for LandmarkAssignment<N>
where
    N: Id,
{
    fn clone(&self) -> Self {
        Self {
            landmark_by_row: self.landmark_by_row.clone(),
            landmarks: self.landmarks,
        }
    }
}

impl<N> LandmarkAssignment<N>
where
    N: Id,
{
    /// Wraps precomputed ordinals, for fixtures.
    ///
    /// # Panics
    ///
    /// Panics when an ordinal lies at or beyond `landmarks`.
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

    /// Returns the assigned landmark ordinal of one node row.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the assigned corpus.
    #[inline]
    #[must_use]
    pub(crate) fn get(&self, row: N) -> LandmarkOrdinal {
        self.landmark_by_row[row]
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

    /// Re-indexes the assignment through `rows`: entry `i` of the result is this assignment's
    /// entry at the `i`-th yielded row.
    ///
    /// This expands an assignment built over a quotient domain onto the domain `rows` maps from:
    /// every row of the wider domain takes its representative's landmark, under the unchanged
    /// ordinal vocabulary.
    ///
    /// # Panics
    ///
    /// Panics when a yielded row lies outside the assigned domain.
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
pub enum AssignmentError<N, E> {
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

/// Assigns every corpus row to its nearest selected landmark.
///
/// `embeddings` holds the projector representations in node-row order; a mapped `f32[N, 512]`
/// artifact yields the slice directly. The empty backend ingests exactly the landmark rows, links
/// under `rng`, and answers one nearest-neighbour query per non-landmark row, in parallel and
/// deterministically for a deterministic backend.
///
/// # Errors
///
/// Returns an error when a selected row lies outside the corpus, the backend fails, or a search
/// returns nothing or a non-landmark row.
pub(crate) fn assign_landmarks<N, I>(
    index: &mut I,
    rng: impl Rng + SeedableRng,
    embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    selection: &LandmarkSelection<N>,
) -> Result<LandmarkAssignment<N>, AssignmentError<N, I::Error>>
where
    N: Id,
    I: NearestNeighboursIndex<N, Error: Send> + Sync,
{
    for &row in selection.rows() {
        if row >= embeddings.bound() {
            return Err(AssignmentError::UnknownRow {
                row,
                rows: embeddings.len(),
            });
        }
    }

    index
        .insert_many(selection.rows().iter().map(|&row| Embedding {
            id: row,
            components: &embeddings[row],
        }))
        .map_err(AssignmentError::Backend)?;
    index.build(rng).map_err(AssignmentError::Backend)?;

    let landmark_by_row = embeddings
        .par_iter_enumerated()
        .map(|(row, components)| {
            if let Some(ordinal) = selection.ordinal(row) {
                return Ok(ordinal);
            }

            let nearest = index
                .search_by_vector(components, 1)
                .map_err(AssignmentError::Backend)?
                .into_iter()
                .next()
                .ok_or(AssignmentError::MissingMatch { row })?;

            selection
                .ordinal(nearest.id)
                .ok_or(AssignmentError::ForeignNeighbour {
                    row,
                    neighbour: nearest.id,
                })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(LandmarkAssignment {
        landmark_by_row: IdSlice::from_boxed_slice(landmark_by_row.into_boxed_slice()),
        landmarks: selection.len(),
    })
}
