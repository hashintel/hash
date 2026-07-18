//! Nearest-landmark assignment over the search backend.
//!
//! Every corpus row maps to the ordinal of its nearest selected
//! landmark by cosine distance over the projector representations.
//! Landmarks map to themselves without a search; every other row asks
//! a backend built over exactly the landmark rows for its single
//! nearest neighbour. The backend keys landmarks by their corpus node
//! row, and ordinals fall out of the selection's ascending order.

use core::{error::Error, fmt};

use rand::{Rng, SeedableRng};
use rayon::prelude::*;

use super::select::LandmarkSelection;
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    salt::knn::{Embedding, NearestNeighboursIndex},
};

/// Dense corpus-to-landmark assignment in node-row order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LandmarkAssignment {
    landmark_by_row: Box<[u32]>,
}

impl LandmarkAssignment {
    /// Wraps precomputed ordinals, for fixtures.
    #[cfg(test)]
    pub(super) const fn from_ordinals(landmark_by_row: Box<[u32]>) -> Self {
        Self { landmark_by_row }
    }

    /// Returns the assigned landmark ordinal of one node row.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the assigned corpus.
    #[inline]
    #[must_use]
    pub(crate) fn get(&self, row: NodeRowId) -> u32 {
        self.landmark_by_row[row.usize()]
    }

    /// Borrows every assignment ordinal in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &[u32] {
        &self.landmark_by_row
    }
}

/// The assignment inputs or backend misbehaved.
#[derive(Debug)]
pub(crate) enum AssignmentError<E> {
    /// A selected row lies outside the corpus.
    UnknownRow { row: u64, rows: usize },
    /// The backend reported an error.
    Backend(E),
    /// A search over a nonempty index returned nothing.
    MissingMatch { row: u64 },
    /// The backend returned a neighbour that is not a landmark.
    ForeignNeighbour { row: u64, neighbour: u64 },
}

impl<E: fmt::Display> fmt::Display for AssignmentError<E> {
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

impl<E: Error + 'static> Error for AssignmentError<E> {
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
/// `embeddings` holds the projector representations in node-row order;
/// a mapped `f32[N, 512]` artifact yields the slice directly. The
/// empty backend ingests exactly the landmark rows, links under `rng`,
/// and answers one nearest-neighbour query per non-landmark row, in
/// parallel and deterministically for a deterministic backend.
///
/// # Errors
///
/// Returns an error when a selected row lies outside the corpus, the
/// backend fails, or a search returns nothing or a non-landmark row.
pub(crate) fn assign_landmarks<I>(
    index: &mut I,
    rng: impl Rng + SeedableRng,
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    selection: &LandmarkSelection,
) -> Result<LandmarkAssignment, AssignmentError<I::Error>>
where
    I: NearestNeighboursIndex + Sync,
    I::Error: Send,
{
    for &row in selection.rows() {
        if row.usize() >= embeddings.len() {
            return Err(AssignmentError::UnknownRow {
                row: row.get(),
                rows: embeddings.len(),
            });
        }
    }

    index
        .insert_many(selection.rows().iter().map(|&row| Embedding {
            id: row,
            components: &embeddings[row.usize()],
        }))
        .map_err(AssignmentError::Backend)?;
    index.build(rng).map_err(AssignmentError::Backend)?;

    let landmark_by_row = embeddings
        .par_iter()
        .enumerate()
        .map(|(row, components)| {
            let row = NodeRowId::new(row as u64);
            if let Some(ordinal) = selection.ordinal(row) {
                return Ok(ordinal_u32(ordinal));
            }

            let nearest = index
                .search_by_vector(components, 1)
                .map_err(AssignmentError::Backend)?
                .into_iter()
                .next()
                .ok_or(AssignmentError::MissingMatch { row: row.get() })?;
            let ordinal =
                selection
                    .ordinal(nearest.id)
                    .ok_or(AssignmentError::ForeignNeighbour {
                        row: row.get(),
                        neighbour: nearest.id.get(),
                    })?;

            Ok(ordinal_u32(ordinal))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(LandmarkAssignment {
        landmark_by_row: landmark_by_row.into_boxed_slice(),
    })
}

/// Narrows a landmark ordinal to its persisted `u32` encoding.
fn ordinal_u32(ordinal: usize) -> u32 {
    u32::try_from(ordinal).expect("the bounded landmark capacity fits u32")
}
