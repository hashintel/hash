//! Dense and sparse 2D bit matrices with allocator support and row view types.
//!
//! This module provides two matrix representations:
//!
//! - [`BitMatrix`]: A dense, fixed-size matrix backed by a single contiguous allocation. Rows are
//!   laid out sequentially in memory, making row-level bitwise operations cache-friendly and
//!   auto-vectorizable. Supports zero-copy row access through [`RowRef`] and [`RowMut`] view types.
//!
//! - [`SparseBitMatrix`]: An arena-backed sparse matrix where all row data lives in a single
//!   contiguous buffer rather than one heap allocation per row. A free-list recycles slots from
//!   cleared rows, amortizing allocation cost over the matrix lifetime. Ideal for matrices where
//!   most rows are empty (e.g., dominance frontiers, reachability sets).
//!
//! Both types are parameterized over an allocator, enabling placement in arenas or
//! bump allocators without per-row allocation overhead.

use alloc::{alloc::Global, vec::Vec};
use core::{alloc::Allocator, fmt, marker::PhantomData};

use super::{
    BitIter, DenseBitSet, WORD_BITS, Word, bitwise, clear_excess_bits_in_final_word, count_ones,
    num_words, word_index_and_mask,
};
use crate::id::Id;

#[cfg(test)]
mod tests;

// =============================================================================
// RowRef — immutable view into a matrix row
// =============================================================================

/// An immutable view into a single row of a [`BitMatrix`] or [`SparseBitMatrix`].
///
/// Borrows directly into the matrix's backing storage — no allocation, no copy.
/// Provides the full read-only API of a bitset: membership testing, counting,
/// iteration, and superset checks.
///
/// Obtained via [`BitMatrix::row`] or [`SparseBitMatrix::row`].
#[derive(Clone, Copy)]
pub struct RowRef<'a, C: Id> {
    words: &'a [Word],
    col_domain_size: usize,
    marker: PhantomData<C>,
}

impl<'a, C: Id> RowRef<'a, C> {
    #[inline]
    const fn new(words: &'a [Word], col_domain_size: usize) -> Self {
        Self {
            words,
            col_domain_size,
            marker: PhantomData,
        }
    }

    #[inline]
    #[must_use]
    pub const fn col_domain_size(&self) -> usize {
        self.col_domain_size
    }

    /// Returns `true` if `col` is set in this row.
    ///
    /// # Panics
    ///
    /// Panics if `col` is out of bounds.
    #[inline]
    #[must_use]
    pub fn contains(&self, col: C) -> bool {
        assert!(col.as_usize() < self.col_domain_size);
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        (self.words[word_index] & mask) != 0
    }

    /// Returns the number of set bits in this row.
    #[inline]
    #[must_use]
    pub fn count(&self) -> usize {
        count_ones(self.words)
    }

    /// Returns `true` if no bits are set.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.words.iter().all(|&word| word == 0)
    }

    /// Returns `true` if every bit set in `other` is also set in `self`.
    #[inline]
    #[must_use]
    pub fn superset(&self, other: &Self) -> bool {
        debug_assert_eq!(self.col_domain_size, other.col_domain_size);
        self.words
            .iter()
            .zip(other.words)
            .all(|(&lhs, &rhs)| (lhs & rhs) == rhs)
    }

    /// Returns `true` if every bit set in `other` is also set in `self`.
    #[inline]
    #[must_use]
    pub fn superset_dense(&self, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.domain_size());
        self.words
            .iter()
            .zip(&other.words)
            .all(|(&lhs, &rhs)| (lhs & rhs) == rhs)
    }

    /// Iterates over the set column indices in ascending order.
    #[inline]
    #[must_use]
    pub fn iter(&self) -> BitIter<'a, C> {
        BitIter::new(self.words)
    }

    /// Returns the underlying word slice.
    #[inline]
    #[must_use]
    pub const fn words(&self) -> &'a [Word] {
        self.words
    }
}

impl<C: Id> fmt::Debug for RowRef<'_, C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.iter()).finish()
    }
}

impl<'a, C: Id> IntoIterator for &RowRef<'a, C> {
    type IntoIter = BitIter<'a, C>;
    type Item = C;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'a, C: Id> IntoIterator for RowRef<'a, C> {
    type IntoIter = BitIter<'a, C>;
    type Item = C;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

// =============================================================================
// RowMut — mutable view into a matrix row
// =============================================================================

/// A mutable view into a single row of a [`BitMatrix`].
///
/// Borrows directly into the matrix's backing storage — no allocation, no copy.
/// Provides the full read-write API: insertion, removal, clearing, and bitwise
/// operations against other rows or [`DenseBitSet`]s.
///
/// Obtained via [`BitMatrix::row_mut`].
pub struct RowMut<'a, C: Id> {
    words: &'a mut [Word],
    col_domain_size: usize,
    marker: PhantomData<C>,
}

impl<'a, C: Id> RowMut<'a, C> {
    #[inline]
    const fn new(words: &'a mut [Word], col_domain_size: usize) -> Self {
        Self {
            words,
            col_domain_size,
            marker: PhantomData,
        }
    }

    /// Reborrow as an immutable [`RowRef`].
    #[inline]
    #[must_use]
    pub const fn as_ref(&self) -> RowRef<'_, C> {
        RowRef::new(self.words, self.col_domain_size)
    }

    #[inline]
    #[must_use]
    pub const fn col_domain_size(&self) -> usize {
        self.col_domain_size
    }

    #[inline]
    #[must_use]
    pub fn contains(&self, col: C) -> bool {
        self.as_ref().contains(col)
    }

    #[inline]
    #[must_use]
    pub fn count(&self) -> usize {
        self.as_ref().count()
    }

    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.as_ref().is_empty()
    }

    #[inline]
    #[must_use]
    pub fn superset(&self, other: &RowRef<'_, C>) -> bool {
        self.as_ref().superset(other)
    }

    #[inline]
    #[must_use]
    pub fn iter(&self) -> BitIter<'_, C> {
        BitIter::new(self.words)
    }

    /// Sets bit at `col`. Returns `true` if the row changed.
    ///
    /// # Panics
    ///
    /// Panics if `col` is out of bounds.
    #[inline]
    pub fn insert(&mut self, col: C) -> bool {
        assert!(col.as_usize() < self.col_domain_size);
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        let word = &mut self.words[word_index];
        let old = *word;
        *word = old | mask;
        *word != old
    }

    /// Clears bit at `col`. Returns `true` if the row changed.
    ///
    /// # Panics
    ///
    /// Panics if `col` is out of bounds.
    #[inline]
    pub fn remove(&mut self, col: C) -> bool {
        assert!(col.as_usize() < self.col_domain_size);
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        let word = &mut self.words[word_index];
        let old = *word;
        *word = old & !mask;
        *word != old
    }

    /// Clears all bits in this row.
    #[inline]
    pub fn clear(&mut self) {
        self.words.fill(0);
    }

    /// Sets all bits in this row (respecting `col_domain_size`).
    #[inline]
    pub fn insert_all(&mut self) {
        self.words.fill(!0);
        clear_excess_bits_in_final_word(self.col_domain_size, self.words);
    }

    /// `self |= other`. Returns `true` if the row changed.
    #[inline]
    pub fn union(&mut self, other: &RowRef<'_, C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.col_domain_size);
        bitwise(self.words, other.words, |lhs, rhs| lhs | rhs)
    }

    /// `self -= other` (AND NOT). Returns `true` if the row changed.
    #[inline]
    pub fn subtract(&mut self, other: &RowRef<'_, C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.col_domain_size);
        bitwise(self.words, other.words, |lhs, rhs| lhs & !rhs)
    }

    /// `self &= other`. Returns `true` if the row changed.
    #[inline]
    pub fn intersect(&mut self, other: &RowRef<'_, C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.col_domain_size);
        bitwise(self.words, other.words, |lhs, rhs| lhs & rhs)
    }

    /// `self |= other`. Returns `true` if the row changed.
    #[inline]
    pub fn union_dense(&mut self, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.domain_size());
        bitwise(self.words, &other.words, |lhs, rhs| lhs | rhs)
    }

    /// `self -= other` (AND NOT). Returns `true` if the row changed.
    #[inline]
    pub fn subtract_dense(&mut self, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.domain_size());
        bitwise(self.words, &other.words, |lhs, rhs| lhs & !rhs)
    }

    /// `self &= other`. Returns `true` if the row changed.
    #[inline]
    pub fn intersect_dense(&mut self, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(self.col_domain_size, other.domain_size());
        bitwise(self.words, &other.words, |lhs, rhs| lhs & rhs)
    }
}

impl<C: Id> fmt::Debug for RowMut<'_, C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.as_ref().fmt(fmt)
    }
}

impl<'a, C: Id> IntoIterator for &'a RowMut<'a, C> {
    type IntoIter = BitIter<'a, C>;
    type Item = C;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

// =============================================================================
// BitMatrix — dense, contiguous, fixed-size 2D bit matrix
// =============================================================================

/// A fixed-size 2D bit matrix with a dense, contiguous representation.
///
/// All row data lives in a single `Vec<Word, A>`, laid out row-by-row. This makes
/// row-level bitwise operations (union, subtract, intersect) tight loops over
/// contiguous memory that auto-vectorize well.
///
/// Supports zero-copy row access through [`RowRef`] and [`RowMut`] view types, which
/// borrow directly into the backing store.
///
/// `R` and `C` are index types used to identify rows and columns respectively;
/// typically newtyped `usize` wrappers, but they can also just be `usize`.
///
/// All operations that involve a row and/or column index will panic if the
/// index exceeds the relevant bound.
///
/// # Allocator support
///
/// The backing storage uses a generic allocator, enabling placement in arenas
/// or bump allocators. Use [`new`](Self::new) for the global allocator, or
/// [`new_in`](Self::new_in) for a custom one.
#[derive(Clone, Eq, PartialEq, Hash)]
pub struct BitMatrix<R: Id, C: Id, A: Allocator = Global> {
    row_domain_size: usize,
    col_domain_size: usize,
    words: Vec<Word, A>,
    marker: PhantomData<fn(R, C)>,
}

impl<R: Id, C: Id> BitMatrix<R, C> {
    /// Creates a new `rows × columns` matrix, initially empty.
    #[inline]
    #[must_use]
    pub fn new(row_domain_size: usize, col_domain_size: usize) -> Self {
        Self::new_in(row_domain_size, col_domain_size, Global)
    }

    /// Creates a new matrix with `num_rows` rows, each initialized to `row`.
    #[must_use]
    pub fn from_row_n(row: &DenseBitSet<C>, num_rows: usize) -> Self {
        Self::from_row_n_in(row, num_rows, Global)
    }
}

impl<R: Id, C: Id, A: Allocator> BitMatrix<R, C, A> {
    /// Creates a new `rows × columns` matrix using `alloc`, initially empty.
    #[inline]
    #[must_use]
    pub fn new_in(row_domain_size: usize, col_domain_size: usize, alloc: A) -> Self {
        let words_per_row = num_words(col_domain_size);
        let total = row_domain_size * words_per_row;
        let mut words = Vec::with_capacity_in(total, alloc);
        words.resize(total, 0);

        Self {
            row_domain_size,
            col_domain_size,
            words,
            marker: PhantomData,
        }
    }

    /// Creates a new matrix with `num_rows` rows, each initialized to `row`.
    #[must_use]
    pub fn from_row_n_in(row: &DenseBitSet<C>, num_rows: usize, alloc: A) -> Self {
        let col_domain_size = row.domain_size();
        let words_per_row = num_words(col_domain_size);
        debug_assert_eq!(words_per_row, row.words.len());

        let total = num_rows * words_per_row;
        let mut words = Vec::with_capacity_in(total, alloc);
        for _ in 0..num_rows {
            words.extend_from_slice(&row.words);
        }

        Self {
            row_domain_size: num_rows,
            col_domain_size,
            words,
            marker: PhantomData,
        }
    }

    #[inline]
    #[must_use]
    pub const fn row_domain_size(&self) -> usize {
        self.row_domain_size
    }

    #[inline]
    #[must_use]
    pub const fn col_domain_size(&self) -> usize {
        self.col_domain_size
    }

    #[inline]
    fn words_per_row(&self) -> usize {
        num_words(self.col_domain_size)
    }

    /// Iterates over all valid row indices.
    #[inline]
    pub fn rows(&self) -> impl ExactSizeIterator<Item = R> + '_ {
        (0..self.row_domain_size).map(R::from_usize)
    }

    /// Returns an immutable view of `row`.
    ///
    /// The returned [`RowRef`] borrows directly into the matrix's backing store.
    ///
    /// # Panics
    ///
    /// Panics if `row` is out of bounds.
    #[inline]
    #[must_use]
    pub fn row(&self, row: R) -> RowRef<'_, C> {
        self.assert_row(row);
        RowRef::new(self.row_words(row), self.col_domain_size)
    }

    /// Returns a mutable view of `row`.
    ///
    /// The returned [`RowMut`] borrows directly into the matrix's backing store
    /// and supports insertion, removal, clearing, and bitwise operations.
    ///
    /// # Panics
    ///
    /// Panics if `row` is out of bounds.
    #[inline]
    pub fn row_mut(&mut self, row: R) -> RowMut<'_, C> {
        self.assert_row(row);
        let col_domain_size = self.col_domain_size;
        RowMut::new(self.row_words_mut(row), col_domain_size)
    }

    // --- element-level operations ---

    /// Sets the cell at `(row, col)` to true. Returns `true` if the matrix changed.
    ///
    /// # Panics
    ///
    /// Panics if `row` or `col` are out of bounds.
    #[inline]
    pub fn insert(&mut self, row: R, col: C) -> bool {
        let (flat_index, mask) = self.flat_index_and_mask(row, col);
        let word = &mut self.words[flat_index];
        let old = *word;
        *word = old | mask;
        *word != old
    }

    /// Clears the cell at `(row, col)`. Returns `true` if the matrix changed.
    ///
    /// # Panics
    ///
    /// Panics if `row` or `col` are out of bounds.
    #[inline]
    pub fn remove(&mut self, row: R, col: C) -> bool {
        let (flat_index, mask) = self.flat_index_and_mask(row, col);
        let word = &mut self.words[flat_index];
        let old = *word;
        *word = old & !mask;
        *word != old
    }

    /// Returns `true` if the cell at `(row, col)` is set.
    ///
    /// # Panics
    ///
    /// Panics if `row` or `col` are out of bounds.
    #[inline]
    #[must_use]
    pub fn contains(&self, row: R, col: C) -> bool {
        let (flat_index, mask) = self.flat_index_and_mask(row, col);
        (self.words[flat_index] & mask) != 0
    }

    // --- row-level clearing ---

    /// Clears all bits in `row`.
    #[inline]
    pub fn clear_row(&mut self, row: R) {
        self.row_mut(row).clear();
    }

    /// Clears the entire matrix.
    #[inline]
    pub fn clear(&mut self) {
        self.words.fill(0);
    }

    /// Sets every bit in `row` to true (respecting `col_domain_size`).
    #[inline]
    pub fn insert_all_into_row(&mut self, row: R) {
        self.row_mut(row).insert_all();
    }

    // --- row-to-row operations ---

    /// `write |= read`. Returns `true` if `write` changed.
    ///
    /// Used for transitive reachability: if there is an edge `write → read`, then
    /// `write` can reach everything that `read` can.
    ///
    /// # Panics
    ///
    /// Panics if `read` or `write` are out of bounds.
    #[inline]
    pub fn union_rows(&mut self, read: R, write: R) -> bool {
        self.assert_row(read);
        self.assert_row(write);
        self.bitwise_rows(read, write, |lhs, rhs| lhs | rhs)
    }

    /// `write -= read` (AND NOT). Returns `true` if `write` changed.
    #[inline]
    pub fn subtract_rows(&mut self, read: R, write: R) -> bool {
        self.assert_row(read);
        self.assert_row(write);
        self.bitwise_rows(read, write, |lhs, rhs| lhs & !rhs)
    }

    /// `write &= read`. Returns `true` if `write` changed.
    #[inline]
    pub fn intersect_rows_mut(&mut self, read: R, write: R) -> bool {
        self.assert_row(read);
        self.assert_row(write);
        self.bitwise_rows(read, write, |lhs, rhs| lhs & rhs)
    }

    /// Returns the columns set in both `row1` and `row2`.
    #[must_use]
    pub fn intersect_rows(&self, row1: R, row2: R) -> Vec<C> {
        let words1 = self.row(row1);
        let words2 = self.row(row2);

        let mut result = Vec::new();
        for (base, (&word1, &word2)) in words1.words.iter().zip(words2.words).enumerate() {
            let mut combined = word1 & word2;
            while combined != 0 {
                let bit = combined.trailing_zeros() as usize;
                result.push(C::from_usize(base * WORD_BITS + bit));
                combined &= combined - 1;
            }
        }
        result
    }

    // --- row-to-DenseBitSet operations ---

    /// `row |= other`. Returns `true` if the row changed.
    #[inline]
    pub fn union_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        self.row_mut(row).union_dense(other)
    }

    /// `row -= other`. Returns `true` if the row changed.
    #[inline]
    pub fn subtract_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        self.row_mut(row).subtract_dense(other)
    }

    /// `row &= other`. Returns `true` if the row changed.
    #[inline]
    pub fn intersect_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        self.row_mut(row).intersect_dense(other)
    }

    // --- inspection ---

    /// Returns `true` if no bits are set in `row`.
    #[inline]
    #[must_use]
    pub fn is_empty_row(&self, row: R) -> bool {
        self.row(row).is_empty()
    }

    /// Returns the number of set bits in `row`.
    #[inline]
    #[must_use]
    pub fn count_row(&self, row: R) -> usize {
        self.row(row).count()
    }

    /// Iterates over the set columns in `row`, in ascending order.
    #[inline]
    pub fn iter_row(&self, row: R) -> BitIter<'_, C> {
        self.row(row).iter()
    }

    /// Returns the underlying word buffer.
    #[inline]
    #[must_use]
    pub fn words(&self) -> &[Word] {
        &self.words
    }

    // --- internal helpers ---

    /// Validates `(row, col)` and returns the flat word index plus the bit mask.
    ///
    /// Fuses both bounds checks into a single assert and computes a single flat
    /// index into `self.words`, giving the compiler one bounds check instead of the
    /// two that slicing + indexing would produce.
    #[inline]
    fn flat_index_and_mask(&self, row: R, col: C) -> (usize, Word) {
        assert!(row.as_usize() < self.row_domain_size && col.as_usize() < self.col_domain_size);
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        (row.as_usize() * self.words_per_row() + word_index, mask)
    }

    #[inline]
    fn assert_row(&self, row: R) {
        assert!(row.as_usize() < self.row_domain_size);
    }

    #[inline]
    fn row_words(&self, row: R) -> &[Word] {
        let words_per_row = self.words_per_row();
        let start = row.as_usize() * words_per_row;
        &self.words[start..start + words_per_row]
    }

    #[inline]
    fn row_words_mut(&mut self, row: R) -> &mut [Word] {
        let words_per_row = self.words_per_row();
        let start = row.as_usize() * words_per_row;
        &mut self.words[start..start + words_per_row]
    }

    /// Applies `op` element-wise: `write[i] = op(write[i], read[i])`.
    /// Returns `true` if `write` changed.
    #[inline]
    fn bitwise_rows(&mut self, read: R, write: R, op: impl Fn(Word, Word) -> Word) -> bool {
        let words_per_row = self.words_per_row();
        let read_start = read.as_usize() * words_per_row;
        let write_start = write.as_usize() * words_per_row;
        let words = &mut *self.words;

        let mut changed: Word = 0;
        for offset in 0..words_per_row {
            let old = words[write_start + offset];
            let new = op(old, words[read_start + offset]);
            words[write_start + offset] = new;
            changed |= old ^ new;
        }
        changed != 0
    }
}

/// Square-matrix operations available when row and column types are the same.
impl<T: Id, A: Allocator> BitMatrix<T, T, A> {
    /// Computes the transitive closure in-place using the Warshall algorithm.
    ///
    /// After this operation, `self.contains(i, j)` is `true` if and only if there
    /// exists a path from `i` to `j` in the original relation (a sequence
    /// `i → k₁ → k₂ → … → j`).
    ///
    /// Runs in O(n³/w) time where n is the domain size and w is the word size (64),
    /// achieving a 64× speedup over the scalar version through bitwise parallelism.
    pub fn transitive_closure(&mut self) {
        let size = self.row_domain_size;
        debug_assert_eq!(size, self.col_domain_size);

        for pivot in 0..size {
            let pivot_id = T::from_usize(pivot);
            for source in 0..size {
                let source_id = T::from_usize(source);
                if self.contains(source_id, pivot_id) {
                    self.union_rows(pivot_id, source_id);
                }
            }
        }
    }

    /// Computes the reflexive transitive closure in-place.
    ///
    /// Like [`transitive_closure`](Self::transitive_closure), but also sets the
    /// diagonal: every node can reach itself.
    pub fn reflexive_transitive_closure(&mut self) {
        let size = self.row_domain_size;
        for index in 0..size {
            let id = T::from_usize(index);
            self.insert(id, id);
        }
        self.transitive_closure();
    }
}

impl<R: Id, C: Id, A: Allocator> fmt::Debug for BitMatrix<R, C, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        struct Pair<R, C>(R, C);
        impl<R: fmt::Debug, C: fmt::Debug> fmt::Debug for Pair<R, C> {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{:?} → {:?}", self.0, self.1)
            }
        }

        write!(
            fmt,
            "BitMatrix({}×{}) ",
            self.row_domain_size, self.col_domain_size
        )?;
        let items = self
            .rows()
            .flat_map(|row| self.iter_row(row).map(move |col| Pair(row, col)));
        fmt.debug_set().entries(items).finish()
    }
}

// =============================================================================
// SparseBitMatrix — arena-backed sparse 2D bit matrix
// =============================================================================

/// Metadata for a row slot in the arena-backed sparse matrix.
///
/// Each row is either unallocated (`None`) or points to a contiguous block of
/// `words_per_row` words in the shared backing buffer.
#[derive(Clone, Copy, Debug)]
struct RowSlot {
    /// Byte offset into the backing buffer, measured in words.
    /// The row's data spans `backing[offset..offset + words_per_row]`.
    offset: u32,
}

/// A sparse 2D bit matrix backed by a single contiguous arena.
///
/// Unlike a naive sparse matrix that allocates a separate [`DenseBitSet`] per row
/// (one heap allocation per active row), this design stores all row data in a single
/// `Vec<Word, A>`. An index maps each row to its offset within the buffer, and a
/// free-list recycles slots from cleared rows.
///
/// This gives:
/// - **One allocation** for all rows instead of one per row.
/// - **Cache-friendly** iteration: active rows are contiguous in memory.
/// - **Amortized O(1)** row activation: either pop from free-list or extend the buffer.
/// - **Allocator support**: the entire matrix (index, backing, free-list) can live in a custom
///   allocator.
///
/// `R` and `C` are index types used to identify rows and columns respectively.
///
/// # When to use
///
/// Use `SparseBitMatrix` when most rows are expected to be empty. If the majority of
/// rows will be populated, [`BitMatrix`] is more efficient (no per-row indirection).
#[derive(Clone)]
pub struct SparseBitMatrix<R: Id, C: Id, A: Allocator = Global> {
    col_domain_size: usize,
    words_per_row: usize,

    /// Shared backing buffer for all row data.
    backing: Vec<Word, A>,

    /// Maps row index → slot (or `None` if unallocated).
    index: Vec<Option<RowSlot>, A>,

    /// Free-list of word offsets for reuse by newly activated rows.
    free_slots: Vec<u32, A>,

    marker: PhantomData<fn(R, C)>,
}

impl<R: Id, C: Id> SparseBitMatrix<R, C> {
    /// Creates a new sparse matrix with the given column domain size.
    #[inline]
    #[must_use]
    pub fn new(col_domain_size: usize) -> Self {
        Self::new_in(col_domain_size, Global)
    }
}

impl<R: Id, C: Id, A: Allocator + Clone> SparseBitMatrix<R, C, A> {
    /// Creates a new sparse matrix with the given column domain size, using `alloc`.
    #[inline]
    #[must_use]
    pub fn new_in(col_domain_size: usize, alloc: A) -> Self {
        let words_per_row = num_words(col_domain_size);

        Self {
            col_domain_size,
            words_per_row,
            backing: Vec::new_in(alloc.clone()),
            index: Vec::new_in(alloc.clone()),
            free_slots: Vec::new_in(alloc),
            marker: PhantomData,
        }
    }

    /// Ensures `row` has an allocated slot, returning the word offset.
    #[inline]
    fn ensure_row(&mut self, row: R) -> u32 {
        let row_idx = row.as_usize();

        // Extend the index if needed.
        if row_idx >= self.index.len() {
            self.index.resize(row_idx + 1, None);
        }

        if let Some(slot) = self.index[row_idx] {
            return slot.offset;
        }

        // Allocate from free-list or extend backing.
        let offset = if let Some(offset) = self.free_slots.pop() {
            // Reuse a freed slot — zero it.
            let start = offset as usize;
            self.backing[start..start + self.words_per_row].fill(0);
            offset
        } else {
            debug_assert!(self.backing.len() <= u32::MAX as usize);
            let offset = self.backing.len() as u32;
            self.backing
                .resize(self.backing.len() + self.words_per_row, 0);
            offset
        };

        self.index[row_idx] = Some(RowSlot { offset });
        offset
    }

    /// Returns the word slice for an allocated row, or `None`.
    #[inline]
    fn row_words(&self, row: R) -> Option<&[Word]> {
        let slot = self.index.get(row.as_usize())?.as_ref()?;
        let start = slot.offset as usize;
        Some(&self.backing[start..start + self.words_per_row])
    }

    /// Returns the mutable word slice for an allocated row, or `None`.
    #[inline]
    fn row_words_mut(&mut self, row: R) -> Option<&mut [Word]> {
        let slot = self.index.get(row.as_usize())?.as_ref()?;
        let start = slot.offset as usize;
        Some(&mut self.backing[start..start + self.words_per_row])
    }

    /// Returns an immutable view of `row`, or `None` if the row is unallocated.
    #[inline]
    #[must_use]
    pub fn row(&self, row: R) -> Option<RowRef<'_, C>> {
        self.row_words(row)
            .map(|words| RowRef::new(words, self.col_domain_size))
    }

    #[inline]
    #[must_use]
    pub const fn col_domain_size(&self) -> usize {
        self.col_domain_size
    }

    /// Returns the number of currently allocated rows.
    #[inline]
    #[must_use]
    pub fn allocated_rows(&self) -> usize {
        self.index.iter().filter(|slot| slot.is_some()).count()
    }

    // --- element-level operations ---

    /// Sets the cell at `(row, col)` to true. Returns `true` if the matrix changed.
    ///
    /// Allocates the row on first access.
    ///
    /// # Panics
    ///
    /// Panics if `col` is out of bounds.
    #[inline]
    pub fn insert(&mut self, row: R, col: C) -> bool {
        assert!(col.as_usize() < self.col_domain_size);
        let offset = self.ensure_row(row) as usize;
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        let word = &mut self.backing[offset + word_index];
        let old = *word;
        *word = old | mask;
        *word != old
    }

    /// Clears the cell at `(row, col)`. Returns `true` if the matrix changed.
    ///
    /// Has no effect if the row is unallocated.
    #[inline]
    pub fn remove(&mut self, row: R, col: C) -> bool {
        assert!(col.as_usize() < self.col_domain_size);
        let Some(words) = self.row_words_mut(row) else {
            return false;
        };
        let (word_index, mask) = word_index_and_mask(col.as_usize());
        let word = &mut words[word_index];
        let old = *word;
        *word = old & !mask;
        *word != old
    }

    /// Returns `true` if the cell at `(row, col)` is set.
    #[inline]
    #[must_use]
    pub fn contains(&self, row: R, col: C) -> bool {
        self.row(row).is_some_and(|row_ref| row_ref.contains(col))
    }

    // --- row-level clearing ---

    /// Clears all bits in `row` and returns its slot to the free-list.
    #[inline]
    pub fn clear_row(&mut self, row: R) {
        let row_idx = row.as_usize();
        if let Some(Some(slot)) = self.index.get(row_idx) {
            self.free_slots.push(slot.offset);
            self.index[row_idx] = None;
        }
    }

    /// Clears the entire matrix, returning all slots to the free-list.
    #[inline]
    pub fn clear(&mut self) {
        for slot in &mut self.index {
            if let Some(row_slot) = slot.take() {
                self.free_slots.push(row_slot.offset);
            }
        }
    }

    /// Sets every bit in `row` to true (respecting `col_domain_size`).
    #[inline]
    pub fn insert_all_into_row(&mut self, row: R) {
        let offset = self.ensure_row(row) as usize;
        let words = &mut self.backing[offset..offset + self.words_per_row];
        words.fill(!0);
        clear_excess_bits_in_final_word(self.col_domain_size, words);
    }

    // --- row-to-row operations ---

    /// `write |= read`. Returns `true` if `write` changed.
    ///
    /// Has no effect if `read` is unallocated.
    #[inline]
    pub fn union_rows(&mut self, read: R, write: R) -> bool {
        if read == write {
            return false;
        }

        let Some(read_offset) = self
            .index
            .get(read.as_usize())
            .and_then(|slot| slot.map(|slot| slot.offset as usize))
        else {
            return false;
        };

        let write_offset = self.ensure_row(write) as usize;

        let mut changed: Word = 0;
        for offset in 0..self.words_per_row {
            let old = self.backing[write_offset + offset];
            let new = old | self.backing[read_offset + offset];
            self.backing[write_offset + offset] = new;
            changed |= old ^ new;
        }
        changed != 0
    }

    /// `write -= read` (AND NOT). Returns `true` if `write` changed.
    #[inline]
    pub fn subtract_rows(&mut self, read: R, write: R) -> bool {
        if read == write {
            let was_nonempty = self.row(read).is_some_and(|row| !row.is_empty());
            if was_nonempty {
                self.clear_row(read);
            }
            return was_nonempty;
        }

        let (Some(read_offset), Some(write_offset)) = (
            self.index
                .get(read.as_usize())
                .and_then(|slot| slot.map(|slot| slot.offset as usize)),
            self.index
                .get(write.as_usize())
                .and_then(|slot| slot.map(|slot| slot.offset as usize)),
        ) else {
            return false;
        };

        let mut changed: Word = 0;
        for offset in 0..self.words_per_row {
            let old = self.backing[write_offset + offset];
            let new = old & !self.backing[read_offset + offset];
            self.backing[write_offset + offset] = new;
            changed |= old ^ new;
        }
        changed != 0
    }

    /// `write &= read`. Returns `true` if `write` changed.
    ///
    /// If `read` is unallocated, `write` is cleared (intersect with empty = empty).
    #[inline]
    pub fn intersect_rows(&mut self, read: R, write: R) -> bool {
        if read == write {
            return false;
        }

        let Some(write_offset) = self
            .index
            .get(write.as_usize())
            .and_then(|slot| slot.map(|slot| slot.offset as usize))
        else {
            return false;
        };

        let Some(read_offset) = self
            .index
            .get(read.as_usize())
            .and_then(|slot| slot.map(|slot| slot.offset as usize))
        else {
            // read is empty → write becomes empty
            let was_nonempty = self.row(write).is_some_and(|row_ref| !row_ref.is_empty());
            if was_nonempty {
                self.clear_row(write);
            }
            return was_nonempty;
        };

        let mut changed: Word = 0;
        for offset in 0..self.words_per_row {
            let old = self.backing[write_offset + offset];
            let new = old & self.backing[read_offset + offset];
            self.backing[write_offset + offset] = new;
            changed |= old ^ new;
        }
        changed != 0
    }

    // --- row-to-DenseBitSet operations ---

    /// `row |= other`. Returns `true` if the row changed.
    #[inline]
    pub fn union_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(other.domain_size(), self.col_domain_size);
        let offset = self.ensure_row(row) as usize;
        bitwise(
            &mut self.backing[offset..offset + self.words_per_row],
            &other.words,
            |lhs, rhs| lhs | rhs,
        )
    }

    /// `row -= other`. Returns `true` if the row changed.
    ///
    /// Has no effect if the row is unallocated.
    #[inline]
    pub fn subtract_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(other.domain_size(), self.col_domain_size);
        let Some(words) = self.row_words_mut(row) else {
            return false;
        };
        bitwise(words, &other.words, |lhs, rhs| lhs & !rhs)
    }

    /// `row &= other`. Returns `true` if the row changed.
    ///
    /// Has no effect if the row is unallocated.
    #[inline]
    pub fn intersect_row_with(&mut self, row: R, other: &DenseBitSet<C>) -> bool {
        debug_assert_eq!(other.domain_size(), self.col_domain_size);
        let Some(words) = self.row_words_mut(row) else {
            return false;
        };
        bitwise(words, &other.words, |lhs, rhs| lhs & rhs)
    }

    // --- inspection ---

    /// Returns `true` if `row` has no set bits (or is unallocated).
    #[inline]
    #[must_use]
    pub fn is_empty_row(&self, row: R) -> bool {
        self.row(row).is_none_or(|row_ref| row_ref.is_empty())
    }

    /// Returns the number of set bits in `row` (0 if unallocated).
    #[inline]
    #[must_use]
    pub fn count_row(&self, row: R) -> usize {
        self.row(row).map_or(0, |row_ref| row_ref.count())
    }

    /// Iterates over the set columns in `row`, in ascending order.
    ///
    /// Returns an empty iterator if the row is unallocated.
    #[inline]
    pub fn iter_row(&self, row: R) -> impl Iterator<Item = C> + '_ {
        self.row(row).into_iter().flat_map(RowRef::into_iter)
    }

    /// Iterates over all valid row indices in the index (including unallocated ones).
    #[inline]
    pub fn rows(&self) -> impl ExactSizeIterator<Item = R> + '_ {
        (0..self.index.len()).map(R::from_usize)
    }

    /// Returns `true` if every bit set in `other` is also set in `row`.
    #[inline]
    pub fn superset_row(&self, row: R, other: &DenseBitSet<C>) -> Option<bool> {
        self.row(row).map(|row_ref| row_ref.superset_dense(other))
    }

    /// Returns `true` if every bit set in `row` is also set in `other`.
    #[inline]
    pub fn subset_row(&self, row: R, other: &DenseBitSet<C>) -> Option<bool> {
        self.row(row).map(|row_ref| {
            other
                .words
                .iter()
                .zip(row_ref.words)
                .all(|(&lhs, &rhs)| (lhs & rhs) == rhs)
        })
    }
}

impl<R: Id, C: Id, A: Allocator + Clone> fmt::Debug for SparseBitMatrix<R, C, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        struct Pair<R, C>(R, C);
        impl<R: fmt::Debug, C: fmt::Debug> fmt::Debug for Pair<R, C> {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{:?} → {:?}", self.0, self.1)
            }
        }

        write!(fmt, "SparseBitMatrix ")?;
        let items = self
            .rows()
            .flat_map(|row| self.iter_row(row).map(move |col| Pair(row, col)));
        fmt.debug_set().entries(items).finish()
    }
}
