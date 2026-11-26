use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    cell::{Cell, OnceCell, UnsafeCell},
    fmt,
    marker::PhantomData,
    mem::MaybeUninit,
};

use crate::{
    heap::PhaseAllocator,
    id::{Id, IdArray, bit_vec::FiniteBitSet},
    sync::lock::LocalLock,
};

hashql_macros::define_id! {
    #[id(crate = crate, const)]
    struct Slot(u8 is 0..=63)
}

const CHUNK_SHIFT: u32 = 6;
const CHUNK_LEN: usize = 1 << CHUNK_SHIFT;
const CHUNK_MASK: usize = CHUNK_LEN - 1;
const INLINE_CHUNKS: usize = 8;

const _: () = assert!((Slot::MAX.get() as usize) + 1 == CHUNK_LEN);

/// Fixed-size arena chunk storing up to 64 values at stable addresses.
///
/// A slot holds an initialized value when its bit is set in `occupation`. Once initialized, a
/// slot stays immutable for the lifetime of the chunk.
// This is akin to a `OnceCellArray`, where the occupation is used to track things out of line
// (SoA).
struct LocalChunk<V> {
    occupation: Cell<FiniteBitSet<Slot, u64>>,
    // Invariant: data is never written to twice.
    data: IdArray<Slot, UnsafeCell<MaybeUninit<V>>, CHUNK_LEN>,
}

impl<V> LocalChunk<V> {
    const ASSERT_V_IS_NOT_DROP: () = assert!(
        !core::mem::needs_drop::<V>(),
        "IdLocalChunkVec cannot store types that implement Drop"
    );

    #[expect(
        unsafe_code,
        reason = "initializes an uninitialized arena-allocated chunk in place"
    )]
    #[cold]
    #[inline(never)]
    fn try_alloc_in<'alloc, A>(alloc: A) -> Result<&'alloc Self, AllocError>
    where
        A: PhaseAllocator<'alloc>,
    {
        const { Self::ASSERT_V_IS_NOT_DROP };

        let uninit = alloc.try_alloc_slice_uninit::<Self>(1)?;
        let ptr = uninit[0].as_mut_ptr();

        // SAFETY: `PhaseAllocator::try_alloc_slice_uninit` returns memory that stays pinned and
        // unaliased for all of `'alloc`. `data` holds `UnsafeCell<MaybeUninit<V>>`, which needs
        // no initialization. Writing `occupation` initializes the whole `LocalChunk<V>`, and
        // `V` needs no destructor (checked above).
        unsafe {
            #[expect(clippy::cast_possible_truncation, reason = "CHUNK_LEN is 64")]
            (&raw mut (*ptr).occupation)
                .write(Cell::new(FiniteBitSet::new_empty(CHUNK_LEN as u32)));
            Ok(&*ptr)
        }
    }

    #[inline]
    const fn is_present(&self, slot: Slot) -> bool {
        self.occupation.get().contains(slot)
    }

    /// Reads the value in a slot that is known to be occupied.
    ///
    /// # Safety
    ///
    /// `self.is_present(slot)` must be `true`.
    #[expect(unsafe_code, reason = "reads a slot known to be initialized")]
    #[inline]
    const unsafe fn get_unchecked(&self, slot: Slot) -> &V {
        debug_assert!(self.is_present(slot));

        // SAFETY: `Slot` is bounded to `0..=63` (`CHUNK_LEN`), and the caller guarantees
        // `data[slot]` is initialized and immutable for the lifetime of `&self`.
        unsafe { (&*self.data.get_unchecked(slot).get()).assume_init_ref() }
    }

    #[expect(
        unsafe_code,
        reason = "reads an initialized slot guarded by occupation"
    )]
    #[inline]
    const fn get(&self, slot: Slot) -> Option<&V> {
        if !self.is_present(slot) {
            return None;
        }

        // SAFETY: `self.is_present(slot)` holds, which guarantees `data[slot]` is initialized
        // and stays immutable for the lifetime of `&self`.
        Some(unsafe { self.get_unchecked(slot) })
    }

    #[expect(
        unsafe_code,
        reason = "writes an uninitialized slot guarded by occupation"
    )]
    #[inline]
    const fn write_once(&self, slot: Slot, value: V) -> &V {
        let mut occupation = self.occupation.get();
        assert!(
            !occupation.contains(slot),
            "lookup should not have duplicate items associated with an id"
        );

        // SAFETY: `Slot` is bounded to `0..=63` (`CHUNK_LEN`). `!occupation.contains(slot)`
        // guarantees `data[slot]` is uninitialized and no reference to it exists. `LocalChunk<V>`
        // is `!Sync`, and no user code runs during this write. Once the bit is set, the slot
        // stays immutable for the lifetime of `&self`.
        unsafe {
            let cell = self.data.get_unchecked(slot).get();
            (*cell).write(value);
            occupation.insert(slot);
            self.occupation.set(occupation);
            (*cell).assume_init_ref()
        }
    }
}

/// Thread-local, append-only storage mapping dense [`Id`]s to stable `'alloc` references.
///
/// Entries live in fixed-size 64-slot chunks allocated from a [`PhaseAllocator`]. Once inserted,
/// an entry stays at the same address for `'alloc` even as more chunks are added. The first 512
/// IDs resolve through inline chunk pointers without allocating an overflow directory.
///
/// Types that implement [`Drop`] cannot be stored because the backing phase arena releases memory
/// without running destructors.
///
/// # Example
///
/// ```
/// use hashql_core::{
///     heap::Scratch,
///     id::{IdLocalChunkVec, newtype},
/// };
///
/// newtype!(struct EntryId(u32 is 0..=1024));
///
/// let scratch = Scratch::new();
/// let vec = IdLocalChunkVec::<EntryId, u64, _>::new_in(&scratch);
///
/// let first = vec.insert(EntryId::new(0), 10);
/// let distant = vec.insert(EntryId::new(700), 20);
///
/// assert_eq!(vec.get(EntryId::new(0)), Some(first));
/// assert_eq!(vec.get(EntryId::new(1)), None);
/// assert_eq!(*distant, 20);
/// ```
pub struct IdLocalChunkVec<'alloc, I, V, A: Allocator> {
    alloc: A,
    inline: [OnceCell<&'alloc LocalChunk<V>>; INLINE_CHUNKS],
    overflow: LocalLock<Vec<Option<&'alloc LocalChunk<V>>, A>>,
    _marker: PhantomData<fn() -> I>,
}

impl<'alloc, I, V, A> IdLocalChunkVec<'alloc, I, V, A>
where
    A: PhaseAllocator<'alloc>,
{
    /// Creates an empty chunk vector backed by `alloc`.
    ///
    /// No chunk memory is allocated until the first insertion.
    #[inline]
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        const { LocalChunk::<V>::ASSERT_V_IS_NOT_DROP };

        Self {
            alloc,
            inline: [const { OnceCell::new() }; INLINE_CHUNKS],
            overflow: LocalLock::new(Vec::new_in(alloc)),
            _marker: PhantomData,
        }
    }

    /// Creates an empty chunk vector backed by `alloc` with overflow directory capacity for at
    /// least `capacity` entries.
    ///
    /// Inline chunks and individual overflow chunks still allocate on first write.
    #[inline]
    #[must_use]
    pub fn with_capacity_in(capacity: usize, alloc: A) -> Self {
        const { LocalChunk::<V>::ASSERT_V_IS_NOT_DROP };

        let overflow_chunks = capacity.div_ceil(CHUNK_LEN).saturating_sub(INLINE_CHUNKS);

        Self {
            alloc,
            inline: [const { OnceCell::new() }; INLINE_CHUNKS],
            overflow: LocalLock::new(Vec::with_capacity_in(overflow_chunks, alloc)),
            _marker: PhantomData,
        }
    }
}

impl<'alloc, I, V, A: Allocator> IdLocalChunkVec<'alloc, I, V, A>
where
    I: Id,
{
    #[inline]
    const fn split_id(id: I) -> (usize, Slot)
    where
        I: [const] Id,
    {
        let raw_id = id.as_usize();
        let chunk_index = raw_id >> CHUNK_SHIFT;

        #[expect(clippy::cast_possible_truncation, reason = "masked to 0..=63")]
        let slot = Slot::new((raw_id & CHUNK_MASK) as u8);

        (chunk_index, slot)
    }

    #[cold]
    #[inline(never)]
    fn get_overflow_chunk(&self, chunk_index: usize) -> Option<&'alloc LocalChunk<V>> {
        let overflow_index = chunk_index - INLINE_CHUNKS;
        self.overflow
            .map(|overflow| overflow.get(overflow_index).copied().flatten())
    }

    /// Returns the stored reference for `id`, or `None` if no value has been inserted for `id`.
    #[expect(unsafe_code, reason = "checked index into inline chunk array")]
    #[inline]
    #[must_use]
    pub fn get(&self, id: I) -> Option<&'alloc V> {
        let (chunk_index, slot) = Self::split_id(id);

        let chunk = if chunk_index < INLINE_CHUNKS {
            // SAFETY: `chunk_index < INLINE_CHUNKS` is checked above.
            unsafe { self.inline.get_unchecked(chunk_index).get().copied() }?
        } else {
            self.get_overflow_chunk(chunk_index)?
        };

        chunk.get(slot)
    }

    /// Returns `true` if a value has been inserted for `id`.
    #[expect(unsafe_code, reason = "checked index into inline chunk array")]
    #[inline]
    #[must_use]
    pub fn contains(&self, id: I) -> bool {
        let (chunk_index, slot) = Self::split_id(id);

        let Some(chunk) = (if chunk_index < INLINE_CHUNKS {
            // SAFETY: `chunk_index < INLINE_CHUNKS` is checked above.
            unsafe { self.inline.get_unchecked(chunk_index).get().copied() }
        } else {
            self.get_overflow_chunk(chunk_index)
        }) else {
            return false;
        };

        chunk.is_present(slot)
    }

    /// Returns the stored reference for an ID known to be present.
    ///
    /// # Safety
    ///
    /// A value must have been inserted for `id` via [`Self::insert`] or [`Self::try_insert`].
    #[expect(unsafe_code, reason = "reads an entry known to have been inserted")]
    #[inline]
    #[must_use]
    pub unsafe fn get_unchecked(&self, id: I) -> &'alloc V {
        let (chunk_index, slot) = Self::split_id(id);

        let chunk = if chunk_index < INLINE_CHUNKS {
            // SAFETY: Caller guarantees `id` was inserted, which allocated its inline chunk.
            unsafe {
                *self
                    .inline
                    .get_unchecked(chunk_index)
                    .get()
                    .unwrap_unchecked()
            }
        } else {
            // SAFETY: Caller guarantees `id` was inserted, which allocated its overflow chunk.
            unsafe { self.get_overflow_chunk(chunk_index).unwrap_unchecked() }
        };

        // SAFETY: Caller guarantees `id` was inserted, which marked `slot` occupied.
        unsafe { chunk.get_unchecked(slot) }
    }
}

impl<'alloc, I, V, A> IdLocalChunkVec<'alloc, I, V, A>
where
    I: Id,
    A: PhaseAllocator<'alloc>,
{
    #[cold]
    #[inline(never)]
    fn try_get_or_alloc_overflow_chunk(
        &self,
        chunk_index: usize,
    ) -> Result<&'alloc LocalChunk<V>, AllocError> {
        let overflow_index = chunk_index - INLINE_CHUNKS;

        self.overflow.map(|overflow| {
            let required = overflow_index.checked_add(1).ok_or(AllocError)?;

            if overflow.len() < required {
                overflow
                    .try_reserve(required - overflow.len())
                    .map_err(|_error| AllocError)?;
                overflow.resize(required, None);
            }

            if let Some(chunk) = overflow[overflow_index] {
                return Ok(chunk);
            }

            let chunk = LocalChunk::try_alloc_in(self.alloc)?;
            overflow[overflow_index] = Some(chunk);
            Ok(chunk)
        })
    }

    /// Inserts `value` at `id` and returns a reference valid for `'alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the backing arena cannot allocate a chunk or grow the overflow
    /// directory.
    ///
    /// # Panics
    ///
    /// Panics if `id` already holds a value.
    #[expect(unsafe_code, reason = "checked index into inline chunk array")]
    #[inline]
    pub fn try_insert(&self, id: I, value: V) -> Result<&'alloc V, AllocError> {
        let (chunk_index, slot) = Self::split_id(id);

        let chunk = if chunk_index < INLINE_CHUNKS {
            // SAFETY: `chunk_index < INLINE_CHUNKS` is checked above.
            let cell = unsafe { self.inline.get_unchecked(chunk_index) };
            cell.get().copied().map_or_else(
                || {
                    let chunk = LocalChunk::try_alloc_in(self.alloc)?;
                    Ok(*cell.get_or_init(|| chunk))
                },
                Ok,
            )?
        } else {
            self.try_get_or_alloc_overflow_chunk(chunk_index)?
        };

        Ok(chunk.write_once(slot, value))
    }

    /// Inserts `value` at `id` and returns a reference valid for `'alloc`.
    ///
    /// Calls [`handle_alloc_error`] if the backing arena cannot provide memory. Use
    /// [`Self::try_insert`] to handle allocation failure.
    ///
    /// # Panics
    ///
    /// Panics if `id` already holds a value.
    #[inline]
    pub fn insert(&self, id: I, value: V) -> &'alloc V {
        self.try_insert(id, value)
            .unwrap_or_else(|_| handle_alloc_error(Layout::new::<LocalChunk<V>>()))
    }
}

impl<I, V, A: Allocator> core::ops::Index<I> for IdLocalChunkVec<'_, I, V, A>
where
    I: Id,
{
    type Output = V;

    #[inline]
    fn index(&self, index: I) -> &Self::Output {
        self.get(index).expect("id should exist in chunk vec")
    }
}

impl<I, V, A: Allocator> fmt::Debug for IdLocalChunkVec<'_, I, V, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let inline_chunks = self
            .inline
            .iter()
            .filter(|cell| cell.get().is_some())
            .count();
        let overflow_chunks = self
            .overflow
            .map(|overflow| overflow.iter().filter(|chunk| chunk.is_some()).count());

        fmt.debug_struct("IdLocalChunkVec")
            .field("inline_chunks", &inline_chunks)
            .field("overflow_chunks", &overflow_chunks)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use core::ptr;

    use crate::{
        heap::{Heap, Scratch},
        id::{Id as _, IdLocalChunkVec, newtype},
    };

    newtype!(
        #[id(crate = crate)]
        struct EntryId(u32 is 0..=0xFFFF_FF00)
    );

    #[test]
    fn inline_insert_and_lookup() {
        let scratch = Scratch::new();
        let vec = IdLocalChunkVec::<EntryId, i32, _>::new_in(&scratch);

        assert!(!vec.contains(EntryId::new(0)));
        assert_eq!(vec.get(EntryId::new(0)), None);

        let first = vec.insert(EntryId::new(0), 10);
        let second = vec.insert(EntryId::new(63), 20);
        let third = vec.insert(EntryId::new(511), 30);

        assert!(vec.contains(EntryId::new(0)));
        assert!(vec.contains(EntryId::new(63)));
        assert!(vec.contains(EntryId::new(511)));
        assert!(!vec.contains(EntryId::new(64)));

        assert!(ptr::eq(&raw const vec[EntryId::new(0)], first));
        assert!(ptr::eq(&raw const vec[EntryId::new(63)], second));
        assert!(ptr::eq(&raw const vec[EntryId::new(511)], third));

        // SAFETY: All three IDs were inserted above.
        #[expect(unsafe_code)]
        unsafe {
            assert_eq!(*vec.get_unchecked(EntryId::new(0)), 10);
            assert_eq!(*vec.get_unchecked(EntryId::new(63)), 20);
            assert_eq!(*vec.get_unchecked(EntryId::new(511)), 30);
        }
    }

    #[test]
    fn overflow_chunks_and_address_stability() {
        let heap = Heap::new();
        let vec = IdLocalChunkVec::<EntryId, u32, _>::new_in(&heap);

        let mut refs = Vec::new();
        for index in (0..1024_u32).rev() {
            let id = EntryId::new(index);
            assert!(!vec.contains(id));
            assert_eq!(vec.get(id), None);
            refs.push((id, vec.insert(id, index * 3)));
        }

        // Verify references survive subsequent insertions and dropping the chunk vector.
        for &(id, reference) in &refs {
            assert!(vec.contains(id));
            assert!(ptr::eq(&raw const vec[id], reference));
            // SAFETY: `id` was inserted in the loop above.
            #[expect(unsafe_code)]
            let unchecked = unsafe { vec.get_unchecked(id) };
            assert!(ptr::eq(unchecked, reference));
        }

        drop(vec);

        for (id, reference) in refs {
            assert_eq!(*reference, id.as_u32() * 3);
        }
    }

    #[test]
    fn out_of_range_lookup_returns_none() {
        let scratch = Scratch::new();
        let vec = IdLocalChunkVec::<EntryId, u32, _>::new_in(&scratch);

        assert!(!vec.contains(EntryId::new(0xFFFF_FF00)));
        assert_eq!(vec.get(EntryId::new(0xFFFF_FF00)), None);
    }

    #[test]
    fn with_capacity_in_handles_inline_and_overflow() {
        let scratch = Scratch::new();
        let small = IdLocalChunkVec::<EntryId, u32, _>::with_capacity_in(64, &scratch);
        let large = IdLocalChunkVec::<EntryId, u32, _>::with_capacity_in(1024, &scratch);

        assert_eq!(*small.insert(EntryId::new(10), 1), 1);
        assert_eq!(*large.insert(EntryId::new(900), 2), 2);
        assert_eq!(large.get(EntryId::new(900)), Some(&2));
    }

    #[test]
    #[should_panic(expected = "lookup should not have duplicate items associated with an id")]
    fn duplicate_insert_panics() {
        let scratch = Scratch::new();
        let vec = IdLocalChunkVec::<EntryId, u32, _>::new_in(&scratch);

        let _: &u32 = vec.insert(EntryId::new(7), 1);
        let _: &u32 = vec.insert(EntryId::new(7), 2);
    }
}
