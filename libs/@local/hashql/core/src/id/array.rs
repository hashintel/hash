use core::{
    array,
    borrow::{Borrow, BorrowMut},
    cmp,
    fmt::{self, Debug},
    hash::{self, Hash},
    marker::PhantomData,
    ops::{Deref, DerefMut},
    slice,
};

use super::{Id, IdSlice};

/// A fixed-size array that uses typed IDs for indexing instead of raw `usize` values.
///
/// `IdArray<I, T, N>` is a wrapper around `[T; N]` that enforces type-safe indexing using ID types
/// that implement the [`Id`] trait. Unlike [`IdVec`], the size is known at compile time.
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::{IdArray, Id as _}, newtype};
/// # newtype!(struct TargetId(u32 is 0..=3));
/// // Create an array where each element is initialized based on its index
/// let costs = IdArray::<TargetId, u32, 4>::from_fn(|id| id.as_u32() * 10);
///
/// assert_eq!(costs[TargetId::new(0)], 0);
/// assert_eq!(costs[TargetId::new(2)], 20);
/// ```
///
/// [`IdVec`]: super::IdVec
pub struct IdArray<I, T, const N: usize> {
    raw: [T; N],
    _marker: PhantomData<fn(&I)>,
}

#[coverage(off)]
impl<I: Id, T, const N: usize> IdArray<I, T, N> {
    /// Creates an `IdArray` from a raw array.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array = IdArray::<SlotId, &str, 3>::from_raw(["a", "b", "c"]);
    /// assert_eq!(array[SlotId::new(1)], "b");
    /// ```
    #[inline]
    pub const fn from_raw(data: [T; N]) -> Self {
        Self {
            raw: data,
            _marker: PhantomData,
        }
    }

    /// Consumes the `IdArray` and returns the underlying raw array.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array = IdArray::<SlotId, i32, 3>::from_raw([1, 2, 3]);
    /// let raw: [i32; 3] = array.into_raw();
    /// assert_eq!(raw, [1, 2, 3]);
    /// ```
    #[inline]
    pub fn into_raw(self) -> [T; N] {
        self.raw
    }

    /// Creates an `IdArray` by calling a closure on each ID in sequence.
    ///
    /// The closure is called with [`Id`] values from `I::from_usize(0)` up to
    /// `I::from_usize(N - 1)`, and the returned values populate the array.
    ///
    /// # Panics
    ///
    /// Panics if `N` is outside the valid range for the ID type `I`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct NodeId(u32 is 0..=100));
    /// // Create an array where each element equals its index squared
    /// let squares = IdArray::<NodeId, u32, 5>::from_fn(|id| id.as_u32() * id.as_u32());
    ///
    /// assert_eq!(squares[NodeId::new(0)], 0);
    /// assert_eq!(squares[NodeId::new(3)], 9);
    /// assert_eq!(squares[NodeId::new(4)], 16);
    /// ```
    #[inline]
    pub fn from_fn(mut func: impl FnMut(I) -> T) -> Self {
        Self::from_raw(array::from_fn(|index| func(I::from_usize(index))))
    }

    /// Creates an `IdArray` with all elements initialized to `elem`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=4));
    /// let array = IdArray::<SlotId, i32, 5>::from_elem(42);
    ///
    /// assert_eq!(array[SlotId::new(0)], 42);
    /// assert_eq!(array[SlotId::new(4)], 42);
    /// ```
    #[inline]
    pub fn from_elem(elem: T) -> Self
    where
        T: Clone,
    {
        Self::from_raw(array::from_fn(|_| elem.clone()))
    }

    /// Borrows each element and returns an array of references.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array =
    ///     IdArray::<SlotId, String, 3>::from_raw(["a".to_string(), "b".to_string(), "c".to_string()]);
    /// let refs: IdArray<SlotId, &String, 3> = array.each_ref();
    /// assert_eq!(refs[SlotId::new(1)], "b");
    /// ```
    #[inline]
    pub const fn each_ref(&self) -> IdArray<I, &T, N> {
        IdArray::from_raw(self.raw.each_ref())
    }

    /// Borrows each element mutably and returns an array of mutable references.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let mut array = IdArray::<SlotId, i32, 3>::from_raw([1, 2, 3]);
    /// for elem in array.each_mut().into_raw() {
    ///     *elem *= 2;
    /// }
    /// assert_eq!(array[SlotId::new(0)], 2);
    /// assert_eq!(array[SlotId::new(2)], 6);
    /// ```
    #[inline]
    pub const fn each_mut(&mut self) -> IdArray<I, &mut T, N> {
        IdArray::from_raw(self.raw.each_mut())
    }

    /// Transforms each element using the provided closure.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array = IdArray::<SlotId, i32, 3>::from_raw([1, 2, 3]);
    /// let doubled: IdArray<SlotId, i32, 3> = array.map(|x| x * 2);
    ///
    /// assert_eq!(doubled[SlotId::new(0)], 2);
    /// assert_eq!(doubled[SlotId::new(2)], 6);
    /// ```
    #[inline]
    pub fn map<U>(self, func: impl FnMut(T) -> U) -> IdArray<I, U, N> {
        IdArray::from_raw(self.raw.map(func))
    }

    /// Transforms each element using a closure that also receives the element's ID.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=100));
    /// let array = IdArray::<SlotId, i32, 3>::from_raw([10, 20, 30]);
    /// let indexed: IdArray<SlotId, String, 3> =
    ///     array.map_enumerated(|id, val| format!("{}:{}", id.as_u32(), val));
    ///
    /// assert_eq!(indexed[SlotId::new(0)], "0:10");
    /// assert_eq!(indexed[SlotId::new(2)], "2:30");
    /// ```
    #[inline]
    pub fn map_enumerated<U>(self, mut func: impl FnMut(I, T) -> U) -> IdArray<I, U, N> {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        let mut index = 0;
        IdArray::from_raw(self.raw.map(|elem| {
            let value = func(I::from_usize(index), elem);
            index += 1;
            value
        }))
    }

    /// Extracts a slice containing the entire array as an [`IdSlice`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array = IdArray::<SlotId, i32, 3>::from_raw([1, 2, 3]);
    /// let slice = array.as_slice();
    ///
    /// assert_eq!(slice.len(), 3);
    /// assert_eq!(slice[SlotId::new(1)], 2);
    /// ```
    #[inline]
    pub const fn as_slice(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(&self.raw)
    }

    /// Extracts a mutable slice containing the entire array as an [`IdSlice`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let mut array = IdArray::<SlotId, i32, 3>::from_raw([1, 2, 3]);
    /// array.as_mut_slice()[SlotId::new(1)] = 42;
    ///
    /// assert_eq!(array[SlotId::new(1)], 42);
    /// ```
    #[inline]
    pub const fn as_mut_slice(&mut self) -> &mut IdSlice<I, T> {
        IdSlice::from_raw_mut(&mut self.raw)
    }

    /// Returns an iterator over ID-element pairs, consuming the array.
    ///
    /// Similar to [`Iterator::enumerate`] but yields typed IDs instead of `usize` indices.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdArray, Id as _}, newtype};
    /// # newtype!(struct SlotId(u32 is 0..=2));
    /// let array = IdArray::<SlotId, &str, 3>::from_raw(["a", "b", "c"]);
    /// let pairs: Vec<_> = array.into_iter_enumerated().collect();
    ///
    /// assert_eq!(pairs[0], (SlotId::new(0), "a"));
    /// assert_eq!(pairs[2], (SlotId::new(2), "c"));
    /// ```
    #[inline]
    pub fn into_iter_enumerated(
        self,
    ) -> impl IntoIterator<Item = (I, T), IntoIter: ExactSizeIterator> {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .into_iter()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }
}

impl<I, T, const N: usize> Debug for IdArray<I, T, N>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.raw, fmt)
    }
}

impl<I, T, const N: usize> Copy for IdArray<I, T, N> where T: Copy {}
impl<I, T, const N: usize> Clone for IdArray<I, T, N>
where
    T: Clone,
{
    #[inline]
    fn clone(&self) -> Self {
        Self {
            _marker: PhantomData,
            raw: self.raw.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        self.raw.clone_from(&source.raw);
    }
}

impl<I, T, U, const N: usize> PartialEq<IdArray<I, U, N>> for IdArray<I, T, N>
where
    T: PartialEq<U>,
{
    #[inline]
    fn eq(&self, other: &IdArray<I, U, N>) -> bool {
        self.raw == other.raw
    }
}

impl<I, T, const N: usize> Eq for IdArray<I, T, N> where T: Eq {}

impl<I, T, const N: usize> PartialOrd<Self> for IdArray<I, T, N>
where
    T: PartialOrd,
{
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        self.raw.partial_cmp(&other.raw)
    }
}

impl<I, T, const N: usize> Ord for IdArray<I, T, N>
where
    T: Ord,
{
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.raw.cmp(&other.raw)
    }
}

impl<I, T, const N: usize> Hash for IdArray<I, T, N>
where
    T: Hash,
{
    #[inline]
    fn hash<H: hash::Hasher>(&self, state: &mut H) {
        self.raw.hash(state);
    }
}

impl<I, T, const N: usize> Default for IdArray<I, T, N>
where
    I: Id,
    [T; N]: Default,
{
    #[inline]
    fn default() -> Self {
        Self::from_raw(Default::default())
    }
}

impl<I, T, const N: usize> Deref for IdArray<I, T, N>
where
    I: Id,
{
    type Target = IdSlice<I, T>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        IdSlice::from_raw(&self.raw)
    }
}

impl<I, T, const N: usize> DerefMut for IdArray<I, T, N>
where
    I: Id,
{
    #[inline]
    fn deref_mut(&mut self) -> &mut Self::Target {
        IdSlice::from_raw_mut(&mut self.raw)
    }
}

impl<I, T, const N: usize> Borrow<IdSlice<I, T>> for IdArray<I, T, N>
where
    I: Id,
{
    #[inline]
    fn borrow(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(&self.raw)
    }
}

impl<I, T, const N: usize> BorrowMut<IdSlice<I, T>> for IdArray<I, T, N>
where
    I: Id,
{
    #[inline]
    fn borrow_mut(&mut self) -> &mut IdSlice<I, T> {
        IdSlice::from_raw_mut(&mut self.raw)
    }
}

impl<I, T, const N: usize> IntoIterator for IdArray<I, T, N>
where
    I: Id,
{
    type IntoIter = array::IntoIter<T, N>;
    type Item = T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.into_iter()
    }
}

impl<'this, I, T, const N: usize> IntoIterator for &'this IdArray<I, T, N>
where
    I: Id,
{
    type IntoIter = slice::Iter<'this, T>;
    type Item = &'this T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter()
    }
}

impl<'this, I, T, const N: usize> IntoIterator for &'this mut IdArray<I, T, N>
where
    I: Id,
{
    type IntoIter = slice::IterMut<'this, T>;
    type Item = &'this mut T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter_mut()
    }
}
