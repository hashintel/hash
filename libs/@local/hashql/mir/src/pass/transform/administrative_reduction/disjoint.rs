//! Split-borrow abstraction for mutating one element while accessing others.
//!
//! This module provides [`DisjointIdSlice`], which enables a common pattern in MIR passes:
//! mutating one body while reading from other bodies (e.g., for inlining).

use core::{
    marker::PhantomData,
    ops::{Index, IndexMut},
};

use hashql_core::id::{Id, IdSlice};

/// A view into an [`IdSlice`] that excludes one element, enabling split borrows.
///
/// When transforming body `A` and needing to read from callee body `B`, Rust's borrow checker
/// normally prevents having `&mut bodies[A]` and `&bodies[B]` simultaneously. This type solves
/// that by splitting the slice around the excluded element:
///
/// ```text
/// Original:  [0] [1] [2] [3] [4]
///                     ^ excluded (at=2)
/// Result:    left=[0,1]  mid=&mut[2]  right=[3,4]
/// ```
///
/// The returned `DisjointIdSlice` can index into `left` or `right`, but panics if you try to
/// access the excluded element.
pub(crate) struct DisjointIdSlice<'slice, I, T> {
    left: &'slice mut [T],
    right: &'slice mut [T],

    _marker: PhantomData<fn(&I)>,
}

impl<'slice, I, T> DisjointIdSlice<'slice, I, T>
where
    I: Id,
{
    /// Splits an `IdSlice` at the given index, returning the excluded element and a
    /// `DisjointIdSlice` for accessing all other elements.
    ///
    /// # Returns
    ///
    /// A tuple of:
    /// - `&mut T`: Exclusive mutable reference to the element at `at`
    /// - `DisjointIdSlice`: View of all other elements (can be indexed normally)
    pub(crate) fn new(slice: &'slice mut IdSlice<I, T>, at: I) -> (&'slice mut T, Self) {
        let (left, right) = slice.as_raw_mut().split_at_mut(at.as_usize());
        let [mid, right @ ..] = right else {
            unreachable!("right slice is always non-empty")
        };

        (
            mid,
            Self {
                left,
                right,
                _marker: PhantomData,
            },
        )
    }

    /// Creates a shorter-lived reborrow of this slice.
    ///
    /// Useful for passing into functions that need ownership of a `DisjointIdSlice`
    /// without consuming the original.
    pub(crate) fn reborrow(&mut self) -> DisjointIdSlice<'_, I, T> {
        DisjointIdSlice {
            left: self.left,
            right: self.right,
            _marker: PhantomData,
        }
    }
}

impl<I, T> Index<I> for DisjointIdSlice<'_, I, T>
where
    I: Id,
{
    type Output = T;

    fn index(&self, index: I) -> &Self::Output {
        assert!(index.as_usize() != self.left.len(), "index out of bounds");

        if index.as_usize() < self.left.len() {
            &self.left[index.as_usize()]
        } else {
            &self.right[index.as_usize() - self.left.len() - 1]
        }
    }
}

impl<I, T> IndexMut<I> for DisjointIdSlice<'_, I, T>
where
    I: Id,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        assert!(index.as_usize() != self.left.len(), "index out of bounds");

        if index.as_usize() < self.left.len() {
            &mut self.left[index.as_usize()]
        } else {
            &mut self.right[index.as_usize() - self.left.len() - 1]
        }
    }
}
