use alloc::{alloc::Global, vec};
use core::{
    alloc::Allocator,
    borrow::{Borrow, BorrowMut},
    cmp::Ordering,
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::{Deref, DerefMut},
};

use super::{Id, slice::IdSlice};

/// A growable vector that uses typed IDs for indexing instead of raw `usize` values.
///
/// `IdVec<I, T>` is a wrapper around `Vec<T>` that enforces type-safe indexing using ID types
/// that implement the [`Id`] trait.
///
/// The API is not complete by design, new methods will be added as needed.
///
/// # Examples
///
/// ```
/// # use hashql_core::{id::{IdVec, Id as _}, newtype};
/// # newtype!(struct UserId(u32 is 0..=0xFFFF_FF00));
/// let mut users = IdVec::<UserId, String>::new();
/// let user_id = users.push("Alice".to_string());
/// assert_eq!(users[user_id], "Alice");
/// ```
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "needed for `ToOwned` implementation"
)]
pub struct IdVec<I, T, A: Allocator = Global> {
    _marker: PhantomData<fn(&I)>,
    pub(crate) raw: Vec<T, A>,
}

#[coverage(off)] // reason: trivial implementation
impl<I, T> IdVec<I, T, Global>
where
    I: Id,
{
    /// Creates a new, empty `IdVec`.
    ///
    /// See [`Vec::new`] for details.
    #[inline]
    #[must_use]
    pub const fn new() -> Self {
        Self::from_raw(Vec::new())
    }

    /// Creates a new, empty `IdVec` with the specified capacity.
    ///
    /// See [`Vec::with_capacity`] for details.
    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self::from_raw(Vec::with_capacity(capacity))
    }
}

#[coverage(off)] // reason: trivial implementation
impl<I, T, A> IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    /// Creates an `IdVec` from a raw `Vec`.
    #[inline]
    pub const fn from_raw(raw: Vec<T, A>) -> Self {
        Self {
            _marker: PhantomData,
            raw,
        }
    }

    /// Creates a new, empty `IdVec` with a custom allocator.
    ///
    /// See [`Vec::new_in`] for details.
    #[inline]
    pub const fn new_in(alloc: A) -> Self {
        Self::from_raw(Vec::new_in(alloc))
    }

    /// Creates a new, empty `IdVec` with the specified capacity and a custom allocator.
    ///
    /// See [`Vec::with_capacity_in`] for details.
    #[inline]
    pub fn with_capacity_in(capacity: usize, alloc: A) -> Self {
        Self::from_raw(Vec::with_capacity_in(capacity, alloc))
    }

    /// Appends an element to the back of the vector and returns its ID.
    ///
    /// Unlike [`Vec::push`], this method returns the ID assigned to the pushed element.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, String>::new();
    /// let id = vec.push("hello".to_string());
    /// assert_eq!(vec[id], "hello");
    /// ```
    #[inline]
    pub fn push(&mut self, value: T) -> I {
        let id = self.bound();
        self.raw.push(value);
        id
    }

    /// Removes the last element from the vector and returns it, or `None` if empty.
    ///
    /// See [`Vec::pop`] for details.
    #[inline]
    pub fn pop(&mut self) -> Option<T> {
        self.raw.pop()
    }

    /// Extracts a slice containing the entire vector as an `IdSlice`.
    ///
    /// See [`Vec::as_slice`] for details.
    #[inline]
    pub fn as_slice(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(&self.raw)
    }

    /// Extracts a mutable slice containing the entire vector as an `IdSlice`.
    ///
    /// See [`Vec::as_mut_slice`] for details.
    #[inline]
    pub fn as_mut_slice(&mut self) -> &mut IdSlice<I, T> {
        IdSlice::from_raw_mut(&mut self.raw)
    }
}

// Map-like APIs for IdVec<I, Option<T>>
impl<I, T> IdVec<I, Option<T>>
where
    I: Id,
{
    /// Inserts a value at the given ID index, expanding the vector if necessary.
    ///
    /// If the vector is shorter than the index, it will be extended with `None` values.
    /// This enables sparse, map-like usage patterns.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// vec.insert(MyId::from_usize(5), "hello".to_string());
    /// assert_eq!(vec.len(), 6); // Extended to index 5
    /// assert!(vec[MyId::from_usize(0)].is_none());
    /// assert_eq!(vec[MyId::from_usize(5)].as_ref().unwrap(), "hello");
    /// ```
    pub fn insert(&mut self, index: I, value: T) {
        // fill the vec with default values up to the index
        self.raw.resize_with(index.as_usize() + 1, || None);
        self.raw[index.as_usize()] = Some(value);
    }

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
}

impl<I, T, A> Debug for IdVec<I, T, A>
where
    A: Allocator,
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.raw, fmt)
    }
}

impl<I, T, A> Clone for IdVec<I, T, A>
where
    T: Clone,
    A: Allocator + Clone,
{
    fn clone(&self) -> Self {
        Self {
            _marker: PhantomData,
            raw: self.raw.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        self.raw.clone_from(&source.raw);
    }
}

impl<I, T, A> PartialEq for IdVec<I, T, A>
where
    T: PartialEq,
    A: Allocator,
{
    fn eq(&self, other: &Self) -> bool {
        self.raw == other.raw
    }
}

impl<I, T, A> Eq for IdVec<I, T, A>
where
    T: Eq,
    A: Allocator,
{
}

impl<I, T, A> PartialOrd for IdVec<I, T, A>
where
    T: PartialOrd,
    A: Allocator,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.raw.partial_cmp(&other.raw)
    }
}

impl<I, T, A> Ord for IdVec<I, T, A>
where
    T: Ord,
    A: Allocator,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.raw.cmp(&other.raw)
    }
}

impl<I, T, A> Hash for IdVec<I, T, A>
where
    T: Hash,
    A: Allocator,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.raw.hash(state);
    }
}

impl<I, T, A> Deref for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    type Target = IdSlice<I, T>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        IdSlice::from_raw(&self.raw)
    }
}

impl<I, T, A> DerefMut for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    #[inline]
    fn deref_mut(&mut self) -> &mut Self::Target {
        IdSlice::from_raw_mut(&mut self.raw)
    }
}

impl<I, T, A> Borrow<IdSlice<I, T>> for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    #[inline]
    fn borrow(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(&self.raw)
    }
}

impl<I, T, A> BorrowMut<IdSlice<I, T>> for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    #[inline]
    fn borrow_mut(&mut self) -> &mut IdSlice<I, T> {
        IdSlice::from_raw_mut(&mut self.raw)
    }
}

impl<I, T, A> IntoIterator for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    type IntoIter = vec::IntoIter<T, A>;
    type Item = T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.into_iter()
    }
}

impl<I, T> Default for IdVec<I, T, Global>
where
    I: Id,
{
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}
