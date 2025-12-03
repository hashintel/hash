use core::{
    fmt::{self, Debug},
    marker::PhantomData,
    ops::{Index, IndexMut},
    ptr,
    slice::{self, GetDisjointMutError, GetDisjointMutIndex, SliceIndex},
};

use super::{Id, index::IntoSliceIndex, vec::IdVec};

/// A slice that uses typed IDs for indexing instead of raw `usize` values.
///
/// `IdSlice<I, T>` is a transparent wrapper around `[T]` that enforces type-safe indexing
/// using ID types that implement the [`Id`] trait.
///
/// The API is not complete by design, new methods will be added as needed.
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::{IdSlice, Id as _}, newtype};
/// # newtype!(struct UserId(u32 is 0..=0xFFFF_FF00));
/// let data = [10, 20, 30];
/// let slice = IdSlice::<UserId, _>::from_raw(&data);
///
/// let user_id = UserId::from_usize(1);
/// assert_eq!(slice[user_id], 20);
/// ```
#[derive(PartialEq, Eq, PartialOrd, Ord, Hash)]
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
    /// Creates a reference to an empty `IdSlice`.
    #[inline]
    #[must_use]
    pub const fn empty<'this>() -> &'this Self {
        Self::from_raw(&[])
    }

    /// Creates an `IdSlice` from a raw slice reference.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw(raw: &[T]) -> &Self {
        // SAFETY: `IdSlice` is repr(transparent) and has the same layout as `[T]`.
        unsafe { &*(ptr::from_ref::<[T]>(raw) as *const Self) }
    }

    /// Creates a mutable `IdSlice` from a raw mutable slice reference.
    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw_mut(raw: &mut [T]) -> &mut Self {
        // SAFETY: `IdSlice` is repr(transparent) and has the same layout as `[T]`.
        unsafe { &mut *(ptr::from_mut(raw) as *mut Self) }
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

    /// Returns the number of elements in the slice.
    ///
    /// See [`slice::len`] for details.
    #[inline]
    pub const fn len(&self) -> usize {
        self.raw.len()
    }

    /// Returns the exclusive upper bound ID for this slice.
    ///
    /// This is equivalent to the ID that would be assigned to a new element if one were added.
    /// Useful for bounds checking: `id < slice.bound()` tests if `id` is valid for this slice.
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

    /// Returns an iterator over all valid IDs for this slice.
    ///
    /// The iterator yields IDs from 0 up to (but not including) `bound()`.
    pub fn ids(&self) -> impl DoubleEndedIterator<Item = I> + ExactSizeIterator + Clone + 'static {
        let length = self.len();

        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(length.saturating_sub(1));

        (0..length).map(I::from_usize)
    }

    /// Returns an iterator over the elements.
    ///
    /// See [`slice::iter`] for details.
    #[inline]
    pub fn iter(&self) -> slice::Iter<'_, T> {
        self.raw.iter()
    }

    /// Returns an iterator over ID-element pairs.
    ///
    /// Similar to [`Iterator::enumerate`] but yields typed IDs instead of `usize` indices.
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

    /// Returns a mutable iterator over the elements.
    ///
    /// See [`slice::iter_mut`] for details.
    #[inline]
    pub fn iter_mut(&mut self) -> slice::IterMut<'_, T> {
        self.raw.iter_mut()
    }

    /// Returns a mutable iterator over ID-element pairs.
    ///
    /// Similar to [`Iterator::enumerate`] but yields typed IDs instead of `usize` indices.
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

    /// Swaps two elements in the vector.
    ///
    /// See [`slice::swap`] for details.
    ///
    /// # Panics
    ///
    /// Panics if either `lhs` or `rhs` is out of bounds.
    ///
    /// [`slice::swap`]: slice::swap
    #[inline]
    pub fn swap(&mut self, lhs: I, rhs: I) {
        self.raw.swap(lhs.as_usize(), rhs.as_usize());
    }
}

impl<I, T> IdSlice<I, Option<T>>
where
    I: Id,
{
    /// Removes and returns the value at the given ID index.
    ///
    /// Returns `None` if the index is out of bounds or if the value was already `None`.
    /// The vector is not shrunk after removal.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
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

    /// Returns `true` if the vector contains a value (not `None`) at the given ID index.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
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
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(0), "hello".to_string());
    ///
    /// assert_eq!(vec.lookup(MyId::from_usize(0)), Some(&"hello".to_string()));
    /// assert_eq!(vec.lookup(MyId::from_usize(1)), None); // out of bounds
    /// ```
    pub fn lookup(&self, index: I) -> Option<&T> {
        self.get(index).and_then(Option::as_ref)
    }

    /// Gets a mutable reference to the inner value at `index`, if present.
    ///
    /// Returns [`None`] if the index is out of bounds or if the value at that index is [`None`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
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
    pub fn lookup_mut(&mut self, index: I) -> Option<&mut T> {
        self.get_mut(index).and_then(Option::as_mut)
    }
}

impl<I, T> Debug for IdSlice<I, T>
where
    I: Id,
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.raw, fmt)
    }
}

impl<I, T, R> Index<R> for IdSlice<I, T>
where
    R: IntoSliceIndex<I, [T]>,
{
    type Output = <R::SliceIndex as SliceIndex<[T]>>::Output;

    fn index(&self, index: R) -> &Self::Output {
        self.raw.index(index.into_slice_index())
    }
}

impl<I, T, R> IndexMut<R> for IdSlice<I, T>
where
    R: IntoSliceIndex<I, [T]>,
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
