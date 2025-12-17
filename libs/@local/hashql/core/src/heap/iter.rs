//! Allocator-aware iterator collection.

use core::alloc::Allocator;

/// Construct a collection from an iterator using the provided allocator.
///
/// Allocator-aware equivalent of [`FromIterator`].
pub trait FromIteratorIn<T, A: Allocator> {
    /// Creates a collection from an iterator, allocating in `alloc`.
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>;
}

impl<T, A: Allocator> FromIteratorIn<T, A> for Vec<T, A> {
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>,
    {
        let mut vec = Self::new_in(alloc);
        vec.extend(iter);
        vec
    }
}

/// Extension trait for collecting iterators into allocator-aware containers.
///
/// Provides [`collect_in`](Self::collect_in), analogous to [`Iterator::collect`]
/// but with an explicit allocator parameter.
pub trait CollectIn<C, A: Allocator> {
    /// Collects the iterator into a container using the given allocator.
    fn collect_in(self, alloc: A) -> C;
}

impl<I, C: FromIteratorIn<T, A>, T, A: Allocator> CollectIn<C, A> for I
where
    I: IntoIterator<Item = T>,
{
    fn collect_in(self, alloc: A) -> C {
        C::from_iter_in(self, alloc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::heap::Heap;

    #[test]
    fn collect_range_into_vec() {
        let heap = Heap::new();
        let vec: Vec<i32, &Heap> = (0..5).collect_in(&heap);

        assert_eq!(vec.as_slice(), &[0, 1, 2, 3, 4]);
    }

    #[test]
    fn collect_mapped_iterator() {
        let heap = Heap::new();
        let vec: Vec<i32, &Heap> = [1, 2, 3].iter().map(|x| x * 2).collect_in(&heap);

        assert_eq!(vec.as_slice(), &[2, 4, 6]);
    }

    #[expect(clippy::integer_division_remainder_used)]
    #[test]
    fn collect_filtered_iterator() {
        let heap = Heap::new();
        let vec: Vec<i32, &Heap> = (0..10).filter(|x| x % 2 == 0).collect_in(&heap);

        assert_eq!(vec.as_slice(), &[0, 2, 4, 6, 8]);
    }

    #[test]
    fn from_iter_in_directly() {
        let heap = Heap::new();
        let vec: Vec<char, &Heap> = Vec::from_iter_in(['a', 'b', 'c'], &heap);

        assert_eq!(vec.as_slice(), &['a', 'b', 'c']);
    }

    #[test]
    fn collect_empty_iterator() {
        let heap = Heap::new();
        let vec: Vec<u8, &Heap> = core::iter::empty().collect_in(&heap);

        assert!(vec.is_empty());
    }
}
