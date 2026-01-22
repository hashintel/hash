use core::{iter, marker::PhantomData};

pub trait ExactSizeIntoIterator {
    type Item;

    const GUARANTEED_EMPTY: bool;

    fn into_iter(self) -> impl ExactSizeIterator<Item = Self::Item>;
}

pub struct EmptyIntoIter<T> {
    marker: PhantomData<T>,
}

impl<T> EmptyIntoIter<T> {
    pub const fn new() -> Self {
        Self {
            marker: PhantomData,
        }
    }
}

impl<T> ExactSizeIntoIterator for EmptyIntoIter<T> {
    type Item = T;

    const GUARANTEED_EMPTY: bool = true;

    fn into_iter(self) -> impl ExactSizeIterator<Item = Self::Item> {
        iter::empty()
    }
}

impl<I> ExactSizeIntoIterator for I
where
    I: ExactSizeIterator,
{
    type Item = I::Item;

    const GUARANTEED_EMPTY: bool = false;

    fn into_iter(self) -> impl ExactSizeIterator<Item = Self::Item> {
        self
    }
}
