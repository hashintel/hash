use alloc::{alloc::Global, vec::Vec};
use core::{
    alloc::Allocator,
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::Index,
};

use super::{Id, slice::IdSlice};

/// A dense rectangular matrix addressed by typed IDs on both axes.
///
/// `IdMatrix<R, C, T>` stores every cell in a single row-major `Vec<T>`: a row is a contiguous
/// slice, and the indexing arithmetic lives in one place. Rows are addressed by `R`, columns by
/// `C`, one [`Id`] newtype per axis, so mixing up a row index and a column index is a type error.
///
/// A row borrows as an [`IdSlice<C, T>`], so per-row indexing, iteration, and ids come from the
/// slice type.
///
/// The API is not complete by design, new methods will be added as needed.
///
/// # Examples
///
/// ```
/// # use hashql_core::id::{Id as _, IdMatrix, newtype};
/// # newtype!(struct QueryId(u32 is 0..=0xFFFF_FF00));
/// # newtype!(struct SlotId(u32 is 0..=0xFFFF_FF00));
/// let matrix: IdMatrix<QueryId, SlotId, u32> =
///     IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6]], 3);
///
/// assert_eq!(matrix.rows(), 2);
/// assert_eq!(matrix.columns(), 3);
/// assert_eq!(matrix[(QueryId::from_u32(1), SlotId::from_u32(2))], 6);
/// assert_eq!(matrix.row(QueryId::from_u32(0)).as_raw(), &[1, 2, 3]);
/// ```
pub struct IdMatrix<R, C, T, A: Allocator = Global> {
    cells: Vec<T, A>,
    columns: usize,
    _marker: PhantomData<fn(&R, &C)>,
}

impl<R: Id, C: Id, T> IdMatrix<R, C, T> {
    /// Creates a matrix from row-major cells at the given column count.
    ///
    /// # Panics
    ///
    /// Panics when `columns` is zero or does not divide the cell count exactly.
    #[must_use]
    pub fn from_rows(rows: impl IntoIterator<Item = Vec<T>>, columns: usize) -> Self {
        Self::from_rows_in(rows, columns, Global)
    }
}

impl<R: Id, C: Id, T, A: Allocator> IdMatrix<R, C, T, A> {
    /// Creates a matrix from a flat row-major buffer at the given column count.
    ///
    /// # Panics
    ///
    /// Panics when `columns` is zero or does not divide the buffer length exactly.
    #[must_use]
    pub fn from_flat(cells: Vec<T, A>, columns: usize) -> Self {
        assert!(
            columns > 0 && cells.len().is_multiple_of(columns),
            "the columns must be nonzero and divide the cell count exactly",
        );

        Self {
            cells,
            columns,
            _marker: PhantomData,
        }
    }

    /// Creates a matrix from row-major cells at the given column count, using `alloc`.
    ///
    /// # Panics
    ///
    /// Panics when `columns` is zero, a row's length differs from `columns`, or the resulting
    /// cell count does not divide exactly.
    #[must_use]
    pub fn from_rows_in(rows: impl IntoIterator<Item = Vec<T>>, columns: usize, alloc: A) -> Self {
        let mut cells = Vec::new_in(alloc);
        for row in rows {
            assert_eq!(row.len(), columns, "every row must hold `columns` cells");
            cells.extend(row);
        }

        Self::from_flat(cells, columns)
    }

    /// Returns the row count.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the constructor guarantees the columns divide the cell count exactly"
    )]
    #[inline]
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.cells.len() / self.columns
    }

    /// Returns the column count.
    #[inline]
    #[must_use]
    pub const fn columns(&self) -> usize {
        self.columns
    }

    /// Borrows one row as a column-indexed slice.
    ///
    /// # Panics
    ///
    /// Panics when `row` lies outside the row domain.
    #[inline]
    #[must_use]
    pub const fn row(&self, row: R) -> &IdSlice<C, T>
    where
        R: [const] Id,
    {
        let start = row.as_usize() * self.columns;

        IdSlice::from_raw(&self.cells[start..start + self.columns])
    }

    /// Iterates one column across every row, in row order.
    ///
    /// # Panics
    ///
    /// Panics when `column` lies outside the column domain.
    pub fn column(&self, column: C) -> impl ExactSizeIterator<Item = &T> {
        assert!(
            column.as_usize() < self.columns,
            "the column must lie inside the column domain",
        );

        self.cells
            .get(column.as_usize()..)
            .unwrap_or_default()
            .iter()
            .step_by(self.columns)
    }
}

const impl<R, C, T, A> Index<(R, C)> for IdMatrix<R, C, T, A>
where
    R: [const] Id,
    C: [const] Id,
    A: Allocator,
{
    type Output = T;

    /// Borrows the cell at `row`, `column`.
    ///
    /// # Panics
    ///
    /// Panics when `row` or `column` lies outside the matrix.
    #[inline]
    fn index(&self, (row, column): (R, C)) -> &T {
        assert!(
            column.as_usize() < self.columns,
            "the column must lie inside the column domain",
        );

        let cells: &[T] = &self.cells;
        &cells[row.as_usize() * self.columns + column.as_usize()]
    }
}

impl<R, C, T: Clone, A: Allocator + Clone> Clone for IdMatrix<R, C, T, A> {
    fn clone(&self) -> Self {
        Self {
            cells: self.cells.clone(),
            columns: self.columns,
            _marker: PhantomData,
        }
    }

    fn clone_from(&mut self, source: &Self) {
        self.cells.clone_from(&source.cells);
        self.columns = source.columns;
    }
}

impl<R, C, T, U, A, B> PartialEq<IdMatrix<R, C, U, B>> for IdMatrix<R, C, T, A>
where
    T: PartialEq<U>,
    A: Allocator,
    B: Allocator,
{
    #[inline]
    fn eq(&self, other: &IdMatrix<R, C, U, B>) -> bool {
        self.columns == other.columns && self.cells == other.cells
    }
}

impl<R, C, T, A> Eq for IdMatrix<R, C, T, A>
where
    T: Eq,
    A: Allocator,
{
}

impl<R, C, T, A> Hash for IdMatrix<R, C, T, A>
where
    T: Hash,
    A: Allocator,
{
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.columns.hash(state);
        self.cells.hash(state);
    }
}

impl<R, C, T: Debug, A: Allocator> Debug for IdMatrix<R, C, T, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("IdMatrix")
            .field("cells", &self.cells)
            .field("columns", &self.columns)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use alloc::vec;

    use super::IdMatrix;
    use crate::id::Id as _;

    crate::id::newtype!(
        #[id(crate = crate)]
        struct Row(u32)
    );
    crate::id::newtype!(
        #[id(crate = crate)]
        struct Column(u32)
    );

    #[test]
    fn from_rows_indexes_row_major() {
        let matrix: IdMatrix<Row, Column, u32> =
            IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6]], 3);

        assert_eq!(matrix.rows(), 2);
        assert_eq!(matrix.columns(), 3);
        assert_eq!(matrix[(Row::from_u32(0), Column::from_u32(0))], 1);
        assert_eq!(matrix[(Row::from_u32(1), Column::from_u32(2))], 6);
    }

    #[test]
    fn row_borrows_as_a_column_indexed_slice() {
        let matrix: IdMatrix<Row, Column, u32> =
            IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6]], 3);

        let row = matrix.row(Row::from_u32(1));
        assert_eq!(row.as_raw(), &[4, 5, 6]);
        assert_eq!(row[Column::from_u32(1)], 5);
    }

    #[test]
    fn column_walks_every_row_in_order() {
        let matrix: IdMatrix<Row, Column, u32> =
            IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6], vec![7, 8, 9]], 3);

        let column: alloc::vec::Vec<u32> = matrix.column(Column::from_u32(1)).copied().collect();
        assert_eq!(column, [2, 5, 8]);
    }

    #[test]
    fn an_empty_matrix_has_no_rows_and_empty_columns() {
        let matrix: IdMatrix<Row, Column, u32> = IdMatrix::from_flat(vec![], 3);

        assert_eq!(matrix.rows(), 0);
        assert_eq!(matrix.column(Column::from_u32(2)).count(), 0);
    }

    #[test]
    fn equal_matrices_compare_and_hash_alike() {
        let left: IdMatrix<Row, Column, u32> =
            IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6]], 3);
        let right: IdMatrix<Row, Column, u32> =
            IdMatrix::from_rows([vec![1, 2, 3], vec![4, 5, 6]], 3);

        assert_eq!(left, right);

        let state = std::hash::RandomState::new();
        assert_eq!(
            core::hash::BuildHasher::hash_one(&state, &left),
            core::hash::BuildHasher::hash_one(&state, &right),
        );
    }

    #[test]
    fn the_same_cells_at_a_different_width_are_unequal() {
        let two_by_three: IdMatrix<Row, Column, u32> =
            IdMatrix::from_flat(vec![1, 2, 3, 4, 5, 6], 3);
        let three_by_two: IdMatrix<Row, Column, u32> =
            IdMatrix::from_flat(vec![1, 2, 3, 4, 5, 6], 2);

        assert_ne!(two_by_three, three_by_two);

        let narrow_empty: IdMatrix<Row, Column, u32> = IdMatrix::from_flat(vec![], 2);
        let wide_empty: IdMatrix<Row, Column, u32> = IdMatrix::from_flat(vec![], 3);

        assert_ne!(narrow_empty, wide_empty);
    }

    #[test]
    #[should_panic(expected = "divide the cell count exactly")]
    fn a_ragged_flat_buffer_is_refused() {
        let _matrix: IdMatrix<Row, Column, u32> = IdMatrix::from_flat(vec![1, 2, 3, 4], 3);
    }

    #[test]
    #[should_panic(expected = "every row must hold")]
    fn a_ragged_row_is_refused() {
        let _matrix: IdMatrix<Row, Column, u32> = IdMatrix::from_rows([vec![1, 2, 3], vec![4]], 3);
    }
}
