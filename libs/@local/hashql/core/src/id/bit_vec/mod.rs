//! This file is derived from the Rust compiler source code.
//! Source: <https://github.com/rust-lang/rust/blob/f5242367f4acf0130c9b68e6956531b2cb73bd38/compiler/rustc_index/src/bit_set.rs>.
//!
//! Originally dual-licensed under either of:
//!   - Apache License, Version 2.0 (see LICENSE-APACHE.md or <https://www.apache.org/licenses/LICENSE-2.0>)
//!   - MIT license (see LICENSE-MIT.md or <https://opensource.org/licenses/MIT>)
//!
//! You may use, copy, modify, and distribute this file under the terms of the
//! GNU Affero General Public License, Version 3.0, as part of this project,
//! provided that all original notices are preserved.
//!
//! Local adaptations relative to the pinned upstream:
//! API:
//! - Use `Id` in place of `Idx`.
//!   - `index` -> `as_usize`
//!   - `new` -> `from_usize`
//! - Mask helpers are no longer generic over `Id` (we do not implement `Id` for `usize`).
//!
//! Implementation and maintenance:
//! - Removed rustc-specific serialization code.
//! - Migrated to smallvec v2.
//! - Replaced `unwrap` with `unwrap_or_else(|| unreachable!(...))` where applicable.
//! - Applied clippy-driven fixes (no intended semantic changes).
//! - Removed inherent impls for bit relations.
//! - Removed used of `static_assert_size` macro in favor of `assert_eq!`.
//! - Removed mentions of `IntervalSet`.
//! - Implement `MixedBitSet::intersect`.
//! - Implement `DenseBitSet::negate`
//! - Implement `DenseBitSet::first_unset`
#![expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::cast_possible_truncation,
    clippy::too_long_first_doc_paragraph
)]

use alloc::{alloc::Global, rc::Rc};
use core::{
    alloc::Allocator,
    fmt, iter,
    marker::PhantomData,
    ops::{BitAnd, BitAndAssign, BitOrAssign, Bound, Not, Range, RangeBounds, Shl},
    slice,
};

use smallvec::{SmallVec, smallvec};

use super::{Id, IdVec};

#[cfg(test)]
mod tests;

type Word = u64;
const WORD_BYTES: usize = size_of::<Word>();
const WORD_BITS: usize = WORD_BYTES * 8;

// The choice of chunk size has some trade-offs.
//
// A big chunk size tends to favour cases where many large `ChunkedBitSet`s are
// present, because they require fewer `Chunk`s, reducing the number of
// allocations and reducing peak memory usage. Also, fewer chunk operations are
// required, though more of them might be `Mixed`.
//
// A small chunk size tends to favour cases where many small `ChunkedBitSet`s
// are present, because less space is wasted at the end of the final chunk (if
// it's not full).
const CHUNK_WORDS: usize = 32;
const CHUNK_BITS: usize = CHUNK_WORDS * WORD_BITS; // 2048 bits

/// `ChunkSize` is small to keep `Chunk` small. The static assertion ensures it's
/// not too small.
type ChunkSize = u16;
const _: () = assert!(CHUNK_BITS <= ChunkSize::MAX as usize);

pub trait BitRelations<Rhs> {
    fn union(&mut self, other: &Rhs) -> bool;
    fn subtract(&mut self, other: &Rhs) -> bool;
    fn intersect(&mut self, other: &Rhs) -> bool;
}

#[inline]
fn inclusive_start_end<T: Id>(range: impl RangeBounds<T>, domain: usize) -> Option<(usize, usize)> {
    // Both start and end are inclusive.
    let start = match range.start_bound().cloned() {
        Bound::Included(start) => start.as_usize(),
        Bound::Excluded(start) => start.as_usize() + 1,
        Bound::Unbounded => 0,
    };
    let end = match range.end_bound().cloned() {
        Bound::Included(end) => end.as_usize(),
        Bound::Excluded(end) => end.as_usize().checked_sub(1)?,
        Bound::Unbounded => domain - 1,
    };
    assert!(end < domain);
    if start > end {
        return None;
    }
    Some((start, end))
}

/// A fixed-size bitset type with a dense representation.
///
/// Note 1: Since this bitset is dense, if your domain is big, and/or relatively
/// homogeneous (for example, with long runs of bits set or unset), then it may
/// be preferable to instead use a [`MixedBitSet`]. They should be more suited to
/// sparse, or highly-compressible, domains.
///
/// Note 2: Use [`GrowableBitSet`] if you need support for resizing after creation.
///
/// `T` is an index type, typically a newtyped `usize` wrapper, but it can also
/// just be `usize`.
///
/// All operations that involve an element will panic if the element is equal
/// to or greater than the domain size. All operations that involve two bitsets
/// will panic if the bitsets have differing domain sizes.
#[derive(Eq, PartialEq, Hash)]
pub struct DenseBitSet<T> {
    domain_size: usize,
    words: SmallVec<Word, 2>,
    marker: PhantomData<T>,
}

impl<T> DenseBitSet<T> {
    /// Gets the domain size.
    #[must_use]
    pub const fn domain_size(&self) -> usize {
        self.domain_size
    }
}

impl<T: Id> DenseBitSet<T> {
    /// Creates a new, empty bitset with a given `domain_size`.
    #[inline]
    #[must_use]
    pub fn new_empty(domain_size: usize) -> Self {
        let num_words = num_words(domain_size);
        Self {
            domain_size,
            words: smallvec![Word::MIN; num_words],
            marker: PhantomData,
        }
    }

    /// Creates a new, filled bitset with a given `domain_size`.
    #[inline]
    #[must_use]
    pub fn new_filled(domain_size: usize) -> Self {
        let num_words = num_words(domain_size);
        let mut result = Self {
            domain_size,
            words: smallvec![Word::MAX; num_words],
            marker: PhantomData,
        };
        result.clear_excess_bits();
        result
    }

    /// Clear all elements.
    #[inline]
    pub fn clear(&mut self) {
        self.words.fill(0);
    }

    /// Clear excess bits in the final word.
    fn clear_excess_bits(&mut self) {
        clear_excess_bits_in_final_word(self.domain_size, &mut self.words);
    }

    /// Count the number of set bits in the set.
    #[must_use]
    pub fn count(&self) -> usize {
        count_ones(&self.words)
    }

    /// Returns `true` if `self` contains `elem`.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    #[inline]
    pub fn contains(&self, elem: T) -> bool {
        assert!(elem.as_usize() < self.domain_size);
        let (word_index, mask) = word_index_and_mask(elem.as_usize());
        (self.words[word_index] & mask) != 0
    }

    /// Is `self` is a (non-strict) superset of `other`?
    ///
    /// # Panics
    ///
    /// Panics if `self` and `other` have different domain sizes.
    #[inline]
    #[must_use]
    pub fn superset(&self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);

        self.words
            .iter()
            .zip(&other.words)
            .all(|(lhs, rhs)| (lhs & rhs) == *rhs)
    }

    /// Is the set empty?
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.words.iter().all(|word| *word == 0)
    }

    /// Insert `elem`. Returns whether the set has changed.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    #[inline]
    pub fn insert(&mut self, elem: T) -> bool {
        assert!(
            elem.as_usize() < self.domain_size,
            "inserting element at index {} but domain size is {}",
            elem.as_usize(),
            self.domain_size,
        );
        let (word_index, mask) = word_index_and_mask(elem.as_usize());
        let word_ref = &mut self.words[word_index];
        let word = *word_ref;
        let new_word = word | mask;
        *word_ref = new_word;
        new_word != word
    }

    #[inline]
    pub fn set(&mut self, elem: T, value: bool) -> bool {
        if value {
            self.insert(elem)
        } else {
            self.remove(elem)
        }
    }

    #[inline]
    pub fn insert_range(&mut self, elems: impl RangeBounds<T>) {
        let Some((start, end)) = inclusive_start_end(elems, self.domain_size) else {
            return;
        };

        let (start_word_index, start_mask) = word_index_and_mask(start);
        let (end_word_index, end_mask) = word_index_and_mask(end);

        // Set all words in between start and end (exclusively of both).
        for word_index in (start_word_index + 1)..end_word_index {
            self.words[word_index] = !0;
        }

        if start_word_index == end_word_index {
            self.words[start_word_index] |= end_mask | (end_mask - start_mask);
        } else {
            // Start and end are in different words, so we handle each in turn.
            //
            // We set all leading bits. This includes the start_mask bit.
            self.words[start_word_index] |= !(start_mask - 1);
            // And all trailing bits (i.e. from 0..=end) in the end word,
            // including the end.
            self.words[end_word_index] |= end_mask | (end_mask - 1);
        }
    }

    /// Sets all bits to true.
    pub fn insert_all(&mut self) {
        self.words.fill(!0);
        self.clear_excess_bits();
    }

    /// Checks whether any bit in the given range is a 1.
    #[inline]
    pub fn contains_any(&self, elems: impl RangeBounds<T>) -> bool {
        let Some((start, end)) = inclusive_start_end(elems, self.domain_size) else {
            return false;
        };
        let (start_word_index, start_mask) = word_index_and_mask(start);
        let (end_word_index, end_mask) = word_index_and_mask(end);

        if start_word_index == end_word_index {
            self.words[start_word_index] & (end_mask | (end_mask - start_mask)) != 0
        } else {
            if self.words[start_word_index] & !(start_mask - 1) != 0 {
                return true;
            }

            let remaining = start_word_index + 1..end_word_index;
            if remaining.start <= remaining.end {
                self.words[remaining].iter().any(|&w| w != 0)
                    || self.words[end_word_index] & (end_mask | (end_mask - 1)) != 0
            } else {
                false
            }
        }
    }

    /// Returns `true` if the set has changed.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    #[inline]
    pub fn remove(&mut self, elem: T) -> bool {
        assert!(elem.as_usize() < self.domain_size);
        let (word_index, mask) = word_index_and_mask(elem.as_usize());
        let word_ref = &mut self.words[word_index];
        let word = *word_ref;
        let new_word = word & !mask;
        *word_ref = new_word;
        new_word != word
    }

    /// Iterates over the indices of set bits in a sorted order.
    #[inline]
    #[must_use]
    pub fn iter(&self) -> BitIter<'_, T> {
        BitIter::new(&self.words)
    }

    pub fn last_set_in(&self, range: impl RangeBounds<T>) -> Option<T> {
        let (start, end) = inclusive_start_end(range, self.domain_size)?;
        let (start_word_index, _) = word_index_and_mask(start);
        let (end_word_index, end_mask) = word_index_and_mask(end);

        let end_word = self.words[end_word_index] & (end_mask | (end_mask - 1));
        if end_word != 0 {
            let pos = max_bit(end_word) + WORD_BITS * end_word_index;
            if start <= pos {
                return Some(T::from_usize(pos));
            }
        }

        // We exclude end_word_index from the range here, because we don't want
        // to limit ourselves to *just* the last word: the bits set it in may be
        // after `end`, so it may not work out.
        if let Some(offset) = self.words[start_word_index..end_word_index]
            .iter()
            .rposition(|&w| w != 0)
        {
            let word_idx = start_word_index + offset;
            let start_word = self.words[word_idx];
            let pos = max_bit(start_word) + WORD_BITS * word_idx;
            if start <= pos {
                return Some(T::from_usize(pos));
            }
        }

        None
    }

    #[inline]
    #[must_use]
    pub fn first_unset(&self) -> Option<T> {
        let word_idx = self.words.iter().position(|&word| word != !0)?;

        let word = self.words[word_idx];
        let pos = WORD_BITS * word_idx + word.trailing_ones() as usize;
        (pos < self.domain_size).then(|| T::from_usize(pos))
    }

    /// Sets `self = self | !other`.
    ///
    /// FIXME: Incorporate this into [`BitRelations`] and fill out
    /// implementations for other bitset types, if needed.
    ///
    /// # Panics
    ///
    /// Panics if `other` is out of bounds.
    pub fn union_not(&mut self, other: &Self) {
        assert_eq!(self.domain_size, other.domain_size);

        // FIXME(Zalathar): If we were to forcibly _set_ all excess bits before
        // the bitwise update, and then clear them again afterwards, we could
        // quickly and accurately detect whether the update changed anything.
        // But that's only worth doing if there's an actual use-case.

        bitwise(&mut self.words, &other.words, |lhs, rhs| lhs | !rhs);
        // The bitwise update `a | !b` can result in the last word containing
        // out-of-domain bits, so we need to clear them.
        self.clear_excess_bits();
    }

    pub fn negate(&mut self) {
        self.words.iter_mut().for_each(|word| *word = !*word);
        self.clear_excess_bits();
    }
}

// dense REL dense
impl<T: Id> BitRelations<Self> for DenseBitSet<T> {
    fn union(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);
        bitwise(&mut self.words, &other.words, |lhs, rhs| lhs | rhs)
    }

    fn subtract(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);
        bitwise(&mut self.words, &other.words, |lhs, rhs| lhs & !rhs)
    }

    fn intersect(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);
        bitwise(&mut self.words, &other.words, |lhs, rhs| lhs & rhs)
    }
}

impl<T: Id> From<GrowableBitSet<T>> for DenseBitSet<T> {
    fn from(bit_set: GrowableBitSet<T>) -> Self {
        bit_set.bit_set
    }
}

impl<T> Clone for DenseBitSet<T> {
    fn clone(&self) -> Self {
        Self {
            domain_size: self.domain_size,
            words: self.words.clone(),
            marker: PhantomData,
        }
    }

    fn clone_from(&mut self, source: &Self) {
        self.domain_size = source.domain_size;
        self.words.clone_from(&source.words);
    }
}

impl<T: Id> fmt::Debug for DenseBitSet<T> {
    fn fmt(&self, w: &mut fmt::Formatter<'_>) -> fmt::Result {
        w.debug_list().entries(self.iter()).finish()
    }
}

impl<T: Id> fmt::Display for DenseBitSet<T> {
    #[expect(clippy::panic_in_result_fn)]
    fn fmt(&self, w: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut sep = '[';

        // Note: this is a little endian printout of bytes.

        // i tracks how many bits we have printed so far.
        let mut i = 0;
        for word in &self.words {
            let mut word = *word;
            for _ in 0..WORD_BYTES {
                // for each byte in `word`:
                let remain = self.domain_size - i;
                // If less than a byte remains, then mask just that many bits.
                let mask = if remain <= 8 { (1 << remain) - 1 } else { 0xFF };
                assert!(mask <= 0xFF);
                let byte = word & mask;

                w.write_fmt(format_args!("{sep}{byte:02x}"))?;

                if remain <= 8 {
                    break;
                }
                word >>= 8;
                i += 8;
                sep = '-';
            }
            sep = '|';
        }

        w.write_str("]")?;

        Ok(())
    }
}

impl<'this, T: Id> IntoIterator for &'this DenseBitSet<T> {
    type IntoIter = BitIter<'this, T>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub struct BitIter<'a, T: Id> {
    /// A copy of the current word, but with any already-visited bits cleared.
    /// (This lets us use `trailing_zeros()` to find the next set bit.) When it
    /// is reduced to 0, we move onto the next word.
    word: Word,

    /// The offset (measured in bits) of the current word.
    offset: usize,

    /// Underlying iterator over the words.
    iter: slice::Iter<'a, Word>,

    marker: PhantomData<T>,
}

impl<'a, T: Id> BitIter<'a, T> {
    #[inline]
    fn new(words: &'a [Word]) -> Self {
        // We initialize `word` and `offset` to degenerate values. On the first
        // call to `next()` we will fall through to getting the first word from
        // `iter`, which sets `word` to the first word (if there is one) and
        // `offset` to 0. Doing it this way saves us from having to maintain
        // additional state about whether we have started.
        Self {
            word: 0,
            offset: usize::MAX - (WORD_BITS - 1),
            iter: words.iter(),
            marker: PhantomData,
        }
    }
}

impl<T: Id> Iterator for BitIter<'_, T> {
    type Item = T;

    fn next(&mut self) -> Option<T> {
        loop {
            if self.word != 0 {
                // Get the position of the next set bit in the current word,
                // then clear the bit.
                let bit_pos = self.word.trailing_zeros() as usize;
                self.word ^= 1 << bit_pos;
                return Some(T::from_usize(bit_pos + self.offset));
            }

            // Move onto the next word. `wrapping_add()` is needed to handle
            // the degenerate initial value given to `offset` in `new()`.
            self.word = *self.iter.next()?;
            self.offset = self.offset.wrapping_add(WORD_BITS);
        }
    }
}

/// A fixed-size bitset type with a partially dense, partially sparse
/// representation. The bitset is broken into chunks, and chunks that are all
/// zeros or all ones are represented and handled very efficiently.
///
/// This type is especially efficient for sets that typically have a large
/// `domain_size` with significant stretches of all zeros or all ones, and also
/// some stretches with lots of 0s and 1s mixed in a way that causes trouble
/// for `IntervalSet`.
///
/// Best used via `MixedBitSet`, rather than directly, because `MixedBitSet`
/// has better performance for small bitsets.
///
/// `T` is an index type, typically a newtyped `usize` wrapper, but it can also
/// just be `usize`.
///
/// All operations that involve an element will panic if the element is equal
/// to or greater than the domain size. All operations that involve two bitsets
/// will panic if the bitsets have differing domain sizes.
#[derive(PartialEq, Eq)]
pub struct ChunkedBitSet<T> {
    domain_size: usize,

    /// The chunks. Each one contains exactly `CHUNK_BITS` values, except the
    /// last one which contains `1..=CHUNK_BITS` values.
    chunks: Box<[Chunk]>,

    marker: PhantomData<T>,
}

// NOTE: The chunk size is computed on-the-fly on each manipulation of a chunk.
// This avoids storing it, as it's almost always CHUNK_BITS except for the last one.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Chunk {
    /// A chunk that is all zeros; we don't represent the zeros explicitly.
    Zeros,

    /// A chunk that is all ones; we don't represent the ones explicitly.
    Ones,

    /// A chunk that has a mix of zeros and ones, which are represented
    /// explicitly and densely. It never has all zeros or all ones.
    ///
    /// If this is the final chunk there may be excess, unused words. This
    /// turns out to be both simpler and have better performance than
    /// allocating the minimum number of words, largely because we avoid having
    /// to store the length, which would make this type larger. These excess
    /// words are always zero, as are any excess bits in the final in-use word.
    ///
    /// The `ChunkSize` field is the count of 1s set in the chunk, and
    /// must satisfy `0 < count < chunk_domain_size`.
    ///
    /// The words are within an `Rc` because it's surprisingly common to
    /// duplicate an entire chunk, e.g. in `ChunkedBitSet::clone_from()`, or
    /// when a `Mixed` chunk is union'd into a `Zeros` chunk. When we do need
    /// to modify a chunk we use `Rc::make_mut`.
    Mixed(ChunkSize, Rc<[Word; CHUNK_WORDS]>),
}

// This type is used a lot. Make sure it doesn't unintentionally get bigger.
#[cfg(target_pointer_width = "64")]
const _: () = assert!(size_of::<Chunk>() == 16);

impl<T> ChunkedBitSet<T> {
    #[must_use]
    pub const fn domain_size(&self) -> usize {
        self.domain_size
    }

    #[inline]
    #[must_use]
    const fn last_chunk_size(&self) -> ChunkSize {
        let n = self.domain_size % CHUNK_BITS;
        if n == 0 {
            CHUNK_BITS as ChunkSize
        } else {
            n as ChunkSize
        }
    }

    /// All the chunks have a `chunk_domain_size` of `CHUNK_BITS` except the final one.
    #[inline]
    fn chunk_domain_size(&self, chunk: usize) -> ChunkSize {
        if chunk == self.chunks.len() - 1 {
            self.last_chunk_size()
        } else {
            CHUNK_BITS as ChunkSize
        }
    }

    #[cfg(test)]
    fn assert_valid(&self) {
        if self.domain_size == 0 {
            assert!(self.chunks.is_empty());
            return;
        }

        assert!((self.chunks.len() - 1) * CHUNK_BITS <= self.domain_size);
        assert!(self.chunks.len() * CHUNK_BITS >= self.domain_size);
        for (chunk_index, chunk) in self.chunks.iter().enumerate() {
            let chunk_domain_size = self.chunk_domain_size(chunk_index);
            chunk.assert_valid(chunk_domain_size);
        }
    }
}

impl<T: Id> ChunkedBitSet<T> {
    /// Creates a new bitset with a given `domain_size` and chunk kind.
    fn new(domain_size: usize, is_empty: bool) -> Self {
        let chunks = if domain_size == 0 {
            Box::new([])
        } else {
            vec![if is_empty { Chunk::Zeros } else { Chunk::Ones }; num_chunks(domain_size)]
                .into_boxed_slice()
        };

        Self {
            domain_size,
            chunks,
            marker: PhantomData,
        }
    }

    /// Creates a new, empty bitset with a given `domain_size`.
    #[inline]
    #[must_use]
    pub fn new_empty(domain_size: usize) -> Self {
        Self::new(domain_size, /* is_empty */ true)
    }

    /// Creates a new, filled bitset with a given `domain_size`.
    #[inline]
    #[must_use]
    pub fn new_filled(domain_size: usize) -> Self {
        Self::new(domain_size, /* is_empty */ false)
    }

    pub fn clear(&mut self) {
        self.chunks.fill_with(|| Chunk::Zeros);
    }

    #[cfg(test)]
    fn chunks(&self) -> &[Chunk] {
        &self.chunks
    }

    /// Count the number of bits in the set.
    #[must_use]
    pub fn count(&self) -> usize {
        self.chunks
            .iter()
            .enumerate()
            .map(|(index, chunk)| chunk.count(self.chunk_domain_size(index)))
            .sum()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.chunks
            .iter()
            .all(|chunk| matches!(chunk, Chunk::Zeros))
    }

    /// Returns `true` if `self` contains `elem`.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    #[inline]
    pub fn contains(&self, elem: T) -> bool {
        assert!(elem.as_usize() < self.domain_size);
        let chunk = &self.chunks[chunk_index(elem.as_usize())];
        match &chunk {
            Chunk::Zeros => false,
            Chunk::Ones => true,
            Chunk::Mixed(_, words) => {
                let (word_index, mask) = chunk_word_index_and_mask(elem.as_usize());
                (words[word_index] & mask) != 0
            }
        }
    }

    #[inline]
    #[must_use]
    pub fn iter(&self) -> ChunkedBitIter<'_, T> {
        ChunkedBitIter::new(self)
    }

    /// Insert `elem`. Returns whether the set has changed.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    pub fn insert(&mut self, elem: T) -> bool {
        assert!(elem.as_usize() < self.domain_size);
        let chunk_index = chunk_index(elem.as_usize());
        let chunk_domain_size = self.chunk_domain_size(chunk_index);
        let chunk = &mut self.chunks[chunk_index];
        match *chunk {
            Chunk::Zeros => {
                if chunk_domain_size > 1 {
                    #[expect(unsafe_code, reason = "see safety comment")]
                    let mut words = {
                        // We take some effort to avoid copying the words.
                        let words = Rc::<[Word; CHUNK_WORDS]>::new_zeroed();
                        // SAFETY: `words` can safely be all zeroes.
                        unsafe { words.assume_init() }
                    };

                    let words_ref = Rc::get_mut(&mut words).unwrap_or_else(|| {
                        unreachable!(
                            "words has just been initialized and should have a reference count of \
                             1"
                        )
                    });

                    let (word_index, mask) = chunk_word_index_and_mask(elem.as_usize());
                    words_ref[word_index] |= mask;
                    *chunk = Chunk::Mixed(1, words);
                } else {
                    *chunk = Chunk::Ones;
                }
                true
            }
            Chunk::Ones => false,
            Chunk::Mixed(ref mut count, ref mut words) => {
                // We skip all the work if the bit is already set.
                let (word_index, mask) = chunk_word_index_and_mask(elem.as_usize());
                if (words[word_index] & mask) == 0 {
                    *count += 1;
                    if *count < chunk_domain_size {
                        let words = Rc::make_mut(words);
                        words[word_index] |= mask;
                    } else {
                        *chunk = Chunk::Ones;
                    }
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Sets all bits to true.
    pub fn insert_all(&mut self) {
        self.chunks.fill_with(|| Chunk::Ones);
    }

    /// Returns `true` if the set has changed.
    ///
    /// # Panics
    ///
    /// Panics if `elem` is out of bounds.
    pub fn remove(&mut self, elem: T) -> bool {
        assert!(elem.as_usize() < self.domain_size);
        let chunk_index = chunk_index(elem.as_usize());
        let chunk_domain_size = self.chunk_domain_size(chunk_index);
        let chunk = &mut self.chunks[chunk_index];
        match *chunk {
            Chunk::Zeros => false,
            Chunk::Ones => {
                if chunk_domain_size > 1 {
                    #[expect(unsafe_code, reason = "see safety comment")]
                    let mut words = {
                        // We take some effort to avoid copying the words.
                        let words = Rc::<[Word; CHUNK_WORDS]>::new_zeroed();
                        // SAFETY: `words` can safely be all zeroes.
                        unsafe { words.assume_init() }
                    };

                    let words_ref = Rc::get_mut(&mut words).unwrap_or_else(|| {
                        unreachable!(
                            "words has just been initialized and should have a reference count of \
                             1"
                        )
                    });

                    // Set only the bits in use.
                    let num_words = num_words(chunk_domain_size as usize);
                    words_ref[..num_words].fill(!0);
                    clear_excess_bits_in_final_word(
                        chunk_domain_size as usize,
                        &mut words_ref[..num_words],
                    );
                    let (word_index, mask) = chunk_word_index_and_mask(elem.as_usize());
                    words_ref[word_index] &= !mask;
                    *chunk = Chunk::Mixed(chunk_domain_size - 1, words);
                } else {
                    *chunk = Chunk::Zeros;
                }
                true
            }
            Chunk::Mixed(ref mut count, ref mut words) => {
                // We skip all the work if the bit is already clear.
                let (word_index, mask) = chunk_word_index_and_mask(elem.as_usize());
                if (words[word_index] & mask) != 0 {
                    *count -= 1;
                    if *count > 0 {
                        let words = Rc::make_mut(words);
                        words[word_index] &= !mask;
                    } else {
                        *chunk = Chunk::Zeros;
                    }
                    true
                } else {
                    false
                }
            }
        }
    }

    fn chunk_iter(&self, chunk_index: usize) -> ChunkIter<'_, T> {
        let chunk_domain_size = self.chunk_domain_size(chunk_index);
        match self.chunks.get(chunk_index) {
            Some(Chunk::Zeros) => ChunkIter::Zeros,
            Some(Chunk::Ones) => ChunkIter::Ones(0..chunk_domain_size as usize),
            Some(Chunk::Mixed(_, words)) => {
                let num_words = num_words(chunk_domain_size as usize);
                ChunkIter::Mixed(BitIter::new(&words[0..num_words]))
            }
            None => ChunkIter::Finished,
        }
    }
}

impl<T: Id> BitRelations<Self> for ChunkedBitSet<T> {
    fn union(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);

        let num_chunks = self.chunks.len();
        debug_assert_eq!(num_chunks, other.chunks.len());

        let last_chunk_size = self.last_chunk_size();
        debug_assert_eq!(last_chunk_size, other.last_chunk_size());

        let mut changed = false;
        for (chunk_index, (mut self_chunk, other_chunk)) in
            self.chunks.iter_mut().zip(other.chunks.iter()).enumerate()
        {
            let chunk_domain_size = if chunk_index + 1 == num_chunks {
                last_chunk_size
            } else {
                CHUNK_BITS as ChunkSize
            };

            match (&mut self_chunk, &other_chunk) {
                (_, Chunk::Zeros) | (Chunk::Ones, _) => {}
                (Chunk::Zeros, _) | (Chunk::Mixed(..), Chunk::Ones) => {
                    // `other_chunk` fully overwrites `self_chunk`
                    *self_chunk = other_chunk.clone();
                    changed = true;
                }
                (
                    Chunk::Mixed(self_chunk_count, self_chunk_words),
                    Chunk::Mixed(_other_chunk_count, other_chunk_words),
                ) => {
                    // First check if the operation would change
                    // `self_chunk.words`. If not, we can avoid allocating some
                    // words, and this happens often enough that it's a
                    // performance win. Also, we only need to operate on the
                    // in-use words, hence the slicing.
                    let num_words = num_words(chunk_domain_size as usize);

                    // If both sides are the same, nothing will change. This
                    // case is very common and it's a pretty fast check, so
                    // it's a performance win to do it.
                    if self_chunk_words[0..num_words] == other_chunk_words[0..num_words] {
                        continue;
                    }

                    // Do a more precise "will anything change?" test. Also a
                    // performance win.
                    let op = |lhs, rhs| lhs | rhs;
                    if !bitwise_changes(
                        &self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    ) {
                        continue;
                    }

                    // If we reach here, `self_chunk_words` is definitely changing.
                    let self_chunk_words = Rc::make_mut(self_chunk_words);
                    let has_changed = bitwise(
                        &mut self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    );
                    debug_assert!(has_changed);
                    *self_chunk_count = count_ones(&self_chunk_words[0..num_words]) as ChunkSize;
                    if *self_chunk_count == chunk_domain_size {
                        *self_chunk = Chunk::Ones;
                    }
                    changed = true;
                }
            }
        }
        changed
    }

    fn subtract(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);

        let num_chunks = self.chunks.len();
        debug_assert_eq!(num_chunks, other.chunks.len());

        let last_chunk_size = self.last_chunk_size();
        debug_assert_eq!(last_chunk_size, other.last_chunk_size());

        let mut changed = false;
        for (chunk_index, (mut self_chunk, other_chunk)) in
            self.chunks.iter_mut().zip(other.chunks.iter()).enumerate()
        {
            let chunk_domain_size = if chunk_index + 1 == num_chunks {
                last_chunk_size
            } else {
                CHUNK_BITS as ChunkSize
            };

            match (&mut self_chunk, &other_chunk) {
                (Chunk::Zeros, _) | (_, Chunk::Zeros) => {}
                (Chunk::Ones | Chunk::Mixed(..), Chunk::Ones) => {
                    changed = true;
                    *self_chunk = Chunk::Zeros;
                }
                (Chunk::Ones, Chunk::Mixed(other_chunk_count, other_chunk_words)) => {
                    changed = true;
                    let num_words = num_words(chunk_domain_size as usize);
                    debug_assert!(num_words > 0 && num_words <= CHUNK_WORDS);
                    let mut tail_mask =
                        1 << ((chunk_domain_size - ((num_words - 1) * WORD_BITS) as u16) - 1);
                    let mut self_chunk_words = **other_chunk_words;
                    for word in self_chunk_words[0..num_words].iter_mut().rev() {
                        *word = !*word & tail_mask;
                        tail_mask = u64::MAX;
                    }
                    let self_chunk_count = chunk_domain_size - *other_chunk_count;
                    debug_assert_eq!(
                        self_chunk_count,
                        count_ones(&self_chunk_words[0..num_words]) as ChunkSize
                    );
                    *self_chunk = Chunk::Mixed(self_chunk_count, Rc::new(self_chunk_words));
                }
                (
                    Chunk::Mixed(self_chunk_count, self_chunk_words),
                    Chunk::Mixed(_other_chunk_count, other_chunk_words),
                ) => {
                    // See `ChunkedBitSet::union` for details on what is happening here.
                    let num_words = num_words(chunk_domain_size as usize);
                    let op = |lhs: u64, rhs: u64| lhs & !rhs;
                    if !bitwise_changes(
                        &self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    ) {
                        continue;
                    }

                    let self_chunk_words = Rc::make_mut(self_chunk_words);
                    let has_changed = bitwise(
                        &mut self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    );
                    debug_assert!(has_changed);
                    *self_chunk_count = count_ones(&self_chunk_words[0..num_words]) as ChunkSize;
                    if *self_chunk_count == 0 {
                        *self_chunk = Chunk::Zeros;
                    }
                    changed = true;
                }
            }
        }
        changed
    }

    fn intersect(&mut self, other: &Self) -> bool {
        assert_eq!(self.domain_size, other.domain_size);

        let num_chunks = self.chunks.len();
        debug_assert_eq!(num_chunks, other.chunks.len());

        let last_chunk_size = self.last_chunk_size();
        debug_assert_eq!(last_chunk_size, other.last_chunk_size());

        let mut changed = false;
        for (chunk_index, (mut self_chunk, other_chunk)) in
            self.chunks.iter_mut().zip(other.chunks.iter()).enumerate()
        {
            let chunk_domain_size = if chunk_index + 1 == num_chunks {
                last_chunk_size
            } else {
                CHUNK_BITS as ChunkSize
            };

            match (&mut self_chunk, &other_chunk) {
                (Chunk::Zeros, _) | (_, Chunk::Ones) => {}
                (Chunk::Ones, Chunk::Zeros | Chunk::Mixed(..))
                | (Chunk::Mixed(..), Chunk::Zeros) => {
                    changed = true;
                    *self_chunk = other_chunk.clone();
                }
                (
                    Chunk::Mixed(self_chunk_count, self_chunk_words),
                    Chunk::Mixed(_other_chunk_count, other_chunk_words),
                ) => {
                    // See `ChunkedBitSet::union` for details on what is happening here.
                    let num_words = num_words(chunk_domain_size as usize);
                    let op = |lhs, rhs| lhs & rhs;
                    if !bitwise_changes(
                        &self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    ) {
                        continue;
                    }

                    let self_chunk_words = Rc::make_mut(self_chunk_words);
                    let has_changed = bitwise(
                        &mut self_chunk_words[0..num_words],
                        &other_chunk_words[0..num_words],
                        op,
                    );
                    debug_assert!(has_changed);
                    *self_chunk_count = count_ones(&self_chunk_words[0..num_words]) as ChunkSize;
                    if *self_chunk_count == 0 {
                        *self_chunk = Chunk::Zeros;
                    }
                    changed = true;
                }
            }
        }

        changed
    }
}

impl<T> Clone for ChunkedBitSet<T> {
    fn clone(&self) -> Self {
        Self {
            domain_size: self.domain_size,
            chunks: self.chunks.clone(),
            marker: PhantomData,
        }
    }

    /// WARNING: this implementation of `clone_from` will panic if the two
    /// bitsets have different domain sizes. This constraint is not inherent to
    /// `clone_from`, but it works with the existing call sites and allows a
    /// faster implementation, which is important because this function is hot.
    fn clone_from(&mut self, source: &Self) {
        assert_eq!(self.domain_size, source.domain_size);
        debug_assert_eq!(self.chunks.len(), source.chunks.len());

        self.chunks.clone_from(&source.chunks);
    }
}

impl<'this, T: Id> IntoIterator for &'this ChunkedBitSet<T> {
    type IntoIter = ChunkedBitIter<'this, T>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub struct ChunkedBitIter<'a, T: Id> {
    bit_set: &'a ChunkedBitSet<T>,

    // The index of the current chunk.
    chunk_index: usize,

    // The sub-iterator for the current chunk.
    chunk_iter: ChunkIter<'a, T>,
}

impl<'a, T: Id> ChunkedBitIter<'a, T> {
    #[inline]
    fn new(bit_set: &'a ChunkedBitSet<T>) -> Self {
        ChunkedBitIter {
            bit_set,
            chunk_index: 0,
            chunk_iter: bit_set.chunk_iter(0),
        }
    }
}

impl<T: Id> Iterator for ChunkedBitIter<'_, T> {
    type Item = T;

    fn next(&mut self) -> Option<T> {
        loop {
            match &mut self.chunk_iter {
                ChunkIter::Zeros => {}
                ChunkIter::Ones(iter) => {
                    if let Some(next) = iter.next() {
                        return Some(T::from_usize(next + self.chunk_index * CHUNK_BITS));
                    }
                }
                ChunkIter::Mixed(iter) => {
                    if let Some(next) = iter.next() {
                        return Some(T::from_usize(
                            next.as_usize() + self.chunk_index * CHUNK_BITS,
                        ));
                    }
                }
                ChunkIter::Finished => return None,
            }
            self.chunk_index += 1;
            self.chunk_iter = self.bit_set.chunk_iter(self.chunk_index);
        }
    }
}

impl Chunk {
    #[cfg(test)]
    fn assert_valid(&self, chunk_domain_size: ChunkSize) {
        assert!(chunk_domain_size as usize <= CHUNK_BITS);
        match *self {
            Self::Zeros | Self::Ones => {}
            Self::Mixed(count, ref words) => {
                assert!(0 < count && count < chunk_domain_size);

                // Check the number of set bits matches `count`.
                assert_eq!(count_ones(words.as_slice()) as ChunkSize, count);

                // Check the not-in-use words are all zeroed.
                let num_words = num_words(chunk_domain_size as usize);
                if num_words < CHUNK_WORDS {
                    assert_eq!(count_ones(&words[num_words..]) as ChunkSize, 0);
                }
            }
        }
    }

    /// Count the number of 1s in the chunk.
    const fn count(&self, chunk_domain_size: ChunkSize) -> usize {
        match *self {
            Self::Zeros => 0,
            Self::Ones => chunk_domain_size as usize,
            Self::Mixed(count, _) => count as usize,
        }
    }
}

enum ChunkIter<'a, T: Id> {
    Zeros,
    Ones(Range<usize>),
    Mixed(BitIter<'a, T>),
    Finished,
}

impl<T: Id> fmt::Debug for ChunkedBitSet<T> {
    fn fmt(&self, w: &mut fmt::Formatter<'_>) -> fmt::Result {
        w.debug_list().entries(self.iter()).finish()
    }
}

/// Sets `out_vec[i] = op(out_vec[i], in_vec[i])` for each index `i` in both
/// slices. The slices must have the same length.
///
/// Returns true if at least one bit in `out_vec` was changed.
///
/// ## Warning
/// Some bitwise operations (e.g. union-not, xor) can set output bits that were
/// unset in in both inputs. If this happens in the last word/chunk of a bitset,
/// it can cause the bitset to contain out-of-domain values, which need to
/// be cleared with `clear_excess_bits_in_final_word`. This also makes the
/// "changed" return value unreliable, because the change might have only
/// affected excess bits.
#[inline]
fn bitwise<Op>(out_vec: &mut [Word], in_vec: &[Word], op: Op) -> bool
where
    Op: Fn(Word, Word) -> Word,
{
    assert_eq!(out_vec.len(), in_vec.len());
    let mut changed = 0;
    for (out_elem, in_elem) in iter::zip(out_vec, in_vec) {
        let old_val = *out_elem;
        let new_val = op(old_val, *in_elem);
        *out_elem = new_val;
        // This is essentially equivalent to a != with changed being a bool, but
        // in practice this code gets auto-vectorized by the compiler for most
        // operators. Using != here causes us to generate quite poor code as the
        // compiler tries to go back to a boolean on each loop iteration.
        changed |= old_val ^ new_val;
    }
    changed != 0
}

/// Does this bitwise operation change `out_vec`?
#[inline]
fn bitwise_changes<Op>(out_vec: &[Word], in_vec: &[Word], op: Op) -> bool
where
    Op: Fn(Word, Word) -> Word,
{
    assert_eq!(out_vec.len(), in_vec.len());
    for (out_elem, in_elem) in iter::zip(out_vec, in_vec) {
        let old_val = *out_elem;
        let new_val = op(old_val, *in_elem);
        if old_val != new_val {
            return true;
        }
    }
    false
}

/// A bitset with a mixed representation, using `DenseBitSet` for small and
/// medium bitsets, and `ChunkedBitSet` for large bitsets, i.e. those with
/// enough bits for at least two chunks. This is a good choice for many bitsets
/// that can have large domain sizes (e.g. 5000+).
///
/// `T` is an index type, typically a newtyped `usize` wrapper, but it can also
/// just be `usize`.
///
/// All operations that involve an element will panic if the element is equal
/// to or greater than the domain size. All operations that involve two bitsets
/// will panic if the bitsets have differing domain sizes.
#[derive(PartialEq, Eq)]
pub enum MixedBitSet<T> {
    Small(DenseBitSet<T>),
    Large(ChunkedBitSet<T>),
}

impl<T> MixedBitSet<T> {
    #[must_use]
    pub const fn domain_size(&self) -> usize {
        match self {
            Self::Small(set) => set.domain_size(),
            Self::Large(set) => set.domain_size(),
        }
    }
}

impl<T: Id> MixedBitSet<T> {
    #[inline]
    #[must_use]
    pub fn new_empty(domain_size: usize) -> Self {
        if domain_size <= CHUNK_BITS {
            Self::Small(DenseBitSet::new_empty(domain_size))
        } else {
            Self::Large(ChunkedBitSet::new_empty(domain_size))
        }
    }

    #[inline]
    #[must_use]
    pub fn new_filled(domain_size: usize) -> Self {
        if domain_size <= CHUNK_BITS {
            Self::Small(DenseBitSet::new_filled(domain_size))
        } else {
            Self::Large(ChunkedBitSet::new_filled(domain_size))
        }
    }

    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        match self {
            Self::Small(set) => set.is_empty(),
            Self::Large(set) => set.is_empty(),
        }
    }

    #[inline]
    #[must_use]
    pub fn count(&self) -> usize {
        match self {
            Self::Small(set) => set.count(),
            Self::Large(set) => set.count(),
        }
    }

    #[inline]
    pub fn contains(&self, elem: T) -> bool {
        match self {
            Self::Small(set) => set.contains(elem),
            Self::Large(set) => set.contains(elem),
        }
    }

    #[inline]
    pub fn insert(&mut self, elem: T) -> bool {
        match self {
            Self::Small(set) => set.insert(elem),
            Self::Large(set) => set.insert(elem),
        }
    }

    pub fn insert_all(&mut self) {
        match self {
            Self::Small(set) => set.insert_all(),
            Self::Large(set) => set.insert_all(),
        }
    }

    #[inline]
    pub fn remove(&mut self, elem: T) -> bool {
        match self {
            Self::Small(set) => set.remove(elem),
            Self::Large(set) => set.remove(elem),
        }
    }

    #[must_use]
    pub fn iter(&self) -> MixedBitIter<'_, T> {
        match self {
            Self::Small(set) => MixedBitIter::Small(set.iter()),
            Self::Large(set) => MixedBitIter::Large(set.iter()),
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        match self {
            Self::Small(set) => set.clear(),
            Self::Large(set) => set.clear(),
        }
    }
}

impl<T: Id> Clone for MixedBitSet<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Small(set) => Self::Small(set.clone()),
            Self::Large(set) => Self::Large(set.clone()),
        }
    }

    /// WARNING: this implementation of `clone_from` may panic if the two
    /// bitsets have different domain sizes. This constraint is not inherent to
    /// `clone_from`, but it works with the existing call sites and allows a
    /// faster implementation, which is important because this function is hot.
    fn clone_from(&mut self, source: &Self) {
        match (self, source) {
            (Self::Small(set), Self::Small(from)) => set.clone_from(from),
            (Self::Large(set), Self::Large(from)) => set.clone_from(from),
            _ => panic!("MixedBitSet size mismatch"),
        }
    }
}

impl<T: Id> BitRelations<Self> for MixedBitSet<T> {
    fn union(&mut self, other: &Self) -> bool {
        match (self, other) {
            (Self::Small(set), Self::Small(other)) => set.union(other),
            (Self::Large(set), Self::Large(other)) => set.union(other),
            _ => panic!("MixedBitSet size mismatch"),
        }
    }

    fn subtract(&mut self, other: &Self) -> bool {
        match (self, other) {
            (Self::Small(set), Self::Small(other)) => set.subtract(other),
            (Self::Large(set), Self::Large(other)) => set.subtract(other),
            _ => panic!("MixedBitSet size mismatch"),
        }
    }

    fn intersect(&mut self, other: &Self) -> bool {
        match (self, other) {
            (Self::Small(set), Self::Small(other)) => set.intersect(other),
            (Self::Large(set), Self::Large(other)) => set.intersect(other),
            _ => panic!("MixedBitSet size mismatch"),
        }
    }
}

impl<T: Id> fmt::Debug for MixedBitSet<T> {
    fn fmt(&self, w: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Small(set) => set.fmt(w),
            Self::Large(set) => set.fmt(w),
        }
    }
}

impl<'this, T: Id> IntoIterator for &'this MixedBitSet<T> {
    type IntoIter = MixedBitIter<'this, T>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub enum MixedBitIter<'a, T: Id> {
    Small(BitIter<'a, T>),
    Large(ChunkedBitIter<'a, T>),
}

impl<T: Id> Iterator for MixedBitIter<'_, T> {
    type Item = T;

    fn next(&mut self) -> Option<T> {
        match self {
            MixedBitIter::Small(iter) => iter.next(),
            MixedBitIter::Large(iter) => iter.next(),
        }
    }
}

/// A resizable bitset type with a dense representation.
///
/// `T` is an index type, typically a newtyped `usize` wrapper, but it can also
/// just be `usize`.
///
/// All operations that involve an element will panic if the element is equal
/// to or greater than the domain size.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrowableBitSet<T: Id> {
    bit_set: DenseBitSet<T>,
}

impl<T: Id> Default for GrowableBitSet<T> {
    fn default() -> Self {
        Self::new_empty()
    }
}

impl<T: Id> GrowableBitSet<T> {
    /// Ensure that the set can hold at least `min_domain_size` elements.
    pub fn ensure(&mut self, min_domain_size: usize) {
        if self.bit_set.domain_size < min_domain_size {
            self.bit_set.domain_size = min_domain_size;
        }

        let min_num_words = num_words(min_domain_size);
        if self.bit_set.words.len() < min_num_words {
            self.bit_set.words.resize(min_num_words, 0);
        }
    }

    #[must_use]
    pub fn new_empty() -> Self {
        Self {
            bit_set: DenseBitSet::new_empty(0),
        }
    }

    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            bit_set: DenseBitSet::new_empty(capacity),
        }
    }

    /// Returns `true` if the set has changed.
    #[inline]
    pub fn insert(&mut self, elem: T) -> bool {
        self.ensure(elem.as_usize() + 1);
        self.bit_set.insert(elem)
    }

    /// Returns `true` if the set has changed.
    #[inline]
    pub fn remove(&mut self, elem: T) -> bool {
        self.ensure(elem.as_usize() + 1);
        self.bit_set.remove(elem)
    }

    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.bit_set.is_empty()
    }

    #[inline]
    pub fn contains(&self, elem: T) -> bool {
        let (word_index, mask) = word_index_and_mask(elem.as_usize());
        self.bit_set
            .words
            .get(word_index)
            .is_some_and(|word| (word & mask) != 0)
    }

    #[inline]
    #[must_use]
    pub fn iter(&self) -> BitIter<'_, T> {
        self.bit_set.iter()
    }

    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.bit_set.count()
    }
}

impl<T: Id> From<DenseBitSet<T>> for GrowableBitSet<T> {
    fn from(bit_set: DenseBitSet<T>) -> Self {
        Self { bit_set }
    }
}

impl<'this, T: Id> IntoIterator for &'this GrowableBitSet<T> {
    type IntoIter = BitIter<'this, T>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.bit_set.iter()
    }
}

/// A fixed-size 2D bit matrix type with a dense representation.
///
/// `R` and `C` are index types used to identify rows and columns respectively;
/// typically newtyped `usize` wrappers, but they can also just be `usize`.
///
/// All operations that involve a row and/or column index will panic if the
/// index exceeds the relevant bound.
#[derive(Clone, Eq, PartialEq, Hash)]
pub struct BitMatrix<R: Id, C: Id> {
    num_rows: usize,
    num_columns: usize,
    words: SmallVec<Word, 2>,
    marker: PhantomData<(R, C)>,
}

impl<R: Id, C: Id> BitMatrix<R, C> {
    /// Creates a new `rows x columns` matrix, initially empty.
    #[must_use]
    pub fn new(num_rows: usize, num_columns: usize) -> Self {
        // For every element, we need one bit for every other
        // element. Round up to an even number of words.
        let words_per_row = num_words(num_columns);

        Self {
            num_rows,
            num_columns,
            words: smallvec![0; num_rows * words_per_row],
            marker: PhantomData,
        }
    }

    /// Creates a new matrix, with `row` used as the value for every row.
    ///
    /// # Panics
    ///
    /// Panics if `row` has a different number of columns than the matrix.
    #[must_use]
    pub fn from_row_n(row: &DenseBitSet<C>, num_rows: usize) -> Self {
        let num_columns = row.domain_size();
        let words_per_row = num_words(num_columns);
        assert_eq!(words_per_row, row.words.len());

        Self {
            num_rows,
            num_columns,
            words: iter::repeat_n(&row.words, num_rows)
                .flatten()
                .copied()
                .collect(),
            marker: PhantomData,
        }
    }

    pub fn rows(&self) -> impl Iterator<Item = R> {
        (0..self.num_rows).map(R::from_usize)
    }

    /// The range of bits for a given row.
    fn range(&self, row: R) -> (usize, usize) {
        let words_per_row = num_words(self.num_columns);
        let start = row.as_usize() * words_per_row;
        (start, start + words_per_row)
    }

    /// Sets the cell at `(row, column)` to true. Put another way, insert
    /// `column` to the bitset for `row`.
    ///
    /// Returns `true` if this changed the matrix.
    ///
    /// # Panics
    ///
    /// Panics if `row` or `column` are out of bounds.
    pub fn insert(&mut self, row: R, column: C) -> bool {
        assert!(row.as_usize() < self.num_rows && column.as_usize() < self.num_columns);
        let (start, _) = self.range(row);
        let (word_index, mask) = word_index_and_mask(column.as_usize());
        let words = &mut *self.words;
        let word = words[start + word_index];
        let new_word = word | mask;
        words[start + word_index] = new_word;
        word != new_word
    }

    /// Do the bits from `row` contain `column`? Put another way, is
    /// the matrix cell at `(row, column)` true?  Put yet another way,
    /// if the matrix represents (transitive) reachability, can
    /// `row` reach `column`?
    ///
    /// # Panics
    ///
    /// Panics if `row` or `column` are out of bounds.
    pub fn contains(&self, row: R, column: C) -> bool {
        assert!(row.as_usize() < self.num_rows && column.as_usize() < self.num_columns);
        let (start, _) = self.range(row);
        let (word_index, mask) = word_index_and_mask(column.as_usize());
        (self.words[start + word_index] & mask) != 0
    }

    /// Returns those indices that are true in rows `a` and `b`. This
    /// is an *O*(*n*) operation where *n* is the number of elements
    /// (somewhat independent from the actual size of the
    /// intersection, in particular).
    ///
    /// # Panics
    ///
    /// Panics if `row1` or `row2` are out of bounds.
    pub fn intersect_rows(&self, row1: R, row2: R) -> Vec<C> {
        assert!(row1.as_usize() < self.num_rows && row2.as_usize() < self.num_rows);
        let (row1_start, row1_end) = self.range(row1);
        let (row2_start, row2_end) = self.range(row2);
        let mut result = Vec::with_capacity(self.num_columns);
        for (base, (i, j)) in (row1_start..row1_end).zip(row2_start..row2_end).enumerate() {
            let mut word = self.words[i] & self.words[j];
            for bit in 0..WORD_BITS {
                if word == 0 {
                    break;
                }
                if word & 0x1 != 0 {
                    result.push(C::from_usize(base * WORD_BITS + bit));
                }
                word >>= 1;
            }
        }
        result
    }

    /// Adds the bits from row `read` to the bits from row `write`, and
    /// returns `true` if anything changed.
    ///
    /// This is used when computing transitive reachability because if
    /// you have an edge `write -> read`, because in that case
    /// `write` can reach everything that `read` can (and
    /// potentially more).
    ///
    /// # Panics
    ///
    /// Panics if `read` or `write` are out of bounds.
    pub fn union_rows(&mut self, read: R, write: R) -> bool {
        assert!(read.as_usize() < self.num_rows && write.as_usize() < self.num_rows);
        let (read_start, read_end) = self.range(read);
        let (write_start, write_end) = self.range(write);
        let words = &mut *self.words;
        let mut changed = 0;
        for (read_index, write_index) in iter::zip(read_start..read_end, write_start..write_end) {
            let word = words[write_index];
            let new_word = word | words[read_index];
            words[write_index] = new_word;
            // See `bitwise` for the rationale.
            changed |= word ^ new_word;
        }
        changed != 0
    }

    /// Adds the bits from `with` to the bits from row `write`, and
    /// returns `true` if anything changed.
    ///
    /// # Panics
    ///
    /// Panics if `write` is out of bounds.
    pub fn union_row_with(&mut self, with: &DenseBitSet<C>, write: R) -> bool {
        assert!(write.as_usize() < self.num_rows);
        assert_eq!(with.domain_size(), self.num_columns);
        let (write_start, write_end) = self.range(write);
        bitwise(
            &mut self.words[write_start..write_end],
            &with.words,
            |lhs, rhs| lhs | rhs,
        )
    }

    /// Sets every cell in `row` to true.
    ///
    /// # Panics
    ///
    /// Panics if `row` is out of bounds.
    pub fn insert_all_into_row(&mut self, row: R) {
        assert!(row.as_usize() < self.num_rows);
        let (start, end) = self.range(row);

        for word in &mut self.words[start..end] {
            *word = !0;
        }

        clear_excess_bits_in_final_word(self.num_columns, &mut self.words[..end]);
    }

    /// Gets a slice of the underlying words.
    #[must_use]
    pub fn words(&self) -> &[Word] {
        &self.words
    }

    /// Iterates through all the columns set to true in a given row of
    /// the matrix.
    ///
    /// # Panics
    ///
    /// Panics if `row` is out of bounds.
    pub fn iter(&self, row: R) -> BitIter<'_, C> {
        assert!(row.as_usize() < self.num_rows);
        let (start, end) = self.range(row);
        BitIter::new(&self.words[start..end])
    }

    /// Returns the number of elements in `row`.
    pub fn count(&self, row: R) -> usize {
        let (start, end) = self.range(row);
        count_ones(&self.words[start..end])
    }
}

impl<R: Id, C: Id> fmt::Debug for BitMatrix<R, C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        /// Forces its contents to print in regular mode instead of alternate mode.
        struct OneLinePrinter<T>(T);
        impl<T: fmt::Debug> fmt::Debug for OneLinePrinter<T> {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{:?}", self.0)
            }
        }

        write!(fmt, "BitMatrix({}x{}) ", self.num_rows, self.num_columns)?;
        let items = self
            .rows()
            .flat_map(|row| self.iter(row).map(move |column| (row, column)));
        fmt.debug_set().entries(items.map(OneLinePrinter)).finish()
    }
}

/// A fixed-column-size, variable-row-size 2D bit matrix with a moderately
/// sparse representation.
///
/// Initially, every row has no explicit representation. If any bit within a row
/// is set, the entire row is instantiated as `Some(<MixedBitSet>)`.
/// Furthermore, any previously uninstantiated rows prior to it will be
/// instantiated as `None`. Those prior rows may themselves become fully
/// instantiated later on if any of their bits are set.
///
/// `R` and `C` are index types used to identify rows and columns respectively;
/// typically newtyped `usize` wrappers, but they can also just be `usize`.
#[derive(Clone)]
pub struct SparseBitMatrix<R, C, A: Allocator = Global> {
    num_columns: usize,
    rows: IdVec<R, Option<DenseBitSet<C>>, A>,
}

impl<R: Id, C: Id> SparseBitMatrix<R, C> {
    /// Creates a new empty sparse bit matrix with no rows or columns.
    #[must_use]
    pub const fn new(num_columns: usize) -> Self {
        Self {
            num_columns,
            rows: IdVec::new(),
        }
    }
}

impl<R: Id, C: Id, A: Allocator> SparseBitMatrix<R, C, A> {
    /// Creates a new empty sparse bit matrix with no rows or columns.
    #[must_use]
    pub const fn new_in(num_columns: usize, alloc: A) -> Self {
        Self {
            num_columns,
            rows: IdVec::new_in(alloc),
        }
    }

    fn ensure_row(&mut self, row: R) -> &mut DenseBitSet<C> {
        // Instantiate any missing rows up to and including row `row` with an empty `DenseBitSet`.
        // Then replace row `row` with a full `DenseBitSet` if necessary.
        self.rows
            .get_or_insert_with(row, || DenseBitSet::new_empty(self.num_columns))
    }

    /// Sets the cell at `(row, column)` to true. Put another way, insert
    /// `column` to the bitset for `row`.
    ///
    /// Returns `true` if this changed the matrix.
    pub fn insert(&mut self, row: R, column: C) -> bool {
        self.ensure_row(row).insert(column)
    }

    /// Sets the cell at `(row, column)` to false. Put another way, delete
    /// `column` from the bitset for `row`. Has no effect if `row` does not
    /// exist.
    ///
    /// Returns `true` if this changed the matrix.
    pub fn remove(&mut self, row: R, column: C) -> bool {
        match self.rows.get_mut(row) {
            Some(Some(row)) => row.remove(column),
            _ => false,
        }
    }

    /// Sets all columns at `row` to false. Has no effect if `row` does
    /// not exist.
    pub fn clear(&mut self, row: R) {
        if let Some(Some(row)) = self.rows.get_mut(row) {
            row.clear();
        }
    }

    /// Do the bits from `row` contain `column`? Put another way, is
    /// the matrix cell at `(row, column)` true?  Put yet another way,
    /// if the matrix represents (transitive) reachability, can
    /// `row` reach `column`?
    pub fn contains(&self, row: R, column: C) -> bool {
        self.row(row).is_some_and(|row| row.contains(column))
    }

    /// Adds the bits from row `read` to the bits from row `write`, and
    /// returns `true` if anything changed.
    ///
    /// This is used when computing transitive reachability because if
    /// you have an edge `write -> read`, because in that case
    /// `write` can reach everything that `read` can (and
    /// potentially more).
    pub fn union_rows(&mut self, read: R, write: R) -> bool {
        if read == write || self.row(read).is_none() {
            return false;
        }

        self.ensure_row(write);
        if let Ok([Some(read_row), Some(write_row)]) = self.rows.get_disjoint_mut([read, write]) {
            write_row.union(read_row)
        } else {
            unreachable!()
        }
    }

    /// Insert all bits in the given row.
    pub fn insert_all_into_row(&mut self, row: R) {
        self.ensure_row(row).insert_all();
    }

    pub fn rows(&self) -> impl Iterator<Item = R> {
        self.rows.ids()
    }

    /// Iterates through all the columns set to true in a given row of
    /// the matrix.
    pub fn iter(&self, row: R) -> impl Iterator<Item = C> {
        self.row(row).into_iter().flat_map(|row| row.iter())
    }

    pub fn row(&self, row: R) -> Option<&DenseBitSet<C>> {
        self.rows.get(row)?.as_ref()
    }

    pub fn superset_row(&self, row: R, other: &DenseBitSet<C>) -> Option<bool> {
        match self.rows.get(row) {
            Some(Some(row)) => Some(row.superset(other)),
            _ => None,
        }
    }

    pub fn subset_row(&self, row: R, other: &DenseBitSet<C>) -> Option<bool> {
        match self.rows.get(row) {
            Some(Some(row)) => Some(other.superset(row)),
            _ => None,
        }
    }

    /// Intersects `row` with `set`. `set` can be either `DenseBitSet` or
    /// `ChunkedBitSet`. Has no effect if `row` does not exist.
    ///
    /// Returns true if the row was changed.
    pub fn intersect_row<Set>(&mut self, row: R, set: &Set) -> bool
    where
        DenseBitSet<C>: BitRelations<Set>,
    {
        match self.rows.get_mut(row) {
            Some(Some(row)) => row.intersect(set),
            _ => false,
        }
    }

    /// Subtracts `set` from `row`. `set` can be either `DenseBitSet` or
    /// `ChunkedBitSet`. Has no effect if `row` does not exist.
    ///
    /// Returns true if the row was changed.
    pub fn subtract_row<Set>(&mut self, row: R, set: &Set) -> bool
    where
        DenseBitSet<C>: BitRelations<Set>,
    {
        match self.rows.get_mut(row) {
            Some(Some(row)) => row.subtract(set),
            _ => false,
        }
    }

    /// Unions `row` with `set`. `set` can be either `DenseBitSet` or
    /// `ChunkedBitSet`.
    ///
    /// Returns true if the row was changed.
    pub fn union_row<Set>(&mut self, row: R, set: &Set) -> bool
    where
        DenseBitSet<C>: BitRelations<Set>,
    {
        self.ensure_row(row).union(set)
    }
}

impl<R, C: Id> fmt::Debug for SparseBitMatrix<R, C> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SparseBitMatrix")
            .field("num_columns", &self.num_columns)
            .field("rows", &self.rows)
            .finish()
    }
}

#[inline]
const fn num_words(domain_size: usize) -> usize {
    domain_size.div_ceil(WORD_BITS)
}

#[inline]
fn num_chunks(domain_size: usize) -> usize {
    assert!(domain_size > 0);
    domain_size.div_ceil(CHUNK_BITS)
}

#[inline]
const fn word_index_and_mask(elem: usize) -> (usize, Word) {
    let word_index = elem / WORD_BITS;
    let mask = 1 << (elem % WORD_BITS);
    (word_index, mask)
}

#[inline]
const fn chunk_index(elem: usize) -> usize {
    elem / CHUNK_BITS
}

#[inline]
const fn chunk_word_index_and_mask(elem: usize) -> (usize, Word) {
    let chunk_elem = elem % CHUNK_BITS;
    word_index_and_mask(chunk_elem)
}

fn clear_excess_bits_in_final_word(domain_size: usize, words: &mut [Word]) {
    let num_bits_in_final_word = domain_size % WORD_BITS;
    if num_bits_in_final_word > 0 {
        let mask = (1 << num_bits_in_final_word) - 1;
        words[words.len() - 1] &= mask;
    }
}

#[inline]
const fn max_bit(word: Word) -> usize {
    WORD_BITS - 1 - word.leading_zeros() as usize
}

#[inline]
fn count_ones(words: &[Word]) -> usize {
    words.iter().map(|word| word.count_ones() as usize).sum()
}

/// Integral type used to represent the bit set.
pub trait FiniteBitSetTy:
    BitAnd<Output = Self>
    + BitAndAssign
    + BitOrAssign
    + Clone
    + Copy
    + Shl
    + Not<Output = Self>
    + PartialEq
    + Sized
{
    /// Size of the domain representable by this type, e.g. 64 for `u64`.
    const DOMAIN_SIZE: u32;

    /// Value which represents the `FiniteBitSet` having every bit set.
    const FILLED: Self;
    /// Value which represents the `FiniteBitSet` having no bits set.
    const EMPTY: Self;

    /// Value for one as the integral type.
    const ONE: Self;
    /// Value for zero as the integral type.
    const ZERO: Self;

    /// Perform a checked left shift on the integral type.
    fn checked_shl(self, rhs: u32) -> Option<Self>;
    /// Perform a checked right shift on the integral type.
    fn checked_shr(self, rhs: u32) -> Option<Self>;
}

impl FiniteBitSetTy for u32 {
    const DOMAIN_SIZE: Self = 32;
    const EMPTY: Self = Self::MIN;
    const FILLED: Self = Self::MAX;
    const ONE: Self = 1_u32;
    const ZERO: Self = 0_u32;

    fn checked_shl(self, rhs: u32) -> Option<Self> {
        self.checked_shl(rhs)
    }

    fn checked_shr(self, rhs: u32) -> Option<Self> {
        self.checked_shr(rhs)
    }
}

impl fmt::Debug for FiniteBitSet<u32> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:032b}", self.0)
    }
}

/// A fixed-sized bitset type represented by an integer type. Indices outwith than the range
/// representable by `T` are considered set.
#[derive(Copy, Clone, Eq, PartialEq)]
pub struct FiniteBitSet<T: FiniteBitSetTy>(pub T);

impl<T: FiniteBitSetTy> FiniteBitSet<T> {
    /// Creates a new, empty bitset.
    pub const fn new_empty() -> Self {
        Self(T::EMPTY)
    }

    /// Sets the `index`th bit.
    pub fn insert(&mut self, index: u32) {
        self.0 |= T::ONE.checked_shl(index).unwrap_or(T::ZERO);
    }

    pub fn remove(&mut self, index: u32) {
        self.0 &= !T::ONE.checked_shl(index).unwrap_or(T::ZERO);
    }

    pub fn set(&mut self, index: u32, value: bool) {
        if value {
            self.insert(index);
        } else {
            self.remove(index);
        }
    }

    /// Sets the `i`th to `j`th bits.
    pub fn insert_range(&mut self, range: Range<u32>) {
        let bits = T::FILLED
            .checked_shl(range.end - range.start)
            .unwrap_or(T::ZERO)
            .not()
            .checked_shl(range.start)
            .unwrap_or(T::ZERO);
        self.0 |= bits;
    }

    /// Is the set empty?
    pub fn is_empty(&self) -> bool {
        self.0 == T::EMPTY
    }

    /// Returns the domain size of the bitset.
    #[must_use]
    pub const fn within_domain(index: u32) -> bool {
        index < T::DOMAIN_SIZE
    }

    /// Returns if the `index`th bit is set.
    pub fn contains(&self, index: u32) -> Option<bool> {
        Self::within_domain(index)
            .then(|| ((self.0.checked_shr(index).unwrap_or(T::ONE)) & T::ONE) == T::ONE)
    }
}

impl<T: FiniteBitSetTy> Default for FiniteBitSet<T> {
    fn default() -> Self {
        Self::new_empty()
    }
}
