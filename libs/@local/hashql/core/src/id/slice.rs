#![cfg_attr(
    feature = "zerocopy",
    expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")
)]

use core::{
    alloc::Allocator,
    clone::CloneToUninit,
    cmp,
    fmt::{self, Debug},
    marker::PhantomData,
    mem::MaybeUninit,
    num::NonZero,
    ops::{Index, IndexMut},
    ptr,
    slice::{self, GetDisjointMutError, GetDisjointMutIndex, SliceIndex},
};

#[cfg(feature = "rayon")]
use rayon::{
    iter::{
        IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator as _,
        IntoParallelRefMutIterator as _, ParallelIterator as _,
    },
    slice::ParallelSliceMut as _,
};

use super::{Id, index::IntoSliceIndex, vec::IdVec};

/// Returns the greatest chunk-start offset, or zero when the slice is empty.
#[inline]
#[expect(
    clippy::integer_division,
    reason = "integer division rounds the slice end down to the containing chunk start"
)]
const fn greatest_chunk_start(length: usize, size: NonZero<usize>) -> usize {
    length.saturating_sub(1) / size * size.get()
}

/// A slice that uses typed IDs for indexing instead of raw `usize` values.
///
/// `IdSlice<I, T>` has the same layout as `[T]` and uses types implementing [`Id`] for indexing.
/// Raw conversions preserve the slice length, including lengths beyond `I`'s range. Methods
/// producing IDs require the converted indices to be representable by `I`.
///
/// # Example
///
/// ```
/// # use hashql_core::id::{IdSlice, Id as _, newtype};
/// # newtype!(struct UserId(u32 is 0..=0xFFFF_FF00));
/// let data = [10, 20, 30];
/// let slice = IdSlice::<UserId, _>::from_raw(&data);
///
/// let user_id = UserId::from_usize(1);
/// assert_eq!(slice[user_id], 20);
/// ```
#[derive(PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(
    feature = "zerocopy",
    derive(
        zerocopy::FromBytes,
        zerocopy::IntoBytes,
        zerocopy::Immutable,
        zerocopy::Unaligned,
        zerocopy::KnownLayout
    )
)]
#[repr(transparent)]
pub struct IdSlice<I, T> {
    _marker: PhantomData<fn(&I)>,
    raw: [T],
}

#[coverage(off)] // reason: trivial implementation
impl<I, T> IdSlice<I, T>
where
    I: Id,
{
    /// Creates a reference to an empty typed slice.
    #[inline]
    #[must_use]
    pub const fn empty<'this>() -> &'this Self {
        Self::from_raw(&[])
    }

    /// Creates a typed slice from a raw slice reference.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw(raw: &[T]) -> &Self {
        // SAFETY: `repr(transparent)` gives `IdSlice` the layout of `raw: [T]`. Its
        // `PhantomData` field has size 0, alignment 1 and no validity requirements.
        // The cast preserves the address, element-count metadata and input borrow lifetime.
        // Therefore the shared reference is valid for the returned borrow.
        unsafe { &*(ptr::from_ref::<[T]>(raw) as *const Self) }
    }

    /// Creates a mutable typed slice from a raw mutable slice reference.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw_mut(raw: &mut [T]) -> &mut Self {
        // SAFETY: `repr(transparent)` gives `IdSlice` the layout of `raw: [T]`. Its
        // `PhantomData` field has size 0, alignment 1 and no validity requirements.
        // The cast preserves the address and element-count metadata. The returned borrow
        // retains the input borrow's lifetime and exclusivity, making the reference valid.
        unsafe { &mut *(ptr::from_mut(raw) as *mut Self) }
    }

    /// Returns the underlying raw slice.
    #[inline]
    pub const fn as_raw(&self) -> &[T] {
        &self.raw
    }

    /// Returns the underlying raw mutable slice.
    #[inline]
    pub const fn as_raw_mut(&mut self) -> &mut [T] {
        &mut self.raw
    }

    /// Converts a boxed slice into a boxed typed slice.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub fn from_boxed_slice<A: Allocator>(slice: Box<[T], A>) -> Box<Self, A> {
        let (ptr, alloc) = Box::into_raw_with_allocator(slice);

        // SAFETY: `Box::from_raw_in` requires valid contents and unique ownership under the
        // original allocator and layout. `IdSlice` is `repr(transparent)` over `[T]`, with
        // an unconstrained size-0, alignment-1 `PhantomData` companion. The cast preserves
        // the address and element-count metadata, including for empty and zero-sized slices.
        // Reconstructing once with the returned allocator preserves ownership and layout.
        unsafe { Box::from_raw_in(ptr as *mut Self, alloc) }
    }

    /// Converts a boxed typed slice back into its raw boxed slice.
    ///
    /// The inverse of [`from_boxed_slice`](Self::from_boxed_slice), removing only the typed index
    /// domain while preserving the allocation and elements.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub fn into_boxed_raw<A: Allocator>(slice: Box<Self, A>) -> Box<[T], A> {
        let (ptr, alloc) = Box::into_raw_with_allocator(slice);

        // SAFETY: `Box::from_raw_in` requires valid contents and unique ownership under the
        // original allocator and layout. `repr(transparent)` gives `IdSlice` and `[T]` the
        // same layout. The cast preserves the address and element-count metadata, including
        // for empty and zero-sized slices. Reconstructing once with the returned allocator
        // preserves ownership and layout.
        unsafe { Box::from_raw_in(ptr as *mut [T], alloc) }
    }

    /// Converts a boxed slice of initialized slots into a boxed typed slice.
    ///
    /// See [`Box::assume_init`] for additional details.
    ///
    /// # Safety
    ///
    /// All elements must contain initialized values that satisfy `T`'s validity requirements.
    /// See [`MaybeUninit::assume_init`].
    #[expect(unsafe_code)]
    pub unsafe fn boxed_assume_init<A: Allocator>(
        slice: Box<IdSlice<I, MaybeUninit<T>>, A>,
    ) -> Box<Self, A> {
        let (ptr, alloc) = Box::into_raw_with_allocator(slice);

        // SAFETY: `MaybeUninit<T>` guarantees `T`'s size and alignment, and `Box::from_raw_in`
        // requires valid contents and unique ownership under the original allocator and layout.
        // The caller guarantees all elements contain valid, initialized `T`s. Both `IdSlice`
        // types are `repr(transparent)` over their slice tails, with size-0, alignment-1
        // `PhantomData` companions requiring no initialized bytes. The casts preserve the
        // address and element-count metadata, including for empty and zero-sized slices.
        // Reconstructing once with the returned allocator is therefore valid.
        unsafe { Box::from_raw_in(ptr as *mut [MaybeUninit<T>] as *mut [T] as *mut Self, alloc) }
    }

    /// Gets a reference to an element or subslice by ID index.
    ///
    /// See [`slice::get`] for details.
    #[inline]
    pub fn get<R>(&self, index: R) -> Option<&<R::SliceIndex as SliceIndex<[T]>>::Output>
    where
        R: IntoSliceIndex<I, [T]>,
    {
        self.raw.get(index.into_slice_index())
    }

    /// Gets a mutable reference to an element or subslice by ID index.
    ///
    /// See [`slice::get_mut`] for details.
    #[inline]
    pub fn get_mut<R>(
        &mut self,
        index: R,
    ) -> Option<&mut <R::SliceIndex as SliceIndex<[T]>>::Output>
    where
        R: IntoSliceIndex<I, [T]>,
    {
        self.raw.get_mut(index.into_slice_index())
    }

    /// Gets mutable references to multiple disjoint elements or subslices.
    ///
    /// See [`slice::get_disjoint_mut`] for details.
    ///
    /// # Errors
    ///
    /// If any of the indices are out of bounds or overlap.
    #[inline]
    #[expect(clippy::type_complexity, reason = "there isn't much to refactor")]
    pub fn get_disjoint_mut<R, const N: usize>(
        &mut self,
        index: [R; N],
    ) -> Result<[&mut <R::SliceIndex as SliceIndex<[T]>>::Output; N], GetDisjointMutError>
    where
        R: IntoSliceIndex<I, [T], SliceIndex: GetDisjointMutIndex>,
    {
        self.raw
            .get_disjoint_mut(index.map(IntoSliceIndex::into_slice_index))
    }

    /// Returns the prefix of the slice below `bound`, keeping the index domain.
    ///
    /// Range indexing returns a raw slice with indices relative to the subslice start.
    /// A prefix starts at zero. Its indices never change, and every element keeps its original ID.
    /// Returning a typed prefix preserves those IDs.
    ///
    /// # Panics
    ///
    /// When `bound` exceeds the slice length.
    #[inline]
    pub fn prefix(&self, bound: I) -> &Self {
        Self::from_raw(&self.raw[..bound.as_usize()])
    }

    /// Returns the mutable prefix of the slice below `bound`, keeping the index domain.
    ///
    /// The mutable form of [`prefix`](Self::prefix).
    ///
    /// # Panics
    ///
    /// When `bound` exceeds the slice length.
    #[inline]
    pub fn prefix_mut(&mut self, bound: I) -> &mut Self {
        Self::from_raw_mut(&mut self.raw[..bound.as_usize()])
    }

    /// Returns the number of elements in the slice.
    ///
    /// See [`slice::len`] for details.
    #[inline]
    pub const fn len(&self) -> usize {
        self.raw.len()
    }

    /// Returns the exclusive upper bound ID for this slice.
    ///
    /// The ID's numeric value equals the slice length. The comparison `id < slice.bound()`
    /// tests whether `id` indexes an element of the slice.
    ///
    /// # Panics
    ///
    /// Panics if the slice length is outside `I`'s range. This includes a slice occupying the
    /// complete ID domain, whose exclusive upper bound has no representable ID.
    #[inline]
    pub fn bound(&self) -> I {
        I::from_usize(self.len())
    }

    /// Returns `true` if the slice has a length of 0.
    ///
    /// See [`slice::is_empty`] for details.
    #[inline]
    pub const fn is_empty(&self) -> bool {
        self.raw.is_empty()
    }

    /// Returns an iterator over all element IDs for this slice.
    ///
    /// The iterator converts indices in `0..self.len()` into IDs.
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    pub fn ids(&self) -> impl DoubleEndedIterator<Item = I> + ExactSizeIterator + Clone + 'static {
        let length = self.len();

        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(length.saturating_sub(1));

        (0..length).map(I::from_usize)
    }

    /// Returns a parallel iterator over all element IDs for this slice.
    ///
    /// The parallel counterpart of [`Self::ids`].
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    #[cfg(feature = "rayon")]
    pub fn par_ids(&self) -> impl IndexedParallelIterator<Item = I> + 'static {
        let length = self.len();

        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(length.saturating_sub(1));

        (0..length).into_par_iter().map(I::from_usize)
    }

    /// Returns an iterator over the elements.
    ///
    /// See [`slice::iter`] for details.
    #[inline]
    pub fn iter(&self) -> slice::Iter<'_, T> {
        self.raw.iter()
    }

    /// Returns a parallel iterator over the elements.
    ///
    /// The parallel counterpart of [`Self::iter`].
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_iter(&self) -> rayon::slice::Iter<'_, T>
    where
        T: Sync,
    {
        self.raw.par_iter()
    }

    /// Returns an iterator over ID-element pairs.
    ///
    /// Like [`Iterator::enumerate`], with each index converted to `I`.
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    pub fn iter_enumerated(
        &self,
    ) -> impl DoubleEndedIterator<Item = (I, &T)> + ExactSizeIterator + Clone {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .iter()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    /// Returns a parallel iterator over ID-element pairs.
    ///
    /// The parallel counterpart of [`Self::iter_enumerated`].
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    #[cfg(feature = "rayon")]
    pub fn par_iter_enumerated(&self) -> impl IndexedParallelIterator<Item = (I, &T)>
    where
        T: Sync,
    {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .par_iter()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    /// Returns a mutable iterator over the elements.
    ///
    /// See [`slice::iter_mut`] for details.
    #[inline]
    pub fn iter_mut(&mut self) -> slice::IterMut<'_, T> {
        self.raw.iter_mut()
    }

    /// Returns a parallel mutable iterator over the elements.
    ///
    /// The parallel counterpart of [`Self::iter_mut`].
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_iter_mut(&mut self) -> rayon::slice::IterMut<'_, T>
    where
        T: Send,
    {
        self.raw.par_iter_mut()
    }

    /// Returns a mutable iterator over ID-element pairs.
    ///
    /// Like [`Iterator::enumerate`], with each index converted to `I`.
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    pub fn iter_enumerated_mut(
        &mut self,
    ) -> impl DoubleEndedIterator<Item = (I, &mut T)> + ExactSizeIterator {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .iter_mut()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    /// Returns a parallel mutable iterator over ID-element pairs.
    ///
    /// The parallel counterpart of [`Self::iter_enumerated_mut`].
    ///
    /// # Panics
    ///
    /// Panics if an element index, or zero for an empty slice, is outside `I`'s range.
    #[cfg(feature = "rayon")]
    pub fn par_iter_enumerated_mut(&mut self) -> impl IndexedParallelIterator<Item = (I, &mut T)>
    where
        T: Send,
    {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .par_iter_mut()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    /// Swaps two elements in the slice.
    ///
    /// See [`slice::swap`] for details.
    ///
    /// # Panics
    ///
    /// Either `lhs` or `rhs` is out of bounds.
    ///
    /// [`slice::swap`]: slice::swap
    #[inline]
    pub fn swap(&mut self, lhs: I, rhs: I) {
        self.raw.swap(lhs.as_usize(), rhs.as_usize());
    }

    /// Returns an iterator over contiguous array windows of size `N`.
    ///
    /// See [`slice::array_windows`] for details.
    ///
    /// # Panics
    ///
    /// Panics if `N` is zero.
    #[inline]
    pub fn windows<const N: usize>(&self) -> impl ExactSizeIterator<Item = &[T; N]> {
        self.raw.array_windows()
    }

    /// Returns an iterator over ID-window pairs for windows of size `N`.
    ///
    /// Each window pairs with the ID of its first element. A window at `(id, [a, b])` contains
    /// the elements at offsets `id.as_usize()` and `id.as_usize() + 1` in the original slice.
    /// See [`slice::array_windows`] for the window semantics.
    ///
    /// # Panics
    ///
    /// Panics if `N` is zero or a window-start index is outside `I`'s range. A slice shorter
    /// than `N` still requires `I` to represent zero.
    #[inline]
    pub fn windows_enumerated<const N: usize>(
        &self,
    ) -> impl DoubleEndedIterator<Item = (I, &[T; N])> + ExactSizeIterator + Clone {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(N));

        self.raw
            .array_windows()
            .enumerate()
            .map(|(index, window)| (I::from_usize(index), window))
    }

    /// Returns an iterator over chunks of size `size`.
    ///
    /// Each chunk is a slice of `size` elements, except the last chunk may be smaller.
    ///
    /// See [`slice::chunks`](prim@slice#method.chunks) for details.
    #[inline]
    pub fn chunks(
        &self,
        size: NonZero<usize>,
    ) -> impl DoubleEndedIterator<Item = &[T]> + ExactSizeIterator + Clone {
        self.raw.chunks(size.get())
    }

    /// Returns a parallel iterator over chunks of size `size`.
    ///
    /// The parallel counterpart of [`Self::chunks`].
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_chunks(
        &self,
        size: NonZero<usize>,
    ) -> impl IndexedParallelIterator<Item = &[T]> + Clone
    where
        T: Sync,
    {
        use rayon::slice::ParallelSlice as _;

        self.raw.par_chunks(size.get())
    }

    /// Returns an iterator over chunks of size `size`, each with the ID of its first element.
    ///
    /// Each chunk is a slice of `size` elements, except the last chunk may be smaller. A chunk
    /// at `(id, chunk)` contains the original slice's offsets in
    /// `id.as_usize()..id.as_usize() + chunk.len()`, mirroring [`Self::windows_enumerated`].
    ///
    /// # Panics
    ///
    /// Panics if a chunk-start index, or zero for an empty slice, is outside `I`'s range.
    #[inline]
    pub fn chunks_enumerated(
        &self,
        size: NonZero<usize>,
    ) -> impl DoubleEndedIterator<Item = (I, &[T])> + ExactSizeIterator + Clone {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(greatest_chunk_start(self.len(), size));

        self.raw
            .chunks(size.get())
            .enumerate()
            .map(move |(index, chunk)| (I::from_usize(index * size.get()), chunk))
    }

    /// Returns a parallel iterator over chunks, each with the ID of its first element.
    ///
    /// The parallel counterpart of [`Self::chunks_enumerated`].
    ///
    /// # Panics
    ///
    /// Panics if a chunk-start index, or zero for an empty slice, is outside `I`'s range.
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_chunks_enumerated(
        &self,
        size: NonZero<usize>,
    ) -> impl IndexedParallelIterator<Item = (I, &[T])> + Clone
    where
        T: Sync,
    {
        use rayon::slice::ParallelSlice as _;
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(greatest_chunk_start(self.len(), size));

        self.raw
            .par_chunks(size.get())
            .enumerate()
            .map(move |(index, chunk)| (I::from_usize(index * size.get()), chunk))
    }

    /// Returns a mutable iterator over chunks of size `size`.
    ///
    /// Each chunk is a mutable slice of `size` elements, except the last chunk may be smaller.
    ///
    /// See [`slice::chunks_mut`](prim@slice#method.chunks_mut) for details.
    #[inline]
    pub fn chunks_mut(&mut self, size: NonZero<usize>) -> slice::ChunksMut<'_, T> {
        self.raw.chunks_mut(size.get())
    }

    /// Returns a parallel mutable iterator over chunks of size `size`.
    ///
    /// The parallel counterpart of [`Self::chunks_mut`].
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_chunks_mut(
        &mut self,
        size: NonZero<usize>,
    ) -> impl IndexedParallelIterator<Item = &mut [T]>
    where
        T: Send,
    {
        use rayon::slice::ParallelSliceMut as _;

        self.raw.par_chunks_mut(size.get())
    }

    /// Returns a mutable iterator over chunks, each with the ID of its first element.
    ///
    /// Each chunk is a mutable slice of `size` elements, except the last chunk may be smaller.
    /// Its ID identifies the first element, as in [`Self::chunks_enumerated`].
    ///
    /// # Panics
    ///
    /// Panics if a chunk-start index, or zero for an empty slice, is outside `I`'s range.
    #[inline]
    pub fn chunks_enumerated_mut(
        &mut self,
        size: NonZero<usize>,
    ) -> impl DoubleEndedIterator<Item = (I, &mut [T])> + ExactSizeIterator {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(greatest_chunk_start(self.len(), size));

        self.raw
            .chunks_mut(size.get())
            .enumerate()
            .map(move |(index, chunk)| (I::from_usize(index * size.get()), chunk))
    }

    /// Returns a parallel mutable iterator over chunks, each with the ID of its first element.
    ///
    /// The parallel counterpart of [`Self::chunks_enumerated_mut`].
    ///
    /// # Panics
    ///
    /// Panics if a chunk-start index, or zero for an empty slice, is outside `I`'s range.
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_chunks_enumerated_mut(
        &mut self,
        size: NonZero<usize>,
    ) -> impl IndexedParallelIterator<Item = (I, &mut [T])>
    where
        T: Send,
    {
        use rayon::slice::ParallelSliceMut as _;
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(greatest_chunk_start(self.len(), size));

        self.raw
            .par_chunks_mut(size.get())
            .enumerate()
            .map(move |(index, chunk)| (I::from_usize(index * size.get()), chunk))
    }

    /// Sorts the slice in place with `compare`, in unstable order.
    ///
    /// See [`slice::sort_unstable_by`](prim@slice#method.sort_unstable_by) for details.
    #[inline]
    pub fn sort_unstable_by(&mut self, compare: impl Fn(&T, &T) -> cmp::Ordering) {
        self.raw.sort_unstable_by(compare);
    }

    /// Sorts the slice in place with `compare`, in parallel and unstable order.
    ///
    /// The parallel counterpart of [`slice::sort_unstable_by`](prim@slice#method.sort_unstable_by).
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_sort_unstable_by(&mut self, compare: impl Fn(&T, &T) -> cmp::Ordering + Sync)
    where
        T: Send,
    {
        self.raw.par_sort_unstable_by(compare);
    }

    /// Sorts the slice in place by the key from `func`, in unstable order.
    ///
    /// See [`slice::sort_unstable_by_key`](prim@slice#method.sort_unstable_by_key) for details.
    #[inline]
    pub fn sort_unstable_by_key<K>(&mut self, func: impl FnMut(&T) -> K)
    where
        K: Ord,
    {
        self.raw.sort_unstable_by_key(func);
    }

    /// Sorts the slice in place by the key from `func`, in parallel and unstable order.
    ///
    /// The parallel counterpart of [`Self::sort_unstable_by_key`].
    #[cfg(feature = "rayon")]
    #[inline]
    pub fn par_sort_unstable_by_key<K>(&mut self, func: impl Fn(&T) -> K + Sync)
    where
        T: Send,
        K: Ord + Send,
    {
        self.raw.par_sort_unstable_by_key(func);
    }

    /// Returns `true` if the slice is sorted.
    ///
    /// See [`slice::is_sorted`](prim@slice#method.is_sorted) for details.
    #[inline]
    pub fn is_sorted(&self) -> bool
    where
        T: Ord,
    {
        self.raw.is_sorted()
    }

    /// Returns `true` if the slice is sorted according to `compare`.
    ///
    /// See [`slice::is_sorted_by`](prim@slice#method.is_sorted_by) for details.
    #[inline]
    pub fn is_sorted_by(&self, compare: impl Fn(&T, &T) -> bool) -> bool {
        self.raw.is_sorted_by(compare)
    }

    /// Finds an item's ID by binary search.
    ///
    /// See [`slice::binary_search`](prim@slice#method.binary_search) for details.
    ///
    /// # Errors
    ///
    /// When no element matches, returns the ID where inserting `item` preserves sorted order.
    ///
    /// # Panics
    ///
    /// Panics if the matching index or insertion position is outside `I`'s range. A slice
    /// occupying the complete ID domain panics when `item` belongs after every element.
    #[inline]
    pub fn binary_search(&self, item: &T) -> Result<I, I>
    where
        T: Ord,
    {
        self.raw
            .binary_search(item)
            .map(I::from_usize)
            .map_err(I::from_usize)
    }

    /// Clones the slice into a new [`IdVec`].
    ///
    /// See [`slice::to_vec`](prim@slice#method.to_vec) for details.
    pub fn to_vec(&self) -> IdVec<I, T>
    where
        T: Clone,
    {
        IdVec::from_raw(self.raw.to_vec())
    }

    /// Clones the slice into a new [`IdVec`] using `alloc`.
    ///
    /// See [`slice::to_vec_in`](prim@slice#method.to_vec_in) for details.
    pub fn to_vec_in<A>(&self, alloc: A) -> IdVec<I, T, A>
    where
        A: Allocator,
        T: Clone,
    {
        IdVec::from_raw(self.raw.to_vec_in(alloc))
    }

    /// Returns the ID of the first element for which `predicate` is false.
    ///
    /// Returns the exclusive upper bound if every element satisfies `predicate`.
    /// See [`slice::partition_point`](prim@slice#method.partition_point) for details.
    ///
    /// # Panics
    ///
    /// Panics if the partition position is outside `I`'s range, including the exclusive end
    /// when every element satisfies `predicate`.
    #[inline]
    pub fn partition_point(&self, predicate: impl Fn(&T) -> bool) -> I {
        let index = self.raw.partition_point(predicate);
        I::from_usize(index)
    }

    /// Returns the final element, or [`None`] when the slice is empty.
    ///
    /// See [`slice::last`](prim@slice#method.last) for details.
    #[inline]
    pub const fn last(&self) -> Option<&T> {
        self.raw.last()
    }

    /// Returns the first element, or [`None`] when the slice is empty.
    ///
    /// See [`slice::first`](prim@slice#method.first) for details.
    #[inline]
    pub const fn first(&self) -> Option<&T> {
        self.raw.first()
    }

    /// Fills the slice by cloning `value` into every element.
    ///
    /// See [`slice::fill`](prim@slice#method.fill) for details.
    #[inline]
    pub fn fill(&mut self, value: T)
    where
        T: Clone,
    {
        self.raw.fill(value);
    }
}

#[expect(unsafe_code)]
impl<I, T> IdSlice<I, MaybeUninit<T>>
where
    I: Id,
{
    /// Borrows all initialized elements as a mutable typed slice.
    ///
    /// # Safety
    ///
    /// All elements must contain initialized values that satisfy `T`'s validity requirements.
    /// See [`MaybeUninit::assume_init`].
    pub const unsafe fn assume_init_mut(&mut self) -> &mut IdSlice<I, T> {
        // SAFETY: the slice operation requires initialized values satisfying `T`'s validity
        // requirements in all slots. The caller must guarantee that condition. The mutable
        // borrow preserves exclusivity and lifetime, making the conversion valid.
        IdSlice::from_raw_mut(unsafe { self.raw.assume_init_mut() })
    }

    /// Borrows all initialized elements as a shared typed slice.
    ///
    /// # Safety
    ///
    /// All elements must contain initialized values that satisfy `T`'s validity requirements.
    /// See [`MaybeUninit::assume_init`].
    pub const unsafe fn assume_init_ref(&self) -> &IdSlice<I, T> {
        // SAFETY: the slice operation requires initialized values satisfying `T`'s validity
        // requirements in all slots. The caller must guarantee that condition. The shared
        // borrow preserves the input lifetime, making the conversion valid.
        IdSlice::from_raw(unsafe { self.raw.assume_init_ref() })
    }
}

impl<I, T> IdSlice<I, Option<T>>
where
    I: Id,
{
    /// Removes and returns the value at `index`.
    ///
    /// Returns `None` if the index is out of bounds or if the value was already `None`.
    /// The slice length is unchanged after removal.
    ///
    /// # Example
    ///
    /// ```
    /// # use hashql_core::id::{IdVec, Id as _, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(0), "hello".to_string());
    /// let removed = vec.remove(MyId::from_usize(0));
    /// assert_eq!(removed, Some("hello".to_string()));
    /// assert!(vec[MyId::from_usize(0)].is_none());
    /// ```
    pub fn remove(&mut self, index: I) -> Option<T> {
        self.get_mut(index)?.take()
    }

    /// Returns `true` if the slice contains a value at `index`.
    ///
    /// # Example
    ///
    /// ```
    /// # use hashql_core::id::{IdVec, Id as _, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(0), "hello".to_string());
    /// assert!(vec.contains(MyId::from_usize(0)));
    /// assert!(!vec.contains(MyId::from_usize(1)));
    /// ```
    pub fn contains(&self, index: I) -> bool {
        self.get(index).and_then(Option::as_ref).is_some()
    }

    /// Gets a reference to the inner value at `index`, if present.
    ///
    /// Returns [`None`] if the index is out of bounds or if the value at that index is [`None`].
    ///
    /// # Example
    ///
    /// ```
    /// # use hashql_core::id::{IdVec, Id as _, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(0), "hello".to_string());
    ///
    /// assert_eq!(vec.lookup(MyId::from_usize(0)), Some(&"hello".to_string()));
    /// assert_eq!(vec.lookup(MyId::from_usize(1)), None); // out of bounds
    /// ```
    #[inline]
    pub fn lookup(&self, index: I) -> Option<&T> {
        self.get(index).and_then(Option::as_ref)
    }

    /// Gets a mutable reference to the inner value at `index`, if present.
    ///
    /// Returns [`None`] if the index is out of bounds or if the value at that index is [`None`].
    ///
    /// # Example
    ///
    /// ```
    /// # use hashql_core::id::{IdVec, Id as _, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(0), "hello".to_string());
    ///
    /// if let Some(value) = vec.lookup_mut(MyId::from_usize(0)) {
    ///     value.push_str(" world");
    /// }
    /// assert_eq!(
    ///     vec.lookup(MyId::from_usize(0)),
    ///     Some(&"hello world".to_string())
    /// );
    /// ```
    #[inline]
    pub fn lookup_mut(&mut self, index: I) -> Option<&mut T> {
        self.get_mut(index).and_then(Option::as_mut)
    }
}

impl<I, T> Debug for IdSlice<I, T>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.raw, fmt)
    }
}

const impl<I, T, R> Index<R> for IdSlice<I, T>
where
    R: [const] IntoSliceIndex<I, [T]>,
    <R as IntoSliceIndex<I, [T]>>::SliceIndex: [const] core::slice::SliceIndex<[T]>,
{
    type Output = <R::SliceIndex as SliceIndex<[T]>>::Output;

    fn index(&self, index: R) -> &Self::Output {
        self.raw.index(index.into_slice_index())
    }
}

const impl<I, T, R> IndexMut<R> for IdSlice<I, T>
where
    R: [const] IntoSliceIndex<I, [T]>,
    <R as IntoSliceIndex<I, [T]>>::SliceIndex: [const] core::slice::SliceIndex<[T]>,
{
    fn index_mut(&mut self, index: R) -> &mut Self::Output {
        self.raw.index_mut(index.into_slice_index())
    }
}

impl<'this, I, T> IntoIterator for &'this IdSlice<I, T> {
    type IntoIter = slice::Iter<'this, T>;
    type Item = &'this T;

    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter()
    }
}

impl<'this, I, T> IntoIterator for &'this mut IdSlice<I, T> {
    type IntoIter = slice::IterMut<'this, T>;
    type Item = &'this mut T;

    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter_mut()
    }
}

#[cfg(feature = "rayon")]
impl<'this, I, T> IntoParallelIterator for &'this IdSlice<I, T>
where
    T: Sync,
{
    type Item = &'this T;
    type Iter = rayon::slice::Iter<'this, T>;

    fn into_par_iter(self) -> Self::Iter {
        self.raw.par_iter()
    }
}

#[cfg(feature = "rayon")]
impl<'this, I, T> IntoParallelIterator for &'this mut IdSlice<I, T>
where
    T: Send,
{
    type Item = &'this mut T;
    type Iter = rayon::slice::IterMut<'this, T>;

    fn into_par_iter(self) -> Self::Iter {
        self.raw.par_iter_mut()
    }
}

#[expect(
    unsafe_code,
    reason = "repr(transparent): the clone writes through `[T]`'s own layout"
)]
// SAFETY: A normal return must leave `*dest` a valid `IdSlice<I, T>` under `self`'s pointer
// metadata. `IdSlice` is `repr(transparent)`: `raw: [T]` is the transparent tail and
// `_marker: PhantomData<fn(&I)>` its size-0, alignment-1 companion, valid under every byte
// pattern. `raw` starts at offset 0 and shares `self`'s size, alignment and element-count
// metadata. The body forwards `dest` unchanged to `<[T]>::clone_to_uninit(&self.raw, dest)`,
// whose normal return leaves a valid `[T]` of `self.raw.len()` elements at `dest`. Beside the
// marker, that is a fully initialized `IdSlice<I, T>`.
unsafe impl<I, T> CloneToUninit for IdSlice<I, T>
where
    T: Clone,
{
    unsafe fn clone_to_uninit(&self, dest: *mut u8) {
        // SAFETY: `<[T]>::clone_to_uninit` requires `dest` valid for writes of
        // `size_of_val(&self.raw)` bytes and aligned to `align_of_val(&self.raw)`. The caller
        // guarantees both for `self`, and the `repr(transparent)` layout gives `self` and
        // `self.raw` exactly the same size and alignment: zero bytes for an empty slice or a
        // zero-sized `T`, and `T`'s own alignment for an over-aligned `T`.
        unsafe {
            <[T]>::clone_to_uninit(&self.raw, dest);
        }
    }
}

impl<I, T, A> Clone for Box<IdSlice<I, T>, A>
where
    T: Clone,
    A: Allocator + Clone,
{
    fn clone(&self) -> Self {
        Self::clone_from_ref_in(&**self, Self::allocator(self).clone())
    }

    fn clone_from(&mut self, source: &Self) {
        if self.raw.len() == source.raw.len() {
            self.raw.clone_from_slice(&source.raw);
        } else {
            *self = source.clone();
        }
    }
}

impl<I, T> ToOwned for IdSlice<I, T>
where
    I: Id,
    T: Clone,
{
    type Owned = IdVec<I, T>;

    fn to_owned(&self) -> Self::Owned {
        IdVec::from_raw(self.raw.to_owned())
    }

    fn clone_into(&self, target: &mut Self::Owned) {
        self.raw.clone_into(&mut target.raw);
    }
}

impl<I, T> Default for &IdSlice<I, T>
where
    I: Id,
{
    fn default() -> Self {
        IdSlice::from_raw(Default::default())
    }
}

impl<I, T> Default for &mut IdSlice<I, T>
where
    I: Id,
{
    fn default() -> Self {
        IdSlice::from_raw_mut(Default::default())
    }
}

#[cfg(test)]
mod tests {
    #![expect(unsafe_code, clippy::cast_possible_truncation)]
    use alloc::{boxed::Box, rc::Rc};
    use core::{
        clone::CloneToUninit as _,
        mem::MaybeUninit,
        num::NonZero,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::IdSlice;
    use crate::id::{Id as _, IdVec};

    hashql_macros::define_id! {
        #[id(crate = crate)]
        struct TestId(u32 is 0..=0xFFFF_FF00)
    }

    hashql_macros::define_id! {
        #[id(crate = crate)]
        struct FourElementId(u8 is 0..=3)
    }

    #[test]
    fn raw_views_const() {
        const VALUES: [u32; 3] = {
            let mut values = [10, 20, 30];
            let slice = IdSlice::<TestId, _>::from_raw_mut(&mut values);
            slice.as_raw_mut()[1] = 42;
            [slice.as_raw()[0], slice.as_raw()[1], slice.as_raw()[2]]
        };

        assert_eq!(VALUES, [10, 42, 30]);
    }

    #[test]
    fn from_raw_indexing() {
        let data = [10, 20, 30];
        let slice = IdSlice::<TestId, _>::from_raw(&data);

        assert_eq!(slice.len(), 3);
        assert_eq!(slice[TestId::from_usize(0)], 10);
        assert_eq!(slice[TestId::from_usize(1)], 20);
        assert_eq!(slice[TestId::from_usize(2)], 30);
    }

    #[test]
    fn from_raw_empty() {
        let data: [u32; 0] = [];
        let slice = IdSlice::<TestId, _>::from_raw(&data);

        assert!(slice.is_empty());
    }

    #[test]
    fn array_windows_enumerated_pairs_each_window_with_its_first_id() {
        let data = [10, 20, 30, 40];
        let slice = IdSlice::<TestId, _>::from_raw(&data);

        let windows: alloc::vec::Vec<_> = slice.windows_enumerated::<2>().collect();
        assert_eq!(
            windows,
            [
                (TestId::from_usize(0), &[10, 20]),
                (TestId::from_usize(1), &[20, 30]),
                (TestId::from_usize(2), &[30, 40]),
            ]
        );

        let mut reversed = slice.windows_enumerated::<2>().rev();
        assert_eq!(reversed.next(), Some((TestId::from_usize(2), &[30, 40])));
    }

    #[test]
    fn array_windows_enumerated_is_empty_on_a_short_slice() {
        let data = [10];
        let slice = IdSlice::<TestId, _>::from_raw(&data);

        assert_eq!(slice.windows_enumerated::<2>().len(), 0);
        assert_eq!(slice.windows_enumerated::<2>().next(), None);
    }

    #[test]
    fn chunks_enumerated_full_id_domain() {
        let mut data = [10, 20, 30, 40];
        let slice = IdSlice::<FourElementId, _>::from_raw(&data);
        let chunks: alloc::vec::Vec<_> = slice
            .chunks_enumerated(NonZero::new(2).expect("two is nonzero"))
            .collect();
        assert_eq!(
            chunks,
            [
                (FourElementId::new(0), &[10, 20][..]),
                (FourElementId::new(2), &[30, 40][..]),
            ]
        );

        let slice = IdSlice::<FourElementId, _>::from_raw_mut(&mut data);
        let starts: alloc::vec::Vec<_> = slice
            .chunks_enumerated_mut(NonZero::new(3).expect("three is nonzero"))
            .map(|(id, _)| id)
            .collect();
        assert_eq!(starts, [FourElementId::new(0), FourElementId::new(3)]);
    }

    #[test]
    #[should_panic(expected = "id value must be between 0<=3")]
    fn binary_search_after_full_id_domain() {
        let data = [10, 20, 30, 40];
        let slice = IdSlice::<FourElementId, _>::from_raw(&data);

        let _result = slice.binary_search(&50);
    }

    #[test]
    #[should_panic(expected = "id value must be between 0<=3")]
    fn partition_point_full_id_domain() {
        let data = [10, 20, 30, 40];
        let slice = IdSlice::<FourElementId, _>::from_raw(&data);

        let _partition = slice.partition_point(|_| true);
    }

    #[test]
    #[should_panic(expected = "id value must be between 0<=3")]
    fn bound_full_id_domain() {
        let data = [10, 20, 30, 40];
        let slice = IdSlice::<FourElementId, _>::from_raw(&data);

        let _bound = slice.bound();
    }

    #[cfg(feature = "rayon")]
    #[test]
    fn parallel_chunks_enumerated_full_id_domain() {
        use rayon::iter::ParallelIterator as _;

        let mut data = [10, 20, 30, 40];
        let slice = IdSlice::<FourElementId, _>::from_raw(&data);
        let chunks: alloc::vec::Vec<_> = slice
            .par_chunks_enumerated(NonZero::new(2).expect("two is nonzero"))
            .map(|(id, chunk)| (id, chunk.to_vec()))
            .collect();
        assert_eq!(
            chunks,
            [
                (FourElementId::new(0), alloc::vec![10, 20]),
                (FourElementId::new(2), alloc::vec![30, 40]),
            ]
        );

        let slice = IdSlice::<FourElementId, _>::from_raw_mut(&mut data);
        let starts: alloc::vec::Vec<_> = slice
            .par_chunks_enumerated_mut(NonZero::new(3).expect("three is nonzero"))
            .map(|(id, _)| id)
            .collect();
        assert_eq!(starts, [FourElementId::new(0), FourElementId::new(3)]);
    }

    #[test]
    fn from_raw_mut_modification() {
        let mut data = [1, 2, 3];
        let slice = IdSlice::<TestId, _>::from_raw_mut(&mut data);

        slice[TestId::from_usize(1)] = 42;

        assert_eq!(data[1], 42);
    }

    #[test]
    fn from_raw_mut_empty() {
        let mut data: [u32; 0] = [];
        let slice = IdSlice::<TestId, _>::from_raw_mut(&mut data);

        assert!(slice.is_empty());
    }

    #[test]
    fn from_boxed_slice_roundtrip() {
        let boxed: Box<[u32]> = Box::new([1, 2, 3]);
        let id_slice = IdSlice::<TestId, _>::from_boxed_slice(boxed);

        assert_eq!(id_slice.len(), 3);
        assert_eq!(id_slice[TestId::from_usize(0)], 1);
        assert_eq!(id_slice[TestId::from_usize(2)], 3);
    }

    #[test]
    fn from_boxed_slice_empty() {
        let boxed: Box<[u32]> = Box::new([]);
        let id_slice = IdSlice::<TestId, _>::from_boxed_slice(boxed);

        assert!(id_slice.is_empty());
    }

    #[test]
    fn boxed_assume_init_fully_initialized() {
        let mut uninit: Box<[MaybeUninit<u32>]> = Box::new_uninit_slice(4);
        for (i, slot) in uninit.iter_mut().enumerate() {
            slot.write(i as u32 * 10);
        }

        let id_slice = IdSlice::<TestId, _>::from_boxed_slice(uninit);
        // SAFETY: the loop above initializes all elements.
        let init = unsafe { IdSlice::boxed_assume_init(id_slice) };

        assert_eq!(init.len(), 4);
        assert_eq!(init[TestId::from_usize(0)], 0);
        assert_eq!(init[TestId::from_usize(3)], 30);
    }

    #[test]
    fn boxed_assume_init_empty() {
        let uninit: Box<[MaybeUninit<u32>]> = Box::new_uninit_slice(0);
        let id_slice = IdSlice::<TestId, _>::from_boxed_slice(uninit);
        // SAFETY: Empty slice is trivially initialized
        let init = unsafe { IdSlice::boxed_assume_init(id_slice) };

        assert!(init.is_empty());
    }

    #[test]
    fn clone_to_uninit_order() {
        let data = [10_u32, 20, 30];
        let source = IdSlice::<TestId, _>::from_raw(&data);
        let mut buffer: Box<[MaybeUninit<u32>]> = Box::new_uninit_slice(3);

        // SAFETY: `buffer` holds exactly `source.len()` slots of `u32` with `u32`'s alignment, and
        // `as_mut_ptr` points at its first byte.
        unsafe { source.clone_to_uninit(buffer.as_mut_ptr().cast::<u8>()) };

        let boxed = IdSlice::<TestId, _>::from_boxed_slice(buffer);
        // SAFETY: `clone_to_uninit` returned normally, which initializes every slot.
        let cloned = unsafe { IdSlice::boxed_assume_init(boxed) };

        assert_eq!(cloned.as_raw(), &[10, 20, 30]);
    }

    #[test]
    fn boxed_clone_shared() {
        let source: Box<IdSlice<TestId, Rc<u8>>> =
            IdVec::from_raw(alloc::vec![Rc::new(1), Rc::new(2)]).into_boxed_slice();
        let first = TestId::from_usize(0);
        let second = TestId::from_usize(1);

        let cloned = source.clone();

        assert!(Rc::ptr_eq(&source[first], &cloned[first]));
        assert!(Rc::ptr_eq(&source[second], &cloned[second]));
        assert_eq!(Rc::strong_count(&source[first]), 2);
        assert_eq!(Rc::strong_count(&source[second]), 2);
        drop(cloned);
        assert_eq!(Rc::strong_count(&source[first]), 1);
        assert_eq!(Rc::strong_count(&source[second]), 1);
    }

    #[test]
    fn boxed_clone_empty() {
        let source: Box<IdSlice<TestId, Rc<u8>>> = IdVec::new().into_boxed_slice();

        let cloned = source.clone();

        assert!(cloned.is_empty());
    }

    #[test]
    fn boxed_clone_aligned_zst() {
        static CLONES: AtomicUsize = AtomicUsize::new(0);

        #[repr(align(64))]
        struct Unit;

        impl Clone for Unit {
            fn clone(&self) -> Self {
                CLONES.fetch_add(1, Ordering::Relaxed);
                Self
            }
        }

        assert_eq!(core::mem::size_of::<Unit>(), 0);
        assert_eq!(core::mem::align_of::<Unit>(), 64);
        let source: Box<IdSlice<TestId, Unit>> =
            IdVec::from_raw(alloc::vec![Unit, Unit, Unit]).into_boxed_slice();

        let cloned = source.clone();

        assert_eq!(cloned.len(), 3);
        assert_eq!(CLONES.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn boxed_clone_aligned() {
        #[repr(align(64))]
        #[derive(Clone)]
        struct Aligned(u8);

        let source: Box<IdSlice<TestId, Aligned>> =
            IdVec::from_raw(alloc::vec![Aligned(1), Aligned(2)]).into_boxed_slice();

        let cloned = source.clone();

        assert_eq!(cloned.len(), 2);
        assert_eq!(cloned[TestId::from_usize(0)].0, 1);
        assert_eq!(cloned[TestId::from_usize(1)].0, 2);
        assert_eq!(cloned.as_raw().as_ptr().addr() % 64, 0);
    }

    #[test]
    fn boxed_clone_unwind() {
        static DROPS: AtomicUsize = AtomicUsize::new(0);

        struct PanicsOnThird(u8);

        impl Clone for PanicsOnThird {
            #[track_caller]
            fn clone(&self) -> Self {
                assert_ne!(self.0, 3, "third clone unwinds");
                Self(self.0)
            }
        }

        impl Drop for PanicsOnThird {
            fn drop(&mut self) {
                DROPS.fetch_add(1, Ordering::Relaxed);
            }
        }

        let source: Box<IdSlice<TestId, PanicsOnThird>> = IdVec::from_raw(alloc::vec![
            PanicsOnThird(1),
            PanicsOnThird(2),
            PanicsOnThird(3),
        ])
        .into_boxed_slice();

        let outcome = std::panic::catch_unwind(|| source.clone());

        assert!(outcome.is_err());
        assert_eq!(DROPS.load(Ordering::Relaxed), 2);
        drop(source);
        assert_eq!(DROPS.load(Ordering::Relaxed), 5);
    }
}
