#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use alloc::boxed::Box;
use core::{
    fmt, iter,
    marker::PhantomData,
    ops::{Index, IndexMut, Range},
    ptr,
};

use hashql_core::id::{
    Id,
    bit_vec::{BitRelations, DenseBitSet},
};
use zerocopy::{
    FromBytes as _, FromZeros as _, IntoBytes as _, LE, TryFromBytes as _, U64, error::ConvertError,
};

/// The width of one storage word, bits.
const WORD_BITS: usize = u64::BITS as usize;

/// The width of one storage word, bytes.
const WORD_BYTES: usize = size_of::<U64<LE>>();

/// Returns the number of words a domain of `domain_size` rows occupies.
const fn num_words(domain_size: u64) -> u64 {
    domain_size.div_ceil(WORD_BITS as u64)
}

/// Returns the word holding `row` and the mask selecting its bit within that word.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the quotient names the row's word and the remainder its bit within that word"
)]
const fn word_index_and_mask(row: u64) -> (usize, u64) {
    // An in-memory slice has a `usize`-representable word count. Every call bounds `row` to the
    // domain stored in that slice. The row's word index fits `usize`.
    #[expect(clippy::cast_possible_truncation)]
    let index = (row / WORD_BITS as u64) as usize;
    (index, 1 << (row % WORD_BITS as u64))
}

/// A byte frame [`DenseBitSlice::try_from_prefix`] refused.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParseDenseBitSliceError {
    /// The bytes end before the 8-byte domain header.
    Header {
        /// The refused buffer's byte length.
        bytes: usize,
    },
    /// The buffer carries fewer whole words than the header's domain occupies.
    WordCount {
        /// The domain the header claims.
        domain_size: u64,
        /// The whole words the buffer carries after its header.
        words: usize,
    },
    /// A bit above the domain is set in the final word.
    ExcessBits,
}

impl fmt::Display for ParseDenseBitSliceError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header { bytes } => write!(
                fmt,
                "the frame must open with an 8-byte domain header; the bytes end after {bytes}"
            ),
            Self::WordCount { domain_size, words } => write!(
                fmt,
                "the frame's header claims a domain of {domain_size} rows, which needs more words \
                 than the {words} the buffer carries"
            ),
            Self::ExcessBits => {
                fmt.write_str("the frame sets a bit above its domain in the final word")
            }
        }
    }
}

impl core::error::Error for ParseDenseBitSliceError {}

/// Unvalidated storage for constructing and checking a [`DenseBitSlice`].
///
/// The field types and their order must match `DenseBitSlice`. Any initialized header and words are
/// valid here, including a zeroed allocation whose header does not yet describe its word count.
#[derive(
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
struct RawDenseBitSlice<T> {
    /// [`DenseBitSlice`]'s header, not yet coupled to the word count.
    domain_size: U64<LE>,
    /// The row domain the words index.
    marker: PhantomData<T>,
    /// The storage words, with no restriction on excess bits.
    words: [U64<LE>],
}

/// A dense membership set over one row domain, stored as transportable bytes.
///
/// The set uses one bit per domain row, rounded up to a whole word, plus its header. Use it when
/// membership is dense or the domain is small. The type parameter distinguishes row domains at
/// compile time.
///
/// The set is its own byte format. A frame is the domain size as an 8-byte little-endian count,
/// then the member bits packed 64 to a little-endian word in ascending row order, with every bit
/// above the domain zero. [`DenseBitSlice::try_from_prefix`] reads a frame in place off the front
/// of a buffer, without copying and at any byte offset, refuses one whose header, word count, or
/// excess bits break that layout, and returns the bytes after the frame.
/// [`zerocopy::IntoBytes::as_bytes`] exposes a live set as that frame.
///
/// Every [`zerocopy::TryFromBytes`] conversion checks the word count and excess bits as part of
/// validation. Use [`Self::try_from_prefix`] to read a frame followed by other data. It derives the
/// frame length from the header.
///
/// The set is unsized. Create one in place behind a box with [`DenseBitSlice::new_empty`], or
/// borrow one from existing bytes with [`DenseBitSlice::try_from_prefix`]. The domain is fixed at
/// creation, and mutation never moves the storage.
///
/// Sets are equal when they draw from the same domain and admit the same rows. The [`BitRelations`]
/// implementations modify the set by union, subtraction or intersection and return whether
/// membership changed. They panic if the domains differ, for either a [`DenseBitSet`] or another
/// `DenseBitSlice` operand.
///
/// # Example
///
/// This in-crate example is ignored because the types are crate-private.
///
/// ```ignore
/// use zerocopy::IntoBytes as _;
///
/// use crate::bitset::DenseBitSlice;
/// use crate::identity::NodeRowId;
///
/// let mut visible = DenseBitSlice::new_empty(1_000);
/// visible.insert(NodeRowId::new(3));
/// visible.insert(NodeRowId::new(64));
///
/// let bytes = visible.as_bytes();
/// let (read, rest) = DenseBitSlice::<NodeRowId>::try_from_prefix(bytes)?;
/// assert!(read.contains(NodeRowId::new(3)));
/// assert_eq!(read.count(), 2);
/// assert!(rest.is_empty());
/// # Ok::<(), crate::bitset::ParseDenseBitSliceError>(())
/// ```
#[derive(zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
pub(crate) struct DenseBitSlice<T> {
    /// The number of admissible rows, `0..domain_size`.
    domain_size: U64<LE>,
    /// The row domain the words index.
    marker: PhantomData<T>,
    /// The member bits, one word per 64 domain rows.
    ///
    /// Bits at positions at or beyond `domain_size` in the final word are zero. [`Self::insert`]
    /// refuses the rows that would set one, and bit validity refuses the frames that carry one.
    words: [U64<LE>],
}

impl<T> DenseBitSlice<T> {
    /// Creates a set admitting no rows of a `domain_size`-row domain.
    ///
    /// # Panics
    ///
    /// Panics if the zeroed allocation fails.
    #[must_use]
    pub(crate) fn new_empty(domain_size: usize) -> Box<Self> {
        // rounding a usize domain up to words produces no more words than domain rows
        #[expect(clippy::cast_possible_truncation)]
        let words = num_words(domain_size as u64) as usize;
        let mut raw = RawDenseBitSlice::<T>::new_box_zeroed_with_elems(words)
            .expect("the allocation for the set's words succeeds");
        raw.domain_size = U64::new(domain_size as u64);

        // SAFETY: Identical repr(C) fields give both types the same allocation layout and
        // trailing-word metadata. The header now describes exactly the allocated word count, and
        // the zeroed words have no excess bits set. Transferring the Box's unique ownership through
        // this cast therefore yields a valid frame and preserves its deallocation layout.
        unsafe { Box::from_raw(Box::into_raw(raw) as *mut Self) }
    }

    /// Reads one frame off the front of `bytes`, returning the set and the remaining bytes.
    ///
    /// Reads at any byte alignment without copying. The header determines the frame length, and
    /// validation rejects excess bits in its final word.
    ///
    /// # Errors
    ///
    /// Returns [`ParseDenseBitSliceError`] for a missing header, insufficient words or nonzero
    /// excess bits, checked in that order.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the error reports the whole words the buffer carries, which is the floored byte \
                  quotient"
    )]
    pub(crate) fn try_from_prefix(bytes: &[u8]) -> Result<(&Self, &[u8]), ParseDenseBitSliceError> {
        let frame_bytes = bytes.len();
        let (domain_size, trailing) = U64::<LE>::read_from_prefix(bytes)
            .map_err(|_error| ParseDenseBitSliceError::Header { bytes: frame_bytes })?;
        let domain_size = domain_size.get();

        // A word count above the address space matches no buffer the address space holds.
        let words = usize::try_from(num_words(domain_size)).map_err(|_error| {
            ParseDenseBitSliceError::WordCount {
                domain_size,
                words: trailing.len() / WORD_BYTES,
            }
        })?;

        // zerocopy's plain prefix conversion chooses the largest word count that fits the buffer.
        // Supplying the header's count preserves any following data as the remainder.
        Self::try_ref_from_prefix_with_elems(bytes, words).map_err(|error| match error {
            ConvertError::Alignment(_) => unreachable!("the set reads at any alignment"),
            ConvertError::Size(_) => ParseDenseBitSliceError::WordCount {
                domain_size,
                words: trailing.len() / WORD_BYTES,
            },
            // Frame validity requires the header's word count and zero excess bits. Supplying that
            // word count to the cast satisfies the first condition. Only excess bits can cause a
            // validity error.
            ConvertError::Validity(_) => ParseDenseBitSliceError::ExcessBits,
        })
    }

    /// Borrows one frame from `bytes` without validating it.
    ///
    /// # Safety
    ///
    /// `bytes` must be exactly one valid frame: an 8-byte domain header, then exactly the whole
    /// words that domain occupies with no bit above the domain set.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "a frame is one header word plus whole storage words, so the division is exact"
    )]
    const unsafe fn from_frame_unchecked(bytes: &[u8]) -> &Self {
        let words = (bytes.len() - WORD_BYTES) / WORD_BYTES;
        // SAFETY: repr(C) places the alignment-one header before the trailing words, whose count is
        // the DST metadata. The caller guarantees an exact valid frame, and the shared byte slice
        // supplies initialized memory and its borrow lifetime. The reconstructed pointer therefore
        // covers exactly that frame and may be borrowed for the same lifetime.
        unsafe { &*ptr::from_raw_parts(bytes.as_ptr(), words) }
    }

    /// Borrows one frame from `bytes` mutably without validating it.
    ///
    /// # Safety
    ///
    /// `bytes` must be exactly one valid frame, as for [`Self::from_frame_unchecked`].
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "a frame is one header word plus whole storage words, so the division is exact"
    )]
    unsafe fn from_frame_unchecked_mut(bytes: &mut [u8]) -> &mut Self {
        let words = (bytes.len() - WORD_BYTES) / WORD_BYTES;
        // SAFETY: The layout and valid-frame reasoning is the same as in `from_frame_unchecked`.
        // The mutable byte slice supplies exclusive access for the returned borrow's lifetime. It
        // is therefore sound to borrow this exact frame mutably.
        unsafe { &mut *ptr::from_raw_parts_mut(bytes.as_mut_ptr(), words) }
    }

    /// Returns the frame length in bytes for a `domain_size`-row domain.
    ///
    /// The length is `8 · (1 + ⌈domain_size / 64⌉)`, including the header. It fits in `u64` for
    /// every `u64` domain size.
    #[must_use]
    pub(crate) const fn total_byte_len(domain_size: u64) -> u64 {
        (num_words(domain_size) + 1) * WORD_BYTES as u64
    }

    /// Returns the number of rows the domain admits.
    #[must_use]
    pub(crate) const fn domain_size(&self) -> u64 {
        self.domain_size.get()
    }

    /// Views the member bits as whole storage words, without copying.
    ///
    /// One little-endian word per 64 rows of domain, rows LSB-first within the word. Every bit at
    /// or past the domain is zero under the frame invariant.
    #[must_use]
    pub(crate) const fn words(&self) -> &[U64<LE>] {
        &self.words
    }

    /// Returns the number of rows the set admits.
    #[must_use]
    pub(crate) fn count(&self) -> u64 {
        self.words
            .iter()
            .map(|word| u64::from(word.get().count_ones()))
            .sum()
    }

    /// Sets `self = op(self, rhs)` word by word, reporting whether any word changed.
    ///
    /// `rhs` must contain exactly the words of a set over `domain`. The operation must preserve
    /// zero excess bits, including if it panics after modifying earlier words.
    ///
    /// # Panics
    ///
    /// Panics if `domain` differs from this set's domain. Propagates panics from `rhs` and `op`.
    fn apply<Op: Fn(u64, u64) -> u64>(
        &mut self,
        domain: u64,
        rhs: impl Iterator<Item = u64>,
        op: Op,
    ) -> bool {
        assert_eq!(
            self.domain_size.get(),
            domain,
            "the sets draw from the same domain"
        );

        let mut changed = 0;
        for (word, rhs) in iter::zip(&mut self.words, rhs) {
            let old = word.get();
            let new = op(old, rhs);
            word.set(new);

            // loop-free means that LLVM has a change to vectorize here
            changed |= old ^ new;
        }

        changed != 0
    }
}

impl<T: Id> DenseBitSlice<T> {
    /// Returns whether the set admits `row`.
    ///
    /// An index outside the domain is not admitted.
    #[must_use]
    pub(crate) fn contains(&self, index: T) -> bool {
        let row = index.as_u64();
        if row >= self.domain_size.get() {
            return false;
        }
        let (index, mask) = word_index_and_mask(row);
        self.words[index].get() & mask != 0
    }

    /// Returns the number of admitted rows below `row`: the row's rank in admission order.
    ///
    /// A row at or beyond the domain ranks after every member, so it counts them all. The cost is
    /// one popcount per word below `row`.
    #[must_use]
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the quotient names the row's word and the remainder its bit within that word"
    )]
    pub(crate) fn count_below(&self, index: T) -> u64 {
        let row = index.as_u64().min(self.domain_size.get());

        // clamping to the domain keeps the word index at or below the stored word count
        #[expect(clippy::cast_possible_truncation)]
        let index = (row / WORD_BITS as u64) as usize;
        let full: u64 = self.words[..index]
            .iter()
            .map(|word| u64::from(word.get().count_ones()))
            .sum();

        let bit = row % WORD_BITS as u64;
        if bit == 0 {
            // a word boundary needs no partial-word read, including the boundary after the final
            // word
            return full;
        }

        full + u64::from((self.words[index].get() & ((1 << bit) - 1)).count_ones())
    }

    /// Sets `index` to `value`, returning whether the set changed.
    ///
    /// Clearing a row outside the domain returns `false`.
    ///
    /// # Panics
    ///
    /// Panics if `value` is `true` and `index` lies outside the domain.
    #[inline]
    pub(crate) fn set(&mut self, index: T, value: bool) -> bool {
        if value {
            self.insert(index)
        } else {
            self.remove(index)
        }
    }

    /// Inserts `index`, returning whether the set changed.
    ///
    /// # Panics
    ///
    /// This panics when `index` lies outside the domain.
    pub(crate) fn insert(&mut self, index: T) -> bool {
        assert!(
            index.as_u64() < self.domain_size.get(),
            "the row lies in the set's domain"
        );
        let (index, mask) = word_index_and_mask(index.as_u64());
        let stored = self.words[index].get();
        self.words[index] = U64::new(stored | mask);
        stored & mask == 0
    }

    /// Removes `index`, returning whether the set changed.
    ///
    /// Removing a row outside the domain never changes the set.
    pub(crate) fn remove(&mut self, index: T) -> bool {
        let index = index.as_u64();
        if index >= self.domain_size.get() {
            return false;
        }
        let (index, mask) = word_index_and_mask(index);
        let stored = self.words[index].get();
        self.words[index] = U64::new(stored & !mask);
        stored & mask != 0
    }

    /// Iterates the rows the set admits, in ascending order.
    ///
    /// Every admitted row must be representable by both `usize` and `T`. Byte-frame validation
    /// checks the stored domain and padding, not these iteration bounds.
    ///
    /// # Panics
    ///
    /// Advancing the iterator panics if a row is outside `T`'s range.
    pub(crate) fn iter(&self) -> impl Iterator<Item = T> + '_ {
        self.words.iter().enumerate().flat_map(|(index, word)| {
            let mut bits = word.get();
            iter::from_fn(move || {
                (bits != 0).then(|| {
                    let bit = bits.trailing_zeros() as usize;
                    bits &= bits - 1;
                    T::from_usize(index * WORD_BITS + bit)
                })
            })
        })
    }

    /// Iterates the rows the set admits inside `range`, in ascending order.
    ///
    /// The range's end is clamped to the domain, so rows a longer range would name are simply
    /// absent.
    ///
    /// # Panics
    ///
    /// This panics when `range.start` exceeds `range.end`. An inverted range admits no iteration
    /// order, so it is a caller bug rather than an empty result.
    pub(crate) fn iter_in(&self, range: Range<T>) -> RowsIn<'_, T> {
        let start = range.start.as_u64();
        let end = range.end.as_u64();
        assert!(
            start <= end,
            "an inverted row range admits no iteration order"
        );

        RowsIn {
            words: &self.words,
            position: start,
            end: end.min(self.domain_size.get()),
            marker: PhantomData,
        }
    }
}

/// Iterator over the rows a [`DenseBitSlice`] admits inside a range, ascending.
///
/// The cursor is `u64` so the word-boundary jump cannot overflow at the top of a `u32` row
/// domain. The end is at most the domain, so every word the cursor touches is in memory.
#[derive(Debug)]
pub(crate) struct RowsIn<'set, T> {
    /// The set's member bits.
    words: &'set [U64<LE>],
    /// The next row to examine.
    position: u64,
    /// The first row past the range.
    end: u64,
    marker: PhantomData<T>,
}

impl<T: Id> Iterator for RowsIn<'_, T> {
    type Item = T;

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the quotient names the cursor's word and the remainder its bit within that word"
    )]
    fn next(&mut self) -> Option<T> {
        while self.position < self.end {
            // Every row below `end` lies in the domain, so the word index is in bounds.
            #[expect(clippy::cast_possible_truncation)]
            let word = self.words[(self.position / WORD_BITS as u64) as usize].get();
            // Mask off the bits below the cursor, then jump to the next set bit inside this
            // word, if any.
            let masked = word & (u64::MAX << (self.position % WORD_BITS as u64));
            let next = (self.position / WORD_BITS as u64) * WORD_BITS as u64
                + u64::from(masked.trailing_zeros());
            if masked != 0 {
                if next >= self.end {
                    // The next set bit lies at or beyond the range.
                    break;
                }
                self.position = next + 1;
                return Some(T::from_u64(next));
            }
            // Skip to the next word boundary.
            self.position = (self.position / WORD_BITS as u64 + 1) * WORD_BITS as u64;
        }

        None
    }
}

// Both operands have zero excess bits. OR, AND-NOT and AND preserve those zeros.
impl<T> BitRelations<DenseBitSet<T>> for DenseBitSlice<T> {
    fn union(&mut self, other: &DenseBitSet<T>) -> bool {
        self.apply(
            other.domain_size() as u64,
            other.words().iter().copied(),
            |lhs, rhs| lhs | rhs,
        )
    }

    fn subtract(&mut self, other: &DenseBitSet<T>) -> bool {
        self.apply(
            other.domain_size() as u64,
            other.words().iter().copied(),
            |lhs, rhs| lhs & !rhs,
        )
    }

    fn intersect(&mut self, other: &DenseBitSet<T>) -> bool {
        self.apply(
            other.domain_size() as u64,
            other.words().iter().copied(),
            |lhs, rhs| lhs & rhs,
        )
    }
}

impl<T> BitRelations<Self> for DenseBitSlice<T> {
    fn union(&mut self, other: &Self) -> bool {
        self.apply(
            other.domain_size.get(),
            other.words.iter().map(|word| word.get()),
            |lhs, rhs| lhs | rhs,
        )
    }

    fn subtract(&mut self, other: &Self) -> bool {
        self.apply(
            other.domain_size.get(),
            other.words.iter().map(|word| word.get()),
            |lhs, rhs| lhs & !rhs,
        )
    }

    fn intersect(&mut self, other: &Self) -> bool {
        self.apply(
            other.domain_size.get(),
            other.words.iter().map(|word| word.get()),
            |lhs, rhs| lhs & rhs,
        )
    }
}

impl<T> PartialEq for DenseBitSlice<T> {
    fn eq(&self, other: &Self) -> bool {
        self.domain_size == other.domain_size && self.words == other.words
    }
}

impl<T> Eq for DenseBitSlice<T> {}

impl<T: Id> fmt::Debug for DenseBitSlice<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_set().entries(self.iter()).finish()
    }
}

// zerocopy reserves TryFromBytes for its derive and excludes the hidden validation APIs from
// compatibility guarantees. The manual implementation adds a cross-field predicate to derived field
// validation. Dependency upgrades must recheck this use of the hidden APIs.
//
// SAFETY: TryFromBytes requires every accepted candidate to be a valid value and permits
// conservative rejection. CastUnsized preserves the referent bytes, metadata and alignment, and
// RawDenseBitSlice has exactly the same field types. Its derived validation establishes field
// validity before the word-count and excess-bit checks. Every accepted candidate therefore has both
// valid fields and the complete frame invariant.
unsafe impl<T> zerocopy::TryFromBytes for DenseBitSlice<T> {
    #[expect(
        dead_code,
        reason = "required by the trait; unsatisfiable on a slice DST by design"
    )]
    fn only_derive_is_allowed_to_implement_this_trait()
    where
        Self: Sized,
    {
    }

    fn is_bit_valid<A>(candidate: zerocopy::Maybe<'_, Self, A>) -> bool
    where
        A: zerocopy::invariant::Alignment,
    {
        // `CastUnsized` checks at compile time that both slice DSTs have the same alignment,
        // trailing-slice offset and element size. Casting this candidate preserves its pointer
        // metadata. The resulting `raw` addresses exactly the candidate's bytes.
        let raw = candidate.cast::<_, zerocopy::pointer::cast::CastUnsized, _>();
        if !<RawDenseBitSlice<T> as zerocopy::TryFromBytes>::is_bit_valid(raw) {
            return false;
        }

        // SAFETY: assume_valid requires a bit-valid raw representation. Its derived is_bit_valid
        // predicate just accepted this candidate without changing its bytes or metadata. Therefore
        // the same candidate may now be treated as a valid RawDenseBitSlice.
        let raw = unsafe { raw.assume_valid() }.unaligned_as_ref();

        // generic conversions can supply any word count, including one the header does not describe
        let domain_size = raw.domain_size.get();
        let words = raw.words.len();
        if num_words(domain_size) != words as u64 {
            return false;
        }

        // the mathematical excess after padding the domain to whole words is in [0, 63]. A nonzero
        // excess leaves the shift count in [1, 63].
        let excess = (words as u64) * (WORD_BITS as u64) - domain_size;
        excess == 0 || raw.words[words - 1].get() >> (WORD_BITS as u64 - excess) == 0
    }
}

/// A byte region [`DenseBitSliceArray::try_from_bytes`] refused.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParseDenseBitSliceArrayError {
    /// The region's byte length is not what its domain header and frame count occupy.
    Length {
        /// The length the domain header and the frame count occupy.
        ///
        /// [`None`] when that geometry overflows `u64`, in which case it matches no real region.
        expected: Option<u64>,
        /// The refused region's byte length.
        actual: u64,
    },
    /// The region's domain header claims a domain other than the caller's.
    Header {
        /// The domain the caller expects.
        expected: u64,
        /// The domain the region claims.
        actual: u64,
    },
    /// The frame at `rank` is not a valid bit set frame.
    Frame {
        /// The frame's position in the region.
        rank: u64,
        /// The refusal.
        error: ParseDenseBitSliceError,
    },
    /// The frame at `rank` claims a domain other than the array's.
    Domain {
        /// The frame's position in the region.
        rank: u64,
        /// The domain the array covers.
        expected: u64,
        /// The domain the frame claims.
        actual: u64,
    },
}

impl fmt::Display for ParseDenseBitSliceArrayError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length {
                expected: Some(expected),
                actual,
            } => write!(
                fmt,
                "the region holds {actual} bytes where its frames occupy {expected}"
            ),
            Self::Length {
                expected: None,
                actual,
            } => write!(
                fmt,
                "the region holds {actual} bytes where its frame count matches no real region"
            ),
            Self::Header { expected, actual } => write!(
                fmt,
                "the region covers {actual} rows where the caller expects {expected}"
            ),
            Self::Frame { rank, error } => write!(fmt, "the frame at rank {rank}: {error}"),
            Self::Domain {
                rank,
                expected,
                actual,
            } => write!(
                fmt,
                "the frame at rank {rank} covers {actual} rows where the array covers {expected}"
            ),
        }
    }
}

impl core::error::Error for ParseDenseBitSliceArrayError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Frame { error, .. } => Some(error),
            Self::Length { .. } | Self::Header { .. } | Self::Domain { .. } => None,
        }
    }
}

/// Unvalidated storage for constructing and checking a [`DenseBitSliceArray`].
///
/// The field types and their order must match `DenseBitSliceArray`. Any initialized header and
/// trailing bytes are valid here, including a zeroed allocation whose frame headers have not been
/// written.
#[derive(zerocopy::FromBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
struct RawDenseBitSliceArray<T> {
    /// [`DenseBitSliceArray`]'s region header, not yet coupled to the frame bytes.
    domain_size: U64<LE>,
    /// The row domain every frame indexes.
    marker: PhantomData<T>,
    /// The trailing bytes, not yet validated as frames.
    frames: [u8],
}

/// A contiguous byte array of same-domain [`DenseBitSlice`] frames.
///
/// The byte format is an 8-byte little-endian domain header followed by the frames, each
/// [`DenseBitSlice::total_byte_len`] bytes long. The array header records the domain even when
/// there are no frames. Each frame repeats its domain header, allowing indexing to borrow a
/// self-describing `DenseBitSlice`. [`zerocopy::IntoBytes`] exposes the complete region without
/// encoding or copying.
///
/// Every [`zerocopy::TryFromBytes`] conversion validates that the trailing bytes contain a whole
/// number of valid frames over exactly the array's domain. [`Self::try_from_bytes`] additionally
/// checks the expected domain and count. Indexing borrows an already-validated frame and panics
/// when its index is outside the frame count.
///
/// # Platform behavior
///
/// On 32-bit targets, a header-only array can describe a frame stride larger than `usize::MAX`.
/// Parsing accepts that array, but [`Self::len`] and indexing panic when converting its stride.
///
/// Arrays are equal when they cover one domain and carry the same frames. Canonical frames make
/// that byte equality: equal domains fix the word count, and bits above the domain are zero on
/// both sides.
///
/// # Example
///
/// This in-crate example is ignored because the types are crate-private.
///
/// ```ignore
/// use zerocopy::IntoBytes as _;
///
/// use hashql_core::id::Id as _;
/// use crate::bitset::DenseBitSliceArray;
/// use crate::identity::BasePosition;
///
/// let mut sets = DenseBitSliceArray::<BasePosition>::new_empty(1_000, 2);
/// sets[0].insert(BasePosition::from_u32(3));
/// sets[1].insert(BasePosition::from_u32(64));
///
/// let bytes = sets.as_bytes();
/// let read = DenseBitSliceArray::<BasePosition>::try_from_bytes(bytes, 1_000, 2)?;
/// assert!(read[0].contains(BasePosition::from_u32(3)));
/// assert!(read[1].contains(BasePosition::from_u32(64)));
/// # Ok::<(), crate::bitset::ParseDenseBitSliceArrayError>(())
/// ```
// FromZeros constructors accept any trailing byte count, including incomplete frames. Allocate
// through RawDenseBitSliceArray until every header and the region geometry are valid.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
pub(crate) struct DenseBitSliceArray<T> {
    /// The domain every frame draws from.
    domain_size: U64<LE>,
    /// The row domain every frame indexes.
    marker: PhantomData<T>,
    /// The frames, back to back at one stride.
    frames: [u8],
}

impl<T> DenseBitSliceArray<T> {
    /// Creates `count` sets each admitting no rows of a `domain_size`-row domain.
    ///
    /// Allocates one region with the array header and every frame header initialized.
    ///
    /// # Panics
    ///
    /// Panics if the region size is not representable as an allocation layout or the zeroed
    /// allocation fails.
    #[must_use]
    pub(crate) fn new_empty(domain_size: usize, count: usize) -> Box<Self> {
        let stride = usize::try_from(DenseBitSlice::<T>::total_byte_len(domain_size as u64))
            .expect("a resident frame fits the address space");
        let frames = count
            .checked_mul(stride)
            .expect("a resident region fits the address space");

        let mut raw = RawDenseBitSliceArray::<T>::new_box_zeroed_with_elems(frames)
            .expect("the allocation for the array's frames succeeds");
        raw.domain_size = U64::new(domain_size as u64);
        for rank in 0..count {
            U64::<LE>::new(domain_size as u64)
                .write_to_prefix(&mut raw.frames[rank * stride..])
                .expect("every frame holds at least its 8-byte domain header");
        }

        // SAFETY: Identical repr(C) fields give both types the same allocation layout and
        // trailing-byte metadata. The region header is initialized, and every one of the count
        // whole strides contains a matching header followed by zero words. Transferring the Box's
        // unique ownership through this cast therefore yields a valid array and preserves its
        // deallocation layout.
        unsafe { Box::from_raw(Box::into_raw(raw) as *mut Self) }
    }

    /// Borrows exactly `count` frames over a `domain_size`-row domain from `bytes`.
    ///
    /// Checks the byte length, the array's domain header, then each frame and its domain in rank
    /// order. Borrows the validated bytes at any alignment, without copying.
    ///
    /// # Errors
    ///
    /// Returns [`ParseDenseBitSliceArrayError`] if the region disagrees with the expected geometry
    /// or contains an invalid or differently domained frame.
    pub(crate) fn try_from_bytes(
        bytes: &[u8],
        domain_size: u64,
        count: u64,
    ) -> Result<&Self, ParseDenseBitSliceArrayError> {
        let expected = Self::total_byte_len(domain_size, count);
        if expected != Some(bytes.len() as u64) {
            return Err(ParseDenseBitSliceArrayError::Length {
                expected,
                actual: bytes.len() as u64,
            });
        }

        let (header, frames) = U64::<LE>::read_from_prefix(bytes).unwrap_or_else(|_| {
            unreachable!("the length check keeps the domain header in the region")
        });
        let header = header.get();
        if header != domain_size {
            return Err(ParseDenseBitSliceArrayError::Header {
                expected: domain_size,
                actual: header,
            });
        }

        // The length check makes the frame bytes exactly `count` whole strides.
        Self::validate_frames(domain_size, frames)?;

        // SAFETY: The length, header, and frame checks above are exactly the array invariant.
        Ok(unsafe { Self::from_bytes_unchecked(bytes) })
    }

    /// Checks that `frames` holds whole frames over exactly a `domain_size`-row domain.
    ///
    /// `frames` must be a whole number of strides, established by the calling length check.
    ///
    /// # Errors
    ///
    /// Returns [`ParseDenseBitSliceArrayError`] at the first invalid or differently domained frame,
    /// in rank order.
    fn validate_frames(
        domain_size: u64,
        frames: &[u8],
    ) -> Result<(), ParseDenseBitSliceArrayError> {
        if frames.is_empty() {
            return Ok(());
        }

        // A nonempty whole-stride region contains at least one stride. This region occupies a slice
        // with a `usize` length. Its stride is bounded by that length and fits `usize`.
        let stride = usize::try_from(DenseBitSlice::<T>::total_byte_len(domain_size))
            .expect("the region's length bounds its stride");
        for (rank, frame) in frames.chunks_exact(stride).enumerate() {
            let rank = rank as u64;
            let (set, _rest) = DenseBitSlice::<T>::try_from_prefix(frame)
                .map_err(|error| ParseDenseBitSliceArrayError::Frame { rank, error })?;

            // A frame claiming a smaller domain parses cleanly inside its chunk. Only the
            // agreement check refuses it.
            let domain = set.domain_size();
            if domain != domain_size {
                return Err(ParseDenseBitSliceArrayError::Domain {
                    rank,
                    expected: domain_size,
                    actual: domain,
                });
            }
        }

        Ok(())
    }

    /// Borrows an array from `bytes` without validating them.
    ///
    /// # Safety
    ///
    /// `bytes` must be exactly the array's 8-byte little-endian domain header followed by a whole
    /// number of valid frames over that same domain. Bytes accepted by [`Self::try_from_bytes`]
    /// satisfy this invariant.
    #[must_use]
    pub(crate) const unsafe fn from_bytes_unchecked(bytes: &[u8]) -> &Self {
        // SAFETY: repr(C) places the alignment-one header before the trailing byte slice, whose
        // length is the DST metadata. The caller guarantees an exact valid array, and the shared
        // byte slice supplies initialized memory and its borrow lifetime. The reconstructed pointer
        // therefore covers exactly that array and may be borrowed for the same lifetime.
        unsafe { &*ptr::from_raw_parts(bytes.as_ptr(), bytes.len() - WORD_BYTES) }
    }

    /// Returns the byte length of the array header and `count` frames.
    ///
    /// Returns [`None`] when the geometry overflows `u64`.
    #[must_use]
    pub(crate) const fn total_byte_len(domain_size: u64, count: u64) -> Option<u64> {
        let Some(frames) = count.checked_mul(DenseBitSlice::<T>::total_byte_len(domain_size))
        else {
            return None;
        };

        frames.checked_add(WORD_BYTES as u64)
    }

    /// Returns the domain every frame draws from.
    #[must_use]
    pub(crate) const fn domain_size(&self) -> u64 {
        self.domain_size.get()
    }

    /// Returns the number of frames.
    #[must_use]
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "every door validated whole strides, so the division is exact"
    )]
    pub(crate) fn len(&self) -> usize {
        self.frames.len() / self.stride()
    }

    /// Returns the byte stride of one frame.
    ///
    /// # Panics
    ///
    /// Panics if the frame stride exceeds `usize::MAX`.
    fn stride(&self) -> usize {
        usize::try_from(DenseBitSlice::<T>::total_byte_len(self.domain_size.get()))
            .expect("a resident frame fits the address space")
    }

    /// Returns the byte range of the frame at `rank` inside the frame region.
    ///
    /// # Panics
    ///
    /// Panics if `rank` lies at or beyond the frame count or the frame stride exceeds `usize::MAX`.
    fn frame_range(&self, rank: usize) -> Range<usize> {
        assert!(
            rank < self.len(),
            "the rank names one of the array's frames"
        );
        let stride = self.stride();

        rank * stride..(rank + 1) * stride
    }
}

impl<T> Index<usize> for DenseBitSliceArray<T> {
    type Output = DenseBitSlice<T>;

    fn index(&self, index: usize) -> &DenseBitSlice<T> {
        let frame = &self.frames[self.frame_range(index)];
        // SAFETY: from_frame_unchecked requires exactly one valid frame. The array invariant
        // establishes frame validity, and frame_range selects one complete stride. The subslice
        // therefore satisfies the constructor's contract.
        unsafe { DenseBitSlice::from_frame_unchecked(frame) }
    }
}

impl<T> IndexMut<usize> for DenseBitSliceArray<T> {
    fn index_mut(&mut self, index: usize) -> &mut DenseBitSlice<T> {
        let range = self.frame_range(index);
        let frame = &mut self.frames[range];
        // SAFETY: The array invariant and frame_range establish one complete valid frame, as in
        // index. The subslice is exclusively borrowed, and DenseBitSlice mutation preserves its
        // header, word count and zero excess bits. The mutable view therefore preserves the array
        // invariant.
        unsafe { DenseBitSlice::from_frame_unchecked_mut(frame) }
    }
}

impl<T> PartialEq for DenseBitSliceArray<T> {
    fn eq(&self, other: &Self) -> bool {
        self.domain_size == other.domain_size && self.frames == other.frames
    }
}

impl<T> Eq for DenseBitSliceArray<T> {}

impl<T: Id> fmt::Debug for DenseBitSliceArray<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_list()
            .entries((0..self.len()).map(|rank| &self[rank]))
            .finish()
    }
}

// This manual TryFromBytes implementation has the same hidden-API dependency as the DenseBitSlice
// implementation above.
//
// SAFETY: TryFromBytes requires every accepted candidate to be a valid value and permits
// conservative rejection. CastUnsized preserves the referent bytes, metadata and alignment, and
// RawDenseBitSliceArray has exactly the same field types. Derived field validation precedes the
// whole-stride check and validation of every frame against the array domain. Every
// accepted candidate therefore has both valid fields and the complete array invariant.
unsafe impl<T> zerocopy::TryFromBytes for DenseBitSliceArray<T> {
    #[expect(
        dead_code,
        reason = "required by the trait; unsatisfiable on a slice DST by design"
    )]
    fn only_derive_is_allowed_to_implement_this_trait()
    where
        Self: Sized,
    {
    }

    fn is_bit_valid<A>(candidate: zerocopy::Maybe<'_, Self, A>) -> bool
    where
        A: zerocopy::invariant::Alignment,
    {
        // `CastUnsized` checks at compile time that both slice DSTs have the same alignment,
        // trailing-slice offset and element size. Casting this candidate preserves its pointer
        // metadata. The resulting `raw` addresses exactly the candidate's bytes.
        let raw = candidate.cast::<_, zerocopy::pointer::cast::CastUnsized, _>();
        if !<RawDenseBitSliceArray<T> as zerocopy::TryFromBytes>::is_bit_valid(raw) {
            return false;
        }

        // SAFETY: assume_valid requires a bit-valid raw representation. Its derived is_bit_valid
        // predicate just accepted this candidate without changing its bytes or metadata. Therefore
        // the same candidate may now be treated as a valid RawDenseBitSliceArray.
        let raw = unsafe { raw.assume_valid() }.unaligned_as_ref();

        // generic conversions can supply any byte count, including an incomplete final frame
        let domain_size = raw.domain_size.get();
        let stride = DenseBitSlice::<T>::total_byte_len(domain_size);
        if !(raw.frames.len() as u64).is_multiple_of(stride) {
            return false;
        }

        Self::validate_frames(domain_size, &raw.frames).is_ok()
    }
}
