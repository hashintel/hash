//! Fixed-capacity dense bit sets and bit matrices over row domains.
//!
//! [`BitSet`] marks membership over a dense zero-based index domain in one bit per index - an
//! eighth of a `Vec<bool>` - packed into `u64` words, so iteration skips absent runs sixty-four
//! indices at a time. [`BitMatrix`] stacks one such domain per row at a shared stride, so
//! whole-row folds run word-parallel and a row borrows as a word slice. Capacities are fixed at
//! construction: both answer for exactly the indices below them and panic beyond, like slices.
//!
//! Both types carry an allocator parameter defaulting to [`Global`]: `new` allocates globally,
//! `new_in` places the words in a caller-supplied allocator.

use std::alloc::{Allocator, Global};

#[cfg(test)]
mod tests;

/// Bits per storage word.
const WORD: usize = u64::BITS as usize;
/// Mask selecting an index's bit within its word.
const WORD_MASK: usize = WORD - 1;
/// Shift selecting an index's word: `index >> WORD_SHIFT`.
const WORD_SHIFT: usize = (u64::BITS - 1).count_ones() as usize;

/// A fixed-capacity set of dense indices, one bit per index.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::bitset::BitSet;
///
/// let mut selected = BitSet::new(100);
/// selected.insert(3);
/// selected.insert(97);
///
/// assert!(selected.contains(3));
/// assert!(!selected.contains(4));
/// assert_eq!(selected.iter().collect::<Vec<_>>(), [3, 97]);
/// ```
#[derive(Debug, Clone)]
pub struct BitSet<A: Allocator = Global> {
    words: Box<[u64], A>,
    len: usize,
}

impl BitSet {
    /// Creates an empty set over the indices below `len`.
    #[must_use]
    pub fn new(len: usize) -> Self {
        Self::new_in(len, Global)
    }
}

impl<A: Allocator> BitSet<A> {
    /// Creates an empty set over the indices below `len`, with its words in `alloc`.
    #[must_use]
    pub fn new_in(len: usize, alloc: A) -> Self {
        let words = len.div_ceil(WORD);
        let mut vec = Vec::with_capacity_in(words, alloc);
        vec.resize(words, 0);
        Self {
            words: vec.into_boxed_slice(),
            len,
        }
    }

    /// Returns the capacity: the set answers for indices below it.
    #[inline]
    #[must_use]
    pub const fn len(&self) -> usize {
        self.len
    }

    /// Returns whether the capacity is zero.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Returns whether `index` is in the set.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond the capacity.
    #[inline]
    #[must_use]
    pub const fn contains(&self, index: usize) -> bool {
        assert!(index < self.len, "the index lies beyond the capacity");
        self.words[index >> WORD_SHIFT] & (1 << (index & WORD_MASK)) != 0
    }

    /// Inserts `index` into the set.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond the capacity.
    #[inline]
    pub const fn insert(&mut self, index: usize) {
        assert!(index < self.len, "the index lies beyond the capacity");
        self.words[index >> WORD_SHIFT] |= 1 << (index & WORD_MASK);
    }

    /// Removes every index absent from `other`, leaving the intersection.
    ///
    /// The capacities may differ: an index beyond `other`'s capacity is absent from it by
    /// definition, so it is removed here. The allocators may differ likewise.
    pub fn intersect_with<B: Allocator>(&mut self, other: &BitSet<B>) {
        for (index, word) in self.words.iter_mut().enumerate() {
            *word &= other.words.get(index).copied().unwrap_or(0);
        }
    }

    /// Returns the number of indices in the set.
    #[must_use]
    pub fn count(&self) -> usize {
        self.words
            .iter()
            .map(|&word| word.count_ones() as usize)
            .sum()
    }

    /// Iterates the set's indices in ascending order.
    pub fn iter(&self) -> impl Iterator<Item = usize> + '_ {
        self.words.iter().enumerate().flat_map(|(position, &word)| {
            let base = position * WORD;
            let mut remaining = word;
            core::iter::from_fn(move || {
                if remaining == 0 {
                    return None;
                }

                let bit = remaining.trailing_zeros() as usize;
                remaining &= remaining - 1;
                Some(base + bit)
            })
        })
    }
}

impl<A: Allocator> PartialEq for BitSet<A> {
    fn eq(&self, other: &Self) -> bool {
        self.len == other.len && self.words == other.words
    }
}

impl<A: Allocator> Eq for BitSet<A> {}

/// A fixed-shape dense bit matrix, one bit per cell.
///
/// Rows pack into `u64` words LSB-first at a shared stride of `ceil(columns/64)` words, laid out
/// row-major: a row borrows as a word slice and row-into-row folds run word-parallel. The shape is
/// fixed at construction: the matrix answers for exactly the cells below it and panics beyond,
/// like a slice.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::bitset::BitMatrix;
///
/// let mut reaches = BitMatrix::new(3, 3);
/// reaches.insert(0, 1);
/// reaches.insert(1, 2);
///
/// // Fold row 1 into row 0: everything row 1 reaches, row 0 now reaches.
/// reaches.or_row_into(1, 0);
///
/// assert!(reaches.contains(0, 2));
/// assert!(!reaches.contains(2, 0));
/// ```
#[derive(Debug, Clone)]
pub struct BitMatrix<A: Allocator = Global> {
    /// `rows` rows of `stride` words.
    words: Box<[u64], A>,
    rows: usize,
    columns: usize,
    /// Words per row: `ceil(columns / 64)`.
    stride: usize,
}

impl BitMatrix {
    /// Creates an empty matrix of `rows` by `columns` cells.
    #[must_use]
    pub fn new(rows: usize, columns: usize) -> Self {
        Self::new_in(rows, columns, Global)
    }
}

impl<A: Allocator> BitMatrix<A> {
    /// Creates an empty matrix of `rows` by `columns` cells, with its words in `alloc`.
    #[must_use]
    pub fn new_in(rows: usize, columns: usize, alloc: A) -> Self {
        let stride = columns.div_ceil(WORD);
        let words = rows * stride;
        let mut vec = Vec::with_capacity_in(words, alloc);
        vec.resize(words, 0);
        Self {
            words: vec.into_boxed_slice(),
            rows,
            columns,
            stride,
        }
    }

    /// Returns the row count: the matrix answers for rows below it.
    #[inline]
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }

    /// Returns the column count: each row answers for columns below it.
    #[inline]
    #[must_use]
    pub const fn columns(&self) -> usize {
        self.columns
    }

    /// Returns the words per row: the length row-shaped scratch buffers allocate at.
    #[inline]
    #[must_use]
    pub const fn stride(&self) -> usize {
        self.stride
    }

    /// Returns whether the cell at `row`, `column` is set.
    ///
    /// # Panics
    ///
    /// Panics when `row` or `column` lies at or beyond the shape.
    #[inline]
    #[must_use]
    pub const fn contains(&self, row: usize, column: usize) -> bool {
        assert!(column < self.columns, "the column lies beyond the shape");
        let words = self.row(row);
        words[column >> WORD_SHIFT] & (1 << (column & WORD_MASK)) != 0
    }

    /// Sets the cell at `row`, `column`.
    ///
    /// # Panics
    ///
    /// Panics when `row` or `column` lies at or beyond the shape.
    #[inline]
    pub const fn insert(&mut self, row: usize, column: usize) {
        assert!(row < self.rows, "the row lies beyond the shape");
        assert!(column < self.columns, "the column lies beyond the shape");
        self.words[row * self.stride + (column >> WORD_SHIFT)] |= 1 << (column & WORD_MASK);
    }

    /// Borrows `row`'s words: `stride` words, LSB-first.
    ///
    /// # Panics
    ///
    /// Panics when `row` lies at or beyond the shape.
    #[inline]
    #[must_use]
    pub const fn row(&self, row: usize) -> &[u64] {
        assert!(row < self.rows, "the row lies beyond the shape");
        let start = row * self.stride;
        // Manual re-slicing keeps the accessor const; split_at is not
        // const over ranges.
        let (_, tail) = self.words.split_at(start);
        let (words, _) = tail.split_at(self.stride);
        words
    }

    /// Folds `source`'s row into `target`'s: every column set in `source` becomes set in `target`.
    ///
    /// Folding a row into itself is a no-op: `OR` is idempotent.
    ///
    /// # Panics
    ///
    /// Panics when `source` or `target` lies at or beyond the shape.
    pub fn or_row_into(&mut self, source: usize, target: usize) {
        assert!(source < self.rows, "the source row lies beyond the shape");
        assert!(target < self.rows, "the target row lies beyond the shape");
        if source == target {
            return;
        }

        // The rows are distinct, so splitting at the later row's start
        // borrows both disjointly.
        let (source_words, target_words) = if source < target {
            let (head, tail) = self.words.split_at_mut(target * self.stride);
            (
                &head[source * self.stride..][..self.stride],
                &mut tail[..self.stride],
            )
        } else {
            let (head, tail) = self.words.split_at_mut(source * self.stride);
            (
                &tail[..self.stride],
                &mut head[target * self.stride..][..self.stride],
            )
        };
        for (target_word, &source_word) in target_words.iter_mut().zip(source_words) {
            *target_word |= source_word;
        }
    }
}

impl<A: Allocator> PartialEq for BitMatrix<A> {
    fn eq(&self, other: &Self) -> bool {
        self.rows == other.rows && self.columns == other.columns && self.words == other.words
    }
}

impl<A: Allocator> Eq for BitMatrix<A> {}
