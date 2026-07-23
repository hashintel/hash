//! The validated k-nearest-neighbour table.

use core::{error::Error, fmt, num::NonZero};

use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};
use sprs::{CsMatI, CsMatViewI};

use super::{Neighbour, construction::NeighbourLists, error::KnnError};
use crate::dataset::NodeRowId;

/// A neighbour matrix violated a [`Knn`] invariant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum KnnValidationError {
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

impl fmt::Display for KnnValidationError {
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

impl Error for KnnValidationError {}

/// Checks every table invariant over a borrowed matrix.
///
/// Structural invariants (in-bounds, strictly ascending row entries, consistent pointers) hold for
/// any existing [`KnnMatrixView`]; this checks the domain invariants layered on top.
pub(super) fn validate(matrix: KnnMatrixView<'_>) -> Result<(), KnnValidationError> {
    if !matrix.is_csr() {
        return Err(KnnValidationError::ColumnCompressed);
    }

    let (rows, columns) = (matrix.rows(), matrix.cols());
    if rows != columns {
        return Err(KnnValidationError::NotSquare { rows, columns });
    }

    if rows < 2 {
        return Err(KnnValidationError::InsufficientRows { rows });
    }

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "derives the candidate per-row count; raggedness is rejected just below"
    )]
    let neighbours = matrix.nnz() / rows;
    if neighbours == 0 || neighbours >= rows {
        return Err(KnnValidationError::NeighbourBounds { neighbours, rows });
    }

    for (row, stored) in matrix.outer_iterator().enumerate() {
        if stored.nnz() != neighbours {
            return Err(KnnValidationError::RaggedRow {
                row,
                expected: neighbours,
                actual: stored.nnz(),
            });
        }
        for (neighbour, &distance) in stored.iter() {
            if neighbour == row {
                return Err(KnnValidationError::SelfNeighbour { row });
            }

            if !distance.is_finite() {
                return Err(KnnValidationError::NonFiniteDistance {
                    row,
                    neighbour,
                    distance,
                });
            }

            if !(0.0..=2.0).contains(&distance) {
                return Err(KnnValidationError::DistanceOutOfRange {
                    row,
                    neighbour,
                    distance,
                });
            }
        }
    }
    Ok(())
}

/// The table's matrix layout: `u32` neighbour columns under `u64` row pointers.
///
/// Columns are `u32` because node rows are bound to a `u32` encoding end to end (the wire row ids,
/// the search backend's item keys, the persisted column region); row pointers are `u64` so the
/// persisted and resident layouts coincide and a mapped table is the same type as a built one.
pub(crate) type KnnMatrix = CsMatI<f32, u32, u64>;

/// A borrowed [`KnnMatrix`].
pub(crate) type KnnMatrixView<'view> = CsMatViewI<'view, f32, u32, u64>;

/// The persisted directed k-nearest-neighbour table of one generation.
///
/// A square compressed sparse row matrix over the node-row domain: row `i` stores the cosine
/// distances of the `k` nearest non-self neighbours of node row `i`, keyed by neighbour row in
/// ascending row order. Every row stores exactly `k` entries, no row references itself, and every
/// distance is finite in `[0, 2]`. The row format makes duplicate neighbours unrepresentable:
/// entries within a row are strictly ascending by column.
///
/// A `0.0` distance is a stored value (duplicate embeddings are exactly coincident), never an
/// absent entry.
#[derive(Debug, Clone)]
pub(crate) struct Knn(KnnMatrix);

impl Knn {
    /// Validates a neighbour matrix against the table invariants.
    ///
    /// # Errors
    ///
    /// Returns an error when the matrix is not row-compressed, not square over at least two rows,
    /// ragged, self-referencing, or carries a distance outside the finite `[0, 2]` range.
    pub(crate) fn new(matrix: KnnMatrix) -> Result<Self, KnnValidationError> {
        validate(matrix.view())?;
        Ok(Self(matrix))
    }

    /// Slices each row's stored prefix from constructed lists and assembles the validated table.
    ///
    /// Each row keeps its `neighbours` nearest entries - the lists' leading prefix - rekeyed into
    /// the matrix's ascending-column order.
    ///
    /// # Errors
    ///
    /// Returns an error when the lists are narrower than the stored width or the assembled table
    /// violates a [`Knn`] invariant.
    pub(crate) fn from_lists<E: Send>(
        lists: &NeighbourLists,
        neighbours: NonZero<usize>,
    ) -> Result<Self, KnnError<E>> {
        let neighbours = neighbours.get();
        let rows = lists.rows();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }

        if neighbours >= rows {
            return Err(KnnValidationError::NeighbourBounds { neighbours, rows }.into());
        }

        if lists.width() < neighbours {
            return Err(KnnError::ListsWidth {
                width: lists.width(),
                neighbours,
            });
        }

        // Columns encode as u32; the largest possible column is the
        // last row.
        if u32::try_from(rows - 1).is_err() {
            return Err(KnnError::TooManyRows { rows });
        }
        let entries = rows
            .checked_mul(neighbours)
            .ok_or(KnnError::TooManyEntries { rows, neighbours })?;

        let mut indices = vec![0_u32; entries];
        let mut distances = vec![0.0_f32; entries];
        indices
            .par_chunks_mut(neighbours)
            .zip(distances.par_chunks_mut(neighbours))
            .enumerate()
            .try_for_each(|(row, (row_indices, row_distances))| {
                // CSR keys rows by ascending neighbour; the lists'
                // distance ordering is recomputable from the values.
                let mut found: Vec<Neighbour> = lists.row(row)[..neighbours].to_vec();
                found.sort_unstable_by_key(|neighbour| neighbour.id.get());

                for (slot, neighbour) in row_indices.iter_mut().zip(&found) {
                    let column = neighbour.id.get();
                    if column >= (rows as u64) {
                        return Err(KnnError::NeighbourOutOfBounds {
                            row,
                            neighbour: column,
                            rows,
                        });
                    }
                    *slot =
                        u32::try_from(column).expect("columns below the checked row bound fit u32");
                }

                if let Some(&[duplicate, _]) = row_indices
                    .array_windows::<2>()
                    .find(|[left, right]| left == right)
                {
                    return Err(KnnError::DuplicateNeighbour {
                        row,
                        neighbour: u64::from(duplicate),
                    });
                }

                for (slot, neighbour) in row_distances.iter_mut().zip(&found) {
                    *slot = neighbour.distance;
                }

                Ok(())
            })?;

        let indptr: Vec<u64> = (0..=rows).map(|row| (row * neighbours) as u64).collect();
        // SAFETY: The compressed structure holds by construction. `indptr` is the uniform
        // `row · neighbours` ramp - `rows + 1` entries, non-decreasing, ending at the index
        // and distance lengths - and the per-row pass above wrote every row's indices
        // strictly ascending (sorted by id, adjacent equals rejected as duplicates) and
        // below `rows` (out-of-bounds rejected). These are exactly the properties
        // `check_compressed_structure` verifies.
        let matrix = unsafe {
            KnnMatrix::new_unchecked(
                sprs::CompressedStorage::CSR,
                (rows, rows),
                indptr,
                indices,
                distances,
            )
        };

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
    pub(crate) fn matrix(&self) -> KnnMatrixView<'_> {
        self.0.view()
    }

    /// Unwraps the neighbour matrix.
    #[inline]
    #[must_use]
    pub(crate) fn into_matrix(self) -> KnnMatrix {
        self.0
    }
}

/// Borrowed rows of one validated [`Knn`] table.
#[derive(Debug, Clone)]
pub(crate) struct KnnView<'view>(KnnMatrixView<'view>);

impl<'view> KnnView<'view> {
    /// Wraps a matrix whose invariants already hold.
    ///
    /// The caller promises the matrix passed [`validate`]; the wrapper performs no checks of its
    /// own.
    #[inline]
    #[must_use]
    pub(super) const fn new_unchecked(matrix: KnnMatrixView<'view>) -> Self {
        Self(matrix)
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

    /// Borrows the neighbour matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) const fn matrix(&self) -> KnnMatrixView<'view> {
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
        let position = |pointer: u64| {
            usize::try_from(pointer).expect("a resident table's entries fit the address space")
        };
        let range = position(indptr[row])..position(indptr[row + 1]);
        columns[range.clone()]
            .iter()
            .zip(&distances[range])
            .map(|(&column, &distance)| Neighbour {
                id: NodeRowId::from_u32(column),
                distance,
            })
    }
}
