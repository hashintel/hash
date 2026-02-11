use alloc::{alloc::Global, vec};
use core::{
    alloc::{AllocError, Allocator},
    borrow::{Borrow, BorrowMut},
    cmp::Ordering,
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::{Deref, DerefMut},
    slice,
};

use super::{Id, slice::IdSlice};
use crate::heap::{FromIteratorIn, TryCloneIn};

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

    /// Creates an `IdVec` with `size` elements, each initialized to `elem`.
    ///
    /// See [`vec!`] macro for details.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// let vec = IdVec::<MyId, i32>::from_elem(42, 5);
    /// assert_eq!(vec.len(), 5);
    /// assert_eq!(vec[MyId::new(0)], 42);
    /// ```
    pub fn from_elem(elem: T, size: usize) -> Self
    where
        T: Clone,
    {
        Self::from_raw(vec![elem; size])
    }

    /// Creates an `IdVec` by calling a closure on each ID in sequence.
    ///
    /// The closure is called with [`Id`] values from `I::from_usize(0)` up to
    /// `I::from_usize(size - 1)`, and the returned values are collected into the vector.
    ///
    /// # Panics
    ///
    /// Panics if `size` is outside the valid range for the ID type `I`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdVec, Id as _};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// // Create a vector where each element equals its index squared
    /// let vec = IdVec::<NodeId, u32>::from_fn(5, |id| id.as_u32() * id.as_u32());
    ///
    /// assert_eq!(vec.len(), 5);
    /// assert_eq!(vec[NodeId::new(0)], 0);  // 0 * 0
    /// assert_eq!(vec[NodeId::new(3)], 9);  // 3 * 3
    /// assert_eq!(vec[NodeId::new(4)], 16); // 4 * 4
    /// ```
    #[inline]
    #[must_use]
    pub fn from_fn(size: usize, func: impl FnMut(I) -> T) -> Self {
        Self::from_fn_in(size, func, Global)
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

    /// Reserves capacity for at least `additional` more elements to be inserted in the given
    /// `IdVec`.
    ///
    /// See [`Vec::reserve`] for details.
    #[inline]
    pub fn reserve(&mut self, additional: usize) {
        self.raw.reserve(additional);
    }

    /// Creates an `IdVec` with `size` elements initialized to `elem`, using a custom allocator.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// use std::alloc::Global;
    /// let vec = IdVec::<MyId, i32>::from_elem_in(42, 5, Global);
    /// assert_eq!(vec.len(), 5);
    /// ```
    #[inline]
    pub fn from_elem_in(elem: T, size: usize, alloc: A) -> Self
    where
        T: Clone,
    {
        Self::from_raw(alloc::vec::from_elem_in(elem, size, alloc))
    }

    /// Creates an `IdVec` with the same length as `domain`, with each element initialized to
    /// `elem`.
    ///
    /// This is useful for creating vectors with the same ID domain as an existing vector.
    /// The allocator is cloned from the domain vector.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// let domain = IdVec::<MyId, String>::from_elem("x".to_string(), 3);
    /// let vec = IdVec::<MyId, i32>::from_domain(0, &domain);
    /// assert_eq!(vec.len(), domain.len());
    /// ```
    #[inline]
    pub fn from_domain<U>(elem: T, domain: &IdVec<I, U, A>) -> Self
    where
        T: Clone,
        A: Clone,
    {
        Self::from_domain_in(elem, domain, domain.raw.allocator().clone())
    }

    #[inline]
    pub fn from_domain_derive<U>(func: impl FnMut(I, &U) -> T, domain: &IdVec<I, U, A>) -> Self
    where
        A: Clone,
    {
        Self::from_domain_derive_in(func, domain, domain.raw.allocator().clone())
    }

    /// Creates an `IdVec` with the same length as `domain`, initialized to `elem`, using a custom
    /// allocator.
    ///
    /// This is the allocator-aware version of [`from_domain`].
    ///
    /// [`from_domain`]: IdVec::from_domain
    #[inline]
    pub fn from_domain_in<U>(elem: T, domain: &IdSlice<I, U>, alloc: A) -> Self
    where
        T: Clone,
    {
        Self::from_raw(alloc::vec::from_elem_in(elem, domain.len(), alloc))
    }

    #[inline]
    pub fn from_domain_derive_in<U>(
        mut func: impl FnMut(I, &U) -> T,
        domain: &IdSlice<I, U>,
        alloc: A,
    ) -> Self {
        Self::from_fn_in(domain.len(), |index| func(index, &domain[index]), alloc)
    }

    /// Creates an `IdVec` by calling a closure on each ID in sequence, using a custom allocator.
    ///
    /// The closure is called with [`Id`] values from `I::from_usize(0)` up to
    /// `I::from_usize(size - 1)`, and the returned values are collected into the vector
    /// using the provided allocator.
    ///
    /// This is the allocator-aware version of [`from_fn`].
    ///
    /// # Panics
    ///
    /// Panics if `size` is outside the valid range for the ID type `I`.
    ///
    /// # Examples
    ///
    /// ```
    /// #![feature(allocator_api)]
    /// use hashql_core::id::{newtype, IdVec, Id as _};
    /// use std::alloc::Global;
    ///
    /// newtype!(struct ItemId(u32 is 0..=1000));
    ///
    /// // Create a lookup table with custom allocator
    /// let lookup = IdVec::<ItemId, String>::from_fn_in(
    ///     3,
    ///     |id| format!("item_{}", id.as_u32()),
    ///     Global
    /// );
    ///
    /// assert_eq!(lookup[ItemId::new(0)], "item_0");
    /// assert_eq!(lookup[ItemId::new(1)], "item_1");
    /// assert_eq!(lookup[ItemId::new(2)], "item_2");
    /// ```
    ///
    /// [`from_fn`]: IdVec::from_fn
    pub fn from_fn_in(size: usize, mut func: impl FnMut(I) -> T, alloc: A) -> Self {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(size.saturating_sub(1));

        let mut vec = Vec::with_capacity_in(size, alloc);

        for index in 0..size {
            vec.push(func(I::from_usize(index)));
        }

        Self::from_raw(vec)
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

    /// Appends an element created by calling `value` with the new ID, and returns that ID.
    ///
    /// This allows creating elements that depend on their own ID.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// let mut vec = IdVec::<MyId, String>::new();
    /// let id = vec.push_with(|id| format!("item_{}", id.as_u32()));
    /// assert_eq!(vec[id], "item_0");
    /// ```
    pub fn push_with(&mut self, value: impl FnOnce(I) -> T) -> I {
        let id = self.bound();
        self.raw.push(value(id));
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

    /// Ensures the vector is at least long enough to contain `index`, filling with `fill` as
    /// needed.
    ///
    /// Returns a mutable reference to the element at `index`. If the vector is too short,
    /// it is extended by calling `fill` repeatedly until it contains `index`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// let mut vec = IdVec::<MyId, i32>::new();
    /// let value = vec.fill_until(MyId::new(5), || 0);
    /// *value = 42;
    /// assert_eq!(vec.len(), 6);
    /// assert_eq!(vec[MyId::new(5)], 42);
    /// ```
    pub fn fill_until(&mut self, index: I, fill: impl FnMut() -> T) -> &mut T {
        let new_length = index.as_usize() + 1;

        if self.len() < new_length {
            self.raw.resize_with(new_length, fill);
        }

        &mut self[index]
    }

    /// Clears the vector, removing all elements.
    ///
    /// See [`Vec::clear`] for details.
    #[inline]
    pub fn clear(&mut self) {
        self.raw.clear();
    }

    /// Removes an element from the vector and returns it, replacing it with the last element.
    ///
    /// This does not preserve ordering, but runs in *O*(1) time.
    ///
    /// See [`Vec::swap_remove`] for details.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    #[inline]
    pub fn swap_remove(&mut self, index: I) -> T {
        self.raw.swap_remove(index.as_usize())
    }

    /// Shortens the vector, keeping only the first `index` elements.
    ///
    /// If `index` is greater than or equal to the vector's current length, this has no effect.
    ///
    /// See [`Vec::truncate`] for details.
    #[inline]
    pub fn truncate(&mut self, index: I) {
        self.raw.truncate(index.as_usize());
    }

    #[inline]
    pub fn extend_from_slice(&mut self, other: &IdSlice<I, T>)
    where
        T: Clone,
    {
        self.raw.extend_from_slice(other.as_raw());
    }

    #[inline]
    pub fn append(&mut self, other: &mut Self) {
        self.raw.append(&mut other.raw);
    }

    pub fn into_iter_enumerated(
        self,
    ) -> impl DoubleEndedIterator<Item = (I, T)> + ExactSizeIterator {
        // Elide bound checks from subsequent calls to `I::from_usize`
        let _: I = I::from_usize(self.len().saturating_sub(1));

        self.raw
            .into_iter()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }
}

// Map-like APIs for IdVec<I, Option<T>>
impl<I, T, A: Allocator> IdVec<I, Option<T>, A>
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
    pub fn insert(&mut self, index: I, value: T) -> Option<T> {
        self.fill_until(index, || None).replace(value)
    }

    /// Gets the value at `index`, or inserts one by calling `value` if it doesn't exist.
    ///
    /// This method works on `IdVec<I, Option<T>>` to provide map-like semantics.
    /// If the index is out of bounds or contains `None`, `value` is called to create
    /// a new element.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{id::{IdVec, Id as _}, newtype};
    /// # newtype!(struct MyId(u32 is 0..=100));
    /// let mut vec = IdVec::<MyId, Option<String>>::new();
    /// let value = vec.get_or_insert_with(MyId::new(2), || "hello".to_string());
    /// assert_eq!(value, "hello");
    /// assert_eq!(vec.len(), 3);
    /// ```
    pub fn get_or_insert_with(&mut self, index: I, value: impl FnOnce() -> T) -> &mut T {
        self.fill_until(index, || None).get_or_insert_with(value)
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

impl<I, T, U, A, B> PartialEq<IdVec<I, U, B>> for IdVec<I, T, A>
where
    T: PartialEq<U>,
    A: Allocator,
    B: Allocator,
{
    #[inline]
    fn eq(&self, other: &IdVec<I, U, B>) -> bool {
        self.raw == other.raw
    }
}

impl<I, T, A> Eq for IdVec<I, T, A>
where
    T: Eq,
    A: Allocator,
{
}

impl<I, T, A, B> PartialOrd<IdVec<I, T, B>> for IdVec<I, T, A>
where
    T: PartialOrd,
    A: Allocator,
    B: Allocator,
{
    #[inline]
    fn partial_cmp(&self, other: &IdVec<I, T, B>) -> Option<Ordering> {
        self.raw.partial_cmp(&other.raw)
    }
}

impl<I, T, A> Ord for IdVec<I, T, A>
where
    T: Ord,
    A: Allocator,
{
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.raw.cmp(&other.raw)
    }
}

impl<I, T, A> Hash for IdVec<I, T, A>
where
    T: Hash,
    A: Allocator,
{
    #[inline]
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

impl<'this, I, T, A> IntoIterator for &'this IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    type IntoIter = slice::Iter<'this, T>;
    type Item = &'this T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter()
    }
}

impl<'this, I, T, A> IntoIterator for &'this mut IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    type IntoIter = slice::IterMut<'this, T>;
    type Item = &'this mut T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter_mut()
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

impl<I, T, A: Allocator> Extend<T> for IdVec<I, T, A>
where
    I: Id,
{
    #[inline]
    fn extend<U: IntoIterator<Item = T>>(&mut self, iter: U) {
        self.raw.extend(iter);
    }

    #[inline]
    fn extend_one(&mut self, item: T) {
        self.raw.extend_one(item);
    }

    #[inline]
    fn extend_reserve(&mut self, additional: usize) {
        self.raw.extend_reserve(additional);
    }
}

impl<I, T, A, B> TryCloneIn<B> for IdVec<I, T, A>
where
    I: Id,
    T: Clone,
    A: Allocator,
    B: Allocator,
{
    type Cloned = IdVec<I, T, B>;

    #[inline]
    fn try_clone_in(&self, allocator: B) -> Result<Self::Cloned, AllocError> {
        self.raw.try_clone_in(allocator).map(IdVec::from_raw)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, allocator: B) -> Result<(), AllocError> {
        self.raw.try_clone_into(&mut into.raw, allocator)
    }
}

impl<I, T, A> FromIteratorIn<T, A> for IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    #[inline]
    fn from_iter_in<U>(iter: U, alloc: A) -> Self
    where
        U: IntoIterator<Item = T>,
    {
        Self::from_raw(Vec::from_iter_in(iter, alloc))
    }
}
