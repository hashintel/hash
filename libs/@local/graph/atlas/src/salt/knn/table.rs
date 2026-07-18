//! The validated k-nearest-neighbour table.

use core::{error::Error, fmt, num::NonZero};

use rayon::prelude::*;
use sprs::{CsMat, CsMatView};

use super::{NearestNeighboursIndex, Neighbour, error::KnnError};
use crate::dataset::NodeRowId;

/// The persisted directed k-nearest-neighbour table of one generation.
///
/// A square compressed sparse row matrix over the node-row domain: row
/// `i` stores the cosine distances of the `k` nearest non-self
/// neighbours of node row `i`, keyed by neighbour row in ascending row
/// order. Every row stores exactly `k` entries, no row references
/// itself, and every distance is finite in `[0, 2]`. The row format
/// makes duplicate neighbours unrepresentable: entries within a row are
/// strictly ascending by column.
///
/// A `0.0` distance is a stored value (duplicate embeddings are exactly
/// coincident), never an absent entry.
#[derive(Debug, Clone)]
pub(crate) struct Knn(CsMat<f32>);

impl Knn {
    /// Validates a neighbour matrix against the table invariants.
    ///
    /// # Errors
    ///
    /// Returns an error when the matrix is not row-compressed, not
    /// square over at least two rows, ragged, self-referencing, or
    /// carries a distance outside the finite `[0, 2]` range.
    pub(crate) fn new(matrix: CsMat<f32>) -> Result<Self, InvalidKnn> {
        validate(matrix.view())?;
        Ok(Self(matrix))
    }

    /// Queries every node row of `index` and assembles the validated
    /// table.
    ///
    /// The backend must hold exactly the rows `0..rows`, already built.
    /// Rows are queried in parallel; the assembled table is
    /// deterministic for a deterministic backend because each row's
    /// results are written to that row's slot regardless of completion
    /// order.
    ///
    /// # Errors
    ///
    /// Returns an error when the backend fails, returns a malformed or
    /// short result, or the assembled table violates a [`Knn`]
    /// invariant.
    pub(crate) fn build<I>(
        index: &I,
        rows: usize,
        neighbours: NonZero<usize>,
    ) -> Result<Self, KnnError<I::Error>>
    where
        I: NearestNeighboursIndex + Sync,
        I::Error: Send,
    {
        let neighbours = neighbours.get();
        if rows < 2 {
            return Err(InvalidKnn::InsufficientRows { rows }.into());
        }
        if neighbours >= rows {
            return Err(InvalidKnn::NeighbourBounds { neighbours, rows }.into());
        }
        let entries = rows
            .checked_mul(neighbours)
            .ok_or(KnnError::TooManyEntries { rows, neighbours })?;

        let mut indices = vec![0_usize; entries];
        let mut distances = vec![0.0_f32; entries];
        indices
            .par_chunks_mut(neighbours)
            .zip(distances.par_chunks_mut(neighbours))
            .enumerate()
            .try_for_each(|(row, (row_indices, row_distances))| {
                let id = NodeRowId::new(u64::try_from(row).expect("node rows fit u64"));
                let mut found: Vec<Neighbour> = index
                    .search_by_id(id, neighbours)
                    .map_err(KnnError::Backend)?
                    .into_iter()
                    .collect();
                if found.len() != neighbours {
                    return Err(KnnError::SearchCount {
                        row,
                        expected: neighbours,
                        actual: found.len(),
                    });
                }

                // CSR keys rows by ascending neighbour; the backend's
                // distance ordering is recomputable from the values.
                found.sort_unstable_by_key(|neighbour| neighbour.id.get());
                for (slot, neighbour) in row_indices.iter_mut().zip(&found) {
                    *slot = usize::try_from(neighbour.id.get())
                        .ok()
                        .filter(|&column| column < rows)
                        .ok_or(KnnError::NeighbourOutOfBounds {
                            row,
                            neighbour: neighbour.id.get(),
                            rows,
                        })?;
                }
                if let Some((&duplicate, _)) = row_indices
                    .iter()
                    .zip(row_indices.iter().skip(1))
                    .find(|(left, right)| left == right)
                {
                    return Err(KnnError::DuplicateNeighbour {
                        row,
                        neighbour: u64::try_from(duplicate).expect("node rows fit u64"),
                    });
                }
                for (slot, neighbour) in row_distances.iter_mut().zip(&found) {
                    *slot = neighbour.distance;
                }
                Ok(())
            })?;

        let indptr: Vec<usize> = (0..=rows).map(|row| row * neighbours).collect();
        let matrix = CsMat::try_new((rows, rows), indptr, indices, distances)
            .map_err(|(_, _, _, error)| error)
            .expect("per-row validation establishes the compressed structure");
        Ok(Self::new(matrix)?)
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
    }

    /// Returns the stored non-self neighbours per row.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the row count divides the entry count exactly by the uniform-rows invariant"
    )]
    #[inline]
    #[must_use]
    pub(crate) fn neighbours(&self) -> usize {
        self.0.nnz() / self.0.rows()
    }

    /// Borrows the table.
    #[inline]
    #[must_use]
    pub(crate) fn view(&self) -> KnnView<'_> {
        KnnView(self.0.view())
    }

    /// Borrows the neighbour matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) fn matrix(&self) -> CsMatView<'_, f32> {
        self.0.view()
    }

    /// Unwraps the neighbour matrix.
    #[inline]
    #[must_use]
    pub(crate) fn into_matrix(self) -> CsMat<f32> {
        self.0
    }
}

/// Borrowed rows of one validated [`Knn`] table.
#[derive(Debug, Clone)]
pub(crate) struct KnnView<'view>(CsMatView<'view, f32>);

impl<'view> KnnView<'view> {
    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
    }

    /// Returns the stored non-self neighbours per row.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the row count divides the entry count exactly by the uniform-rows invariant"
    )]
    #[inline]
    #[must_use]
    pub(crate) fn neighbours(&self) -> usize {
        self.0.nnz() / self.0.rows()
    }

    /// Borrows the neighbour matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) const fn matrix(&self) -> CsMatView<'view, f32> {
        self.0
    }

    /// Returns row `row`'s neighbours in ascending row order.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the table's row domain.
    pub(crate) fn row(&self, row: usize) -> impl Iterator<Item = Neighbour> + 'view {
        // outer_view reborrows at `&self`; the raw storage carries the
        // view's own lifetime.
        let (indptr, columns, distances) = self.0.into_raw_storage();
        let range = indptr[row]..indptr[row + 1];
        columns[range.clone()]
            .iter()
            .zip(&distances[range])
            .map(|(&column, &distance)| Neighbour {
                id: NodeRowId::new(u64::try_from(column).expect("node rows fit u64")),
                distance,
            })
    }
}

/// A neighbour matrix violated a [`Knn`] invariant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum InvalidKnn {
    /// The matrix is compressed by column.
    ColumnCompressed,
    /// The matrix is not square over the row domain.
    NotSquare { rows: usize, columns: usize },
    /// The row domain holds fewer than two rows.
    InsufficientRows { rows: usize },
    /// The neighbour count is zero or not below the row count.
    NeighbourBounds { neighbours: usize, rows: usize },
    /// A row stores a different neighbour count than the table's.
    RaggedRow {
        row: usize,
        expected: usize,
        actual: usize,
    },
    /// A row references itself.
    SelfNeighbour { row: usize },
    /// A stored distance is not finite.
    NonFiniteDistance {
        row: usize,
        neighbour: usize,
        distance: f32,
    },
    /// A stored distance lies outside the cosine range.
    DistanceOutOfRange {
        row: usize,
        neighbour: usize,
        distance: f32,
    },
}

impl fmt::Display for InvalidKnn {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::ColumnCompressed => fmt.write_str("the neighbour matrix is compressed by column"),
            Self::NotSquare { rows, columns } => write!(
                fmt,
                "the neighbour matrix spans {rows} rows by {columns} columns",
            ),
            Self::InsufficientRows { rows } => {
                write!(fmt, "{rows} rows cannot carry a neighbour table")
            }
            Self::NeighbourBounds { neighbours, rows } => write!(
                fmt,
                "{neighbours} neighbours per row are unsatisfiable over {rows} rows",
            ),
            Self::RaggedRow {
                row,
                expected,
                actual,
            } => write!(
                fmt,
                "row {row} stores {actual} neighbours where the table stores {expected}",
            ),
            Self::SelfNeighbour { row } => write!(fmt, "row {row} references itself"),
            Self::NonFiniteDistance {
                row,
                neighbour,
                distance,
            } => write!(
                fmt,
                "the distance {distance} from row {row} to neighbour {neighbour} is not finite",
            ),
            Self::DistanceOutOfRange {
                row,
                neighbour,
                distance,
            } => write!(
                fmt,
                "the distance {distance} from row {row} to neighbour {neighbour} lies outside [0, \
                 2]",
            ),
        }
    }
}

impl Error for InvalidKnn {}

/// Checks every table invariant over a borrowed matrix.
///
/// Structural invariants (in-bounds, strictly ascending row entries,
/// consistent pointers) hold for any existing [`CsMatView`]; this
/// checks the domain invariants layered on top.
fn validate(matrix: CsMatView<'_, f32>) -> Result<(), InvalidKnn> {
    if !matrix.is_csr() {
        return Err(InvalidKnn::ColumnCompressed);
    }
    let (rows, columns) = (matrix.rows(), matrix.cols());
    if rows != columns {
        return Err(InvalidKnn::NotSquare { rows, columns });
    }
    if rows < 2 {
        return Err(InvalidKnn::InsufficientRows { rows });
    }
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "derives the candidate per-row count; raggedness is rejected just below"
    )]
    let neighbours = matrix.nnz() / rows;
    if neighbours == 0 || neighbours >= rows {
        return Err(InvalidKnn::NeighbourBounds { neighbours, rows });
    }

    for (row, stored) in matrix.outer_iterator().enumerate() {
        if stored.nnz() != neighbours {
            return Err(InvalidKnn::RaggedRow {
                row,
                expected: neighbours,
                actual: stored.nnz(),
            });
        }
        for (neighbour, &distance) in stored.iter() {
            if neighbour == row {
                return Err(InvalidKnn::SelfNeighbour { row });
            }
            if !distance.is_finite() {
                return Err(InvalidKnn::NonFiniteDistance {
                    row,
                    neighbour,
                    distance,
                });
            }
            if !(0.0..=2.0).contains(&distance) {
                return Err(InvalidKnn::DistanceOutOfRange {
                    row,
                    neighbour,
                    distance,
                });
            }
        }
    }
    Ok(())
}
