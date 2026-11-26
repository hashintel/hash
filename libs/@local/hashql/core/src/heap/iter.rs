use alloc::vec::Vec;
use core::alloc::Allocator;

/// [`FromIterator`] with an allocator argument.
///
/// Implement it for a collection, and call it through [`CollectIn::collect_in`].
pub trait FromIteratorIn<T, A: Allocator>: Sized {
    /// Builds the collection in `alloc` from the items of `iter`.
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>;
}

impl<T, A: Allocator> FromIteratorIn<T, A> for Vec<T, A> {
    #[inline]
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>,
    {
        let mut vec = Self::new_in(alloc);
        vec.extend(iter);

        vec
    }
}

/// [`Iterator::collect`] with an allocator argument.
///
/// Every [`Iterator`] implements this trait.
///
/// # Example
///
/// ```
/// use hashql_core::heap::{CollectIn as _, Scratch};
///
/// let scratch = Scratch::new();
///
/// let squares: Vec<u32, &Scratch> = (1..=3_u32).map(|value| value * value).collect_in(&scratch);
///
/// assert_eq!(squares, [1, 4, 9]);
/// ```
pub trait CollectIn<A: Allocator>: Iterator + Sized {
    /// Collects the items of the iterator into a `C` in `alloc`.
    ///
    /// Name the collection in the type of the binding or in the turbofish, as in
    /// `collect_in::<Vec<_, _>>(alloc)`.
    fn collect_in<C>(self, alloc: A) -> C
    where
        C: FromIteratorIn<Self::Item, A>;
}

impl<I, A: Allocator> CollectIn<A> for I
where
    I: Iterator,
{
    #[inline]
    fn collect_in<C>(self, alloc: A) -> C
    where
        C: FromIteratorIn<I::Item, A>,
    {
        C::from_iter_in(self, alloc)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{alloc::Global, vec::Vec};

    use super::{CollectIn as _, FromIteratorIn as _};
    use crate::heap::Scratch;

    #[test]
    fn collect_in_arena() {
        let scratch = Scratch::new();

        let doubled: Vec<u32, &Scratch> = [1_u32, 2, 3]
            .iter()
            .map(|value| value * 2)
            .collect_in(&scratch);

        assert_eq!(doubled, [2, 4, 6]);
    }

    #[test]
    fn collect_in_turbofish() {
        let squares = (1_u32..4)
            .map(|value| value * value)
            .collect_in::<Vec<_, _>>(Global);

        assert_eq!(squares, [1, 4, 9]);
    }

    #[test]
    fn from_iter_in_empty() {
        let scratch = Scratch::new();

        let empty = Vec::<u8, _>::from_iter_in([], &scratch);

        assert_eq!(empty, [] as [u8; 0]);
    }
}
