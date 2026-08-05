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
    // Every caller bounds `row` by a domain whose words are in memory, so the word index fits
    // `usize`.
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

/// [`DenseBitSlice`]'s fields with no frame invariant coupling them.
///
/// Every zerocopy claim is true here: any header beside any whole words is a value of this type.
/// That freedom is the twin's purpose. [`DenseBitSlice`]'s hand-written [`zerocopy::TryFromBytes`]
/// delegates field validity to the derive on these fields. [`DenseBitSlice::new_empty`] builds
/// its zeroed allocation here, where a zeroed header beside a nonzero word count breaks nothing.
///
/// The fields mirror [`DenseBitSlice`]'s exactly. The layout half of that claim is asserted at
/// compile time by the cast in `is_bit_valid`. The bit-validity half rests on the field types
/// being identical. A field type change in either twin therefore re-derives that proof.
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
    marker: PhantomData<T>,
    /// [`DenseBitSlice`]'s words, not yet policed for excess bits.
    words: [U64<LE>],
}

/// A dense membership set over one row domain, stored as transportable bytes.
///
/// The set spends one bit per domain row. Memory is proportional to the domain rather than to
/// what the set admits, which is the right price where membership is dense or the domain is
/// small. The type parameter names the domain, so a set of node rows and a set of link rows have
/// different types and the compiler rejects either one where the other belongs.
///
/// The set is its own byte format. A frame is the domain size as an 8-byte little-endian count,
/// then the member bits packed 64 to a little-endian word in ascending row order, with every bit
/// above the domain zero. [`DenseBitSlice::try_from_prefix`] reads a frame in place off the front
/// of a buffer, without copying and at any byte offset, refuses one whose header, word count, or
/// excess bits break that layout, and returns the bytes after the frame. [`zerocopy::IntoBytes`]
/// carries the write side, so `as_bytes` on a live set is the frame.
///
/// The frame invariant is the type's bit validity, so every [`zerocopy::TryFromBytes`] door
/// validates it inside the cast and no door mints a set whose header and words disagree. A
/// plain prefix read is greedy - it hands validation the largest word count that fits rather
/// than the one the header claims. Reading a frame from a longer buffer therefore takes the
/// `_with_elems` door with the header's own count, which is the split
/// [`DenseBitSlice::try_from_prefix`] performs itself.
///
/// The set is unsized. Create one in place behind a box with [`DenseBitSlice::new_empty`], or
/// borrow one from existing bytes with [`DenseBitSlice::try_from_prefix`] and
/// [`DenseBitSlice::try_from_prefix_mut`]. The domain is fixed at creation, and mutation never
/// moves the storage.
///
/// Sets are equal when they draw from the same domain and admit the same rows.
///
/// # Examples
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
/// ```
#[derive(zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
pub(crate) struct DenseBitSlice<T> {
    /// The number of admissible rows, `0..domain_size`.
    domain_size: U64<LE>,
    marker: PhantomData<T>,
    /// The member bits, one word per 64 domain rows.
    ///
    /// Bits at positions at or beyond `domain_size` in the final word are zero. [`Self::insert`]
    /// refuses the
    /// rows that would set one, and bit validity refuses the frames that carry one.
    words: [U64<LE>],
}

impl<T> DenseBitSlice<T> {
    /// Creates a set admitting no rows of a `domain_size`-row domain.
    #[must_use]
    pub(crate) fn new_empty(domain_size: usize) -> Box<Self> {
        // A domain held in memory occupies at most `isize::MAX` bytes, so its word count fits
        // `usize`.
        #[expect(clippy::cast_possible_truncation)]
        let words = num_words(domain_size as u64) as usize;
        let mut raw = RawDenseBitSlice::<T>::new_box_zeroed_with_elems(words)
            .expect("the allocation for the set's words succeeds");
        raw.domain_size = U64::new(domain_size as u64);

        // SAFETY: Both types are `#[repr(C)]` structs with the same fields in the same order, so
        // for every word count they share size, alignment, and slice-length metadata: the cast
        // preserves the allocation's layout for the deallocation as well as for the view. The
        // value also satisfies the frame invariant at the cast: the header was just written, the
        // allocation carries exactly `num_words(domain_size)` words, and every word is zero, so
        // no bit above the domain is set.
        unsafe { Box::from_raw(Box::into_raw(raw) as *mut Self) }
    }

    /// Reads one frame off the front of `bytes`, returning the set and the remaining bytes.
    ///
    /// The header's own word count frames the cast, and the frame invariant is checked inside it
    /// as the type's bit validity. This door adds nothing to that validation - it splits the
    /// buffer where the header says the frame ends, and it names which clause a refused frame
    /// broke, which the [`zerocopy::TryFromBytes`] doors do not.
    ///
    /// # Errors
    ///
    /// - [`ParseDenseBitSliceError::Header`]: the bytes end before the 8-byte domain header.
    /// - [`ParseDenseBitSliceError::WordCount`]: the buffer carries fewer whole words than the
    ///   header's domain occupies.
    /// - [`ParseDenseBitSliceError::ExcessBits`]: a bit above the domain is set in the final word.
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

        Self::try_ref_from_prefix_with_elems(bytes, words).map_err(|error| match error {
            ConvertError::Alignment(_) => unreachable!("the set reads at any alignment"),
            ConvertError::Size(_) => ParseDenseBitSliceError::WordCount {
                domain_size,
                words: trailing.len() / WORD_BYTES,
            },
            // The cast's word count comes from the header, so the count clause of the frame
            // invariant is true by construction and only excess bits can refuse validity.
            ConvertError::Validity(_) => ParseDenseBitSliceError::ExcessBits,
        })
    }

    /// Reads one frame off the front of `bytes` mutably, returning the set and the remaining
    /// bytes.
    ///
    /// # Errors
    ///
    /// - [`ParseDenseBitSliceError::Header`]: the bytes end before the 8-byte domain header.
    /// - [`ParseDenseBitSliceError::WordCount`]: the buffer carries fewer whole words than the
    ///   header's domain occupies.
    /// - [`ParseDenseBitSliceError::ExcessBits`]: a bit above the domain is set in the final word.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the error reports the whole words the buffer carries, which is the floored byte \
                  quotient"
    )]
    pub(crate) fn try_from_prefix_mut(
        bytes: &mut [u8],
    ) -> Result<(&mut Self, &mut [u8]), ParseDenseBitSliceError> {
        let frame_bytes = bytes.len();
        let (domain_size, trailing) = U64::<LE>::read_from_prefix(&*bytes)
            .map_err(|_error| ParseDenseBitSliceError::Header { bytes: frame_bytes })?;
        let domain_size = domain_size.get();

        // A word count above the address space matches no buffer the address space holds.
        let trailing_len = trailing.len();
        let words = usize::try_from(num_words(domain_size)).map_err(|_error| {
            ParseDenseBitSliceError::WordCount {
                domain_size,
                words: trailing_len / WORD_BYTES,
            }
        })?;

        Self::try_mut_from_prefix_with_elems(bytes, words).map_err(|error| match error {
            ConvertError::Alignment(_) => unreachable!("the set reads at any alignment"),
            ConvertError::Size(_) => ParseDenseBitSliceError::WordCount {
                domain_size,
                words: trailing_len / WORD_BYTES,
            },
            // The cast's word count comes from the header, so the count clause of the frame
            // invariant is true by construction and only excess bits can refuse validity.
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
        // SAFETY: The type is a `repr(C)` DST of one 8-byte header and `words` trailing words at
        // alignment 1. The frame's data pointer with the trailing word count as its metadata
        // therefore denotes exactly `bytes`, and every byte of `bytes` is initialized. The frame
        // invariant the caller guarantees is the type's bit validity.
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
        // SAFETY: As in `from_frame_unchecked`, and the borrow is exclusive because `bytes` is.
        unsafe { &mut *ptr::from_raw_parts_mut(bytes.as_mut_ptr(), words) }
    }

    /// Returns the length in bytes of the whole set over a `domain_size`-row domain: the 8-byte
    /// header plus one word per 64 rows.
    ///
    /// This is what a file format reserves for the set, so a header's offset chain derives region
    /// geometry from the domain alone. The arithmetic cannot overflow: the largest domain's word
    /// count is far below `u64::MAX / 8`.
    #[must_use]
    pub(crate) const fn total_byte_len(domain_size: u64) -> u64 {
        (num_words(domain_size) + 1) * WORD_BYTES as u64
    }

    /// Returns the number of rows the domain admits.
    #[must_use]
    pub(crate) const fn domain_size(&self) -> u64 {
        self.domain_size.get()
    }

    /// Returns the number of rows the set admits.
    #[must_use]
    pub(crate) fn count(&self) -> u64 {
        self.words
            .iter()
            .map(|word| u64::from(word.get().count_ones()))
            .sum()
    }

    /// Returns whether the set admits no rows.
    #[must_use]
    pub(crate) fn is_empty(&self) -> bool {
        self.words.iter().all(|word| word.get() == 0)
    }

    /// Removes every row from the set.
    pub(crate) fn clear(&mut self) {
        self.words.fill(U64::new(0));
    }

    /// Sets `self = op(self, rhs)` word by word, reporting whether any word changed.
    ///
    /// `domain` is the right-hand set's domain, asserted equal so the zip covers every word.
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

            // Accumulating the difference keeps the loop branch-free, so it vectorizes.
            changed |= old ^ new;
        }

        changed != 0
    }
}

impl<T: Id> DenseBitSlice<T> {
    /// Returns whether the set admits `row`.
    ///
    /// A row outside the domain is not admitted.
    #[must_use]
    pub(crate) fn contains(&self, row: T) -> bool {
        let row = row.as_u64();
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
    pub(crate) fn count_below(&self, row: T) -> u64 {
        let row = row.as_u64().min(self.domain_size.get());
        // The clamp bounds the split index by the word count, so both slices are in bounds.
        #[expect(clippy::cast_possible_truncation)]
        let index = (row / WORD_BITS as u64) as usize;
        let full: u64 = self.words[..index]
            .iter()
            .map(|word| u64::from(word.get().count_ones()))
            .sum();

        let bit = row % WORD_BITS as u64;
        if bit == 0 {
            // The row sits on a word boundary, where its word may lie past the final one.
            return full;
        }

        full + u64::from((self.words[index].get() & ((1 << bit) - 1)).count_ones())
    }

    /// Inserts `row`, returning whether the set changed.
    ///
    /// # Panics
    ///
    /// This panics when `row` lies outside the domain.
    pub(crate) fn insert(&mut self, row: T) -> bool {
        assert!(
            row.as_u64() < self.domain_size.get(),
            "the row lies in the set's domain"
        );
        let (index, mask) = word_index_and_mask(row.as_u64());
        let stored = self.words[index].get();
        self.words[index] = U64::new(stored | mask);
        stored & mask == 0
    }

    /// Removes `row`, returning whether the set changed.
    ///
    /// A row outside the domain was never admitted, so removing one reports no change.
    pub(crate) fn remove(&mut self, row: T) -> bool {
        let row = row.as_u64();
        if row >= self.domain_size.get() {
            return false;
        }
        let (index, mask) = word_index_and_mask(row);
        let stored = self.words[index].get();
        self.words[index] = U64::new(stored & !mask);
        stored & mask != 0
    }

    /// Iterates the rows the set admits, in ascending order.
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

/// Word-wise set relations against an in-memory set over the same domain.
///
/// Every operation panics when the two sets draw from different domains. Both sides keep their
/// bits above the domain zero, so the word loops preserve the frame's final-word invariant.
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

/// Word-wise set relations against another set of the same shape over the same domain.
///
/// Every operation panics when the two sets draw from different domains. Both sides keep their
/// bits above the domain zero, so the word loops preserve the frame's final-word invariant.
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

/// Bit validity is the frame invariant: a memory range is a set only when its word count is what
/// its header's domain occupies and no bit above the domain is set in the final word.
///
/// Zerocopy reserves this trait for its derive. The derived check is field validity alone and
/// cannot carry a cross-field predicate (google/zerocopy#1330 tracks that feature and its arrival
/// retires this impl). The impl therefore delegates the field-validity half to the derive where
/// it lives - on the invariant-free twin [`RawDenseBitSlice`] - and adds the frame predicate on
/// top. The delegation rides `#[doc(hidden)]` machinery the crate exempts from semver. Any
/// zerocopy upgrade therefore re-reviews this impl.
///
/// SAFETY: `is_bit_valid` returns true only when the twin's derived `is_bit_valid` accepts the
/// bytes and the frame predicate holds on them. A valid `RawDenseBitSlice` is a valid
/// `DenseBitSlice` because the twins' field types are identical. The layout half of that claim is
/// compile-time-asserted by the cast in the body. Refusing valid-but-incoherent frames on top is
/// sound, because `is_bit_valid` may always be conservative.
unsafe impl<T> zerocopy::TryFromBytes for DenseBitSlice<T> {
    fn only_derive_is_allowed_to_implement_this_trait()
    where
        Self: Sized,
    {
    }

    fn is_bit_valid<A>(candidate: zerocopy::Maybe<'_, Self, A>) -> bool
    where
        A: zerocopy::invariant::Alignment,
    {
        // `CastUnsized` asserts at compile time that both types are slice DSTs with one
        // alignment, one trailing-slice offset, and one element size, and it preserves the
        // pointer metadata, so `raw` addresses exactly the candidate's bytes.
        let raw = candidate.cast::<_, zerocopy::pointer::cast::CastUnsized, _>();
        if !<RawDenseBitSlice<T> as zerocopy::TryFromBytes>::is_bit_valid(raw) {
            return false;
        }

        // SAFETY: The twin's derived `is_bit_valid` accepted exactly these bytes.
        let raw = unsafe { raw.assume_valid() }.unaligned_as_ref();

        // The generic doors hand this any word count that fits their bytes, so the count is
        // checked before the excess arithmetic that assumes it.
        let domain_size = raw.domain_size.get();
        let words = raw.words.len();
        if num_words(domain_size) != words as u64 {
            return false;
        }

        // The count matches the domain, so 0 ≤ excess < 64 and a nonzero excess leaves the
        // shift below in `1..=63`.
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

/// [`DenseBitSliceArray`]'s fields with no region invariant coupling them.
///
/// Every zerocopy claim is true here: any header beside any frame bytes is a value of this type.
/// That freedom is the twin's purpose. [`DenseBitSliceArray`]'s hand-written
/// [`zerocopy::TryFromBytes`] delegates field validity to the derive on these fields.
/// [`DenseBitSliceArray::new_empty`] builds its zeroed allocation here - a zeroed header beside
/// any byte count breaks nothing - and casts once the region invariant is in place.
///
/// The fields mirror [`DenseBitSliceArray`]'s exactly. The layout half of that claim is asserted
/// at compile time by the cast in `is_bit_valid`. The bit-validity half rests on the field types
/// being identical. A field type change in either twin therefore re-derives that proof.
#[derive(zerocopy::FromBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
struct RawDenseBitSliceArray<T> {
    /// [`DenseBitSliceArray`]'s region header, not yet coupled to the frame bytes.
    domain_size: U64<LE>,
    marker: PhantomData<T>,
    /// [`DenseBitSliceArray`]'s frames, not yet policed for shape.
    frames: [u8],
}

/// An array of same-domain [`DenseBitSlice`] frames behind one domain header, in one contiguous
/// byte region.
///
/// A file's dense region is `count` membership sets over one shared domain. This type is that
/// region in memory, and it has the frame's own shape one level up: an 8-byte domain header, then
/// the frames back to back at the shared stride of [`DenseBitSlice::total_byte_len`] bytes.
/// [`DenseBitSliceArray::new_empty`] makes one allocation and writes every header, indexing
/// borrows one frame as a real [`DenseBitSlice`], and the [`zerocopy::IntoBytes`] bytes are the
/// region exactly as a file stores it, so a file write emits the array's bytes verbatim.
///
/// The array's own header keeps every accessor total - an array of no frames still states its
/// domain, so the geometry never depends on a first frame existing. Every frame restates that
/// domain in its own header. The repetition keeps each element a self-describing frame, so
/// indexing returns a borrow of the element type itself.
///
/// The invariant - the domain header, then a whole number of valid frames over exactly that
/// domain - is the type's bit validity, so every [`zerocopy::TryFromBytes`] door validates it
/// inside the cast and no door can mint an incoherent region. The array's own doors add to that:
/// [`DenseBitSliceArray::new_empty`] builds the invariant,
/// [`DenseBitSliceArray::try_from_bytes`] checks the region against the caller's expected domain
/// and count and names which clause a refused region broke, and the unsafe
/// [`DenseBitSliceArray::from_bytes_unchecked`] re-borrows bytes a previous validation accepted.
/// Indexing trusts the doors and revalidates nothing.
///
/// Arrays are equal when they cover one domain and carry the same frames. Canonical frames make
/// that byte equality: equal domains fix the word count, and bits above the domain are zero on
/// both sides.
///
/// # Examples
///
/// ```ignore
/// use zerocopy::IntoBytes as _;
///
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
/// ```
// No `FromZeros`: its zeroed constructors take any frame byte count. They would therefore mint
// regions whose frame bytes are not a whole number of frames in safe code, bypassing the doors
// whose validation indexing trusts. `RawDenseBitSliceArray` carries the zeroed allocation
// instead.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::Unaligned)]
#[repr(C)]
pub(crate) struct DenseBitSliceArray<T> {
    /// The domain every frame draws from.
    domain_size: U64<LE>,
    marker: PhantomData<T>,
    /// The frames, back to back at one stride.
    frames: [u8],
}

impl<T> DenseBitSliceArray<T> {
    /// Creates `count` sets each admitting no rows of a `domain_size`-row domain.
    ///
    /// One zeroed allocation of the region, with the domain header and each frame's restatement
    /// of it written in place: the dense region of a file whose sets hold nothing yet.
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

        // SAFETY: Both types are `#[repr(C)]` structs with the same fields in the same order. For
        // every frame byte count they therefore share size, alignment, and slice-length metadata -
        // the cast preserves the allocation's layout for the deallocation as well as for the view.
        // The value also satisfies the array invariant at the cast. The region header was written
        // above. The frame bytes are exactly `count` whole strides. Each stride is the valid empty
        // frame - its own copy of the domain header, then zero words.
        unsafe { Box::from_raw(Box::into_raw(raw) as *mut Self) }
    }

    /// Borrows exactly `count` frames over a `domain_size`-row domain from `bytes`.
    ///
    /// This is the validating door. It checks the byte length against the geometry, then the
    /// region's domain header against the caller's, then every frame against that domain. An
    /// array borrowed from a file region therefore upholds the type's invariant with no state
    /// beside the bytes.
    ///
    /// # Errors
    ///
    /// - [`ParseDenseBitSliceArrayError::Length`]: the region's byte length is not the header plus
    ///   `count` strides.
    /// - [`ParseDenseBitSliceArrayError::Header`]: the region's domain header claims a domain other
    ///   than `domain_size`.
    /// - [`ParseDenseBitSliceArrayError::Frame`]: a frame breaks the frame layout, and the wrapped
    ///   [`ParseDenseBitSliceError`] names the broken clause.
    /// - [`ParseDenseBitSliceArrayError::Domain`]: a frame claims a domain other than
    ///   `domain_size`.
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
    /// The caller has already checked that `frames` is a whole number of strides, which is what
    /// bounds the stride by the region length below.
    fn validate_frames(
        domain_size: u64,
        frames: &[u8],
    ) -> Result<(), ParseDenseBitSliceArrayError> {
        if frames.is_empty() {
            return Ok(());
        }

        // A nonempty whole-stride region is at least one stride long, so the stride fits the
        // length the region already occupies in memory.
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
    /// `bytes` must uphold the array invariant: the 8-byte domain header, then a whole number of
    /// valid frames over exactly that domain. Bytes a previous
    /// [`DenseBitSliceArray::try_from_bytes`] or [`zerocopy::TryFromBytes`] door accepted uphold
    /// it.
    #[must_use]
    pub(crate) const unsafe fn from_bytes_unchecked(bytes: &[u8]) -> &Self {
        // SAFETY: The type is a `repr(C)` DST of one 8-byte header and a trailing byte slice at
        // alignment 1. The region's data pointer with the trailing byte count as its metadata
        // therefore denotes exactly `bytes`, and every byte of `bytes` is initialized.
        unsafe { &*ptr::from_raw_parts(bytes.as_ptr(), bytes.len() - WORD_BYTES) }
    }

    /// Returns the length in bytes of a whole array: the 8-byte domain header plus `count`
    /// frames over the domain.
    ///
    /// This is what a file format reserves for the region. Returns `None` when the geometry
    /// overflows `u64`, in which case no real region matches it.
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

    /// Returns whether the array holds no frames.
    #[must_use]
    pub(crate) const fn is_empty(&self) -> bool {
        self.frames.is_empty()
    }

    /// Returns the byte stride of one frame.
    fn stride(&self) -> usize {
        usize::try_from(DenseBitSlice::<T>::total_byte_len(self.domain_size.get()))
            .expect("a resident frame fits the address space")
    }

    /// Returns the byte range of the frame at `rank` inside the frame region.
    ///
    /// # Panics
    ///
    /// This panics when `rank` lies at or beyond the frame count.
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

    /// Views the frame at rank `index`.
    ///
    /// # Panics
    ///
    /// This panics when `index` lies at or beyond the frame count.
    fn index(&self, index: usize) -> &DenseBitSlice<T> {
        let frame = &self.frames[self.frame_range(index)];
        // SAFETY: Every door of the array validated its frames, and `frame_range` carves exactly
        // one whole frame out of the frame region.
        unsafe { DenseBitSlice::from_frame_unchecked(frame) }
    }
}

impl<T> IndexMut<usize> for DenseBitSliceArray<T> {
    /// Views the frame at rank `index` mutably.
    ///
    /// # Panics
    ///
    /// This panics when `index` lies at or beyond the frame count.
    fn index_mut(&mut self, index: usize) -> &mut DenseBitSlice<T> {
        let range = self.frame_range(index);
        let frame = &mut self.frames[range];
        // SAFETY: As in `index`. Mutation through a `DenseBitSlice` preserves the frame
        // invariant, so the exclusive borrow keeps the array invariant too.
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

/// Bit validity is the region invariant: a memory range is an array only when its frame bytes
/// are a whole number of valid frames over exactly the domain its own header claims.
///
/// Zerocopy reserves this trait for its derive. The derived check is field validity alone and
/// cannot carry a cross-field predicate (google/zerocopy#1330 tracks that feature and its arrival
/// retires this impl). The impl therefore delegates the field-validity half to the derive where
/// it lives - on the invariant-free twin [`RawDenseBitSliceArray`] - and adds the region
/// predicate on top. The delegation rides `#[doc(hidden)]` machinery the crate exempts from
/// semver. Any zerocopy upgrade therefore re-reviews this impl.
///
/// SAFETY: `is_bit_valid` returns true only when the twin's derived `is_bit_valid` accepts the
/// bytes and the region predicate holds on them. A valid `RawDenseBitSliceArray` is a valid
/// `DenseBitSliceArray` because the twins' field types are identical. The layout half of that
/// claim is compile-time-asserted by the cast in the body. Refusing valid-but-incoherent regions
/// on top is sound, because `is_bit_valid` may always be conservative.
unsafe impl<T> zerocopy::TryFromBytes for DenseBitSliceArray<T> {
    fn only_derive_is_allowed_to_implement_this_trait()
    where
        Self: Sized,
    {
    }

    fn is_bit_valid<A>(candidate: zerocopy::Maybe<'_, Self, A>) -> bool
    where
        A: zerocopy::invariant::Alignment,
    {
        // `CastUnsized` asserts at compile time that both types are slice DSTs with one
        // alignment, one trailing-slice offset, and one element size, and it preserves the
        // pointer metadata, so `raw` addresses exactly the candidate's bytes.
        let raw = candidate.cast::<_, zerocopy::pointer::cast::CastUnsized, _>();
        if !<RawDenseBitSliceArray<T> as zerocopy::TryFromBytes>::is_bit_valid(raw) {
            return false;
        }

        // SAFETY: The twin's derived `is_bit_valid` accepted exactly these bytes.
        let raw = unsafe { raw.assume_valid() }.unaligned_as_ref();

        // The generic doors hand this any byte count, so whole strides are checked before the
        // frame walk that assumes them.
        let domain_size = raw.domain_size.get();
        let stride = DenseBitSlice::<T>::total_byte_len(domain_size);
        if !(raw.frames.len() as u64).is_multiple_of(stride) {
            return false;
        }

        Self::validate_frames(domain_size, &raw.frames).is_ok()
    }
}
