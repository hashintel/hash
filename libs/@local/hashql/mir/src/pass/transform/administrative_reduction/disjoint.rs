use core::{
    marker::PhantomData,
    ops::{Index, IndexMut},
};

use hashql_core::id::{Id, IdSlice};

pub(crate) struct DisjointIdSlice<'slice, I, T> {
    left: &'slice mut [T],
    right: &'slice mut [T],

    _marker: PhantomData<fn(&I)>,
}

impl<'slice, I, T> DisjointIdSlice<'slice, I, T>
where
    I: Id,
{
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

    pub(crate) fn reborrow<'this: 'slice>(&'this mut self) -> DisjointIdSlice<'this, I, T> {
        Self {
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
