use alloc::{alloc::Global, vec};
use core::{
    alloc::Allocator,
    borrow::{Borrow, BorrowMut},
    fmt::{self, Debug},
    marker::PhantomData,
    ops::{Deref, DerefMut},
};

use super::{Id, slice::IdSlice};

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct IdVec<I, T, A: Allocator = Global> {
    _marker: PhantomData<fn(&I)>,
    pub(crate) raw: Vec<T, A>,
}

impl<I, T> IdVec<I, T, Global>
where
    I: Id,
{
    #[inline]
    #[must_use]
    pub const fn new() -> Self {
        Self::from_raw(Vec::new())
    }

    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self::from_raw(Vec::with_capacity(capacity))
    }
}

impl<I, T, A> IdVec<I, T, A>
where
    I: Id,
    A: Allocator,
{
    #[inline]
    pub const fn from_raw(raw: Vec<T, A>) -> Self {
        Self {
            _marker: PhantomData,
            raw,
        }
    }

    #[inline]
    pub const fn new_in(alloc: A) -> Self {
        Self::from_raw(Vec::new_in(alloc))
    }

    #[inline]
    pub fn with_capacity_in(capacity: usize, alloc: A) -> Self {
        Self::from_raw(Vec::with_capacity_in(capacity, alloc))
    }

    #[inline]
    pub fn push(&mut self, value: T) -> I {
        let id = self.next_id();
        self.raw.push(value);
        id
    }

    #[inline]
    pub fn pop(&mut self) -> Option<T> {
        self.raw.pop()
    }

    #[inline]
    pub fn as_slice(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(&self.raw)
    }

    #[inline]
    pub fn as_slice_mut(&mut self) -> &mut IdSlice<I, T> {
        IdSlice::from_raw_mut(&mut self.raw)
    }

    // Additional methods are added as needed
}

// Map like API's for IdVec
impl<I, T> IdVec<I, Option<T>>
where
    I: Id,
{
    pub fn insert(&mut self, index: I, value: T) {
        // fill the vec with default values up to the index
        self.raw.resize_with(index.as_usize() + 1, || None);
        self.raw[index.as_usize()] = Some(value);
    }

    pub fn remove(&mut self, index: I) -> Option<T> {
        self.get_mut(index)?.take()
    }

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
