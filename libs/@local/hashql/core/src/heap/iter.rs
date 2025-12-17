//! Iterator collection with custom allocators.
//!
//! This module provides allocator-aware versions of [`FromIterator`] and the
//! [`Iterator::collect`] method. These enable collecting iterator results into
//! containers that use a specific allocator.
//!
//! # Relationship to Standard Traits
//!
//! | Standard Trait/Method       | Allocator-Aware Equivalent |
//! |-----------------------------|---------------------------|
//! | [`FromIterator<T>`]         | [`FromIteratorIn<T, A>`]  |
//! | [`Iterator::collect`]       | [`CollectIn::collect_in`] |
//!
//! # Example
//!
//! ```ignore
//! use hashql_core::heap::{Heap, CollectIn, Vec};
//!
//! let heap = Heap::new();
//! let numbers: Vec<'_, i32> = (0..10).collect_in(&heap);
//! ```

use core::alloc::Allocator;

/// Construct a collection from an iterator using the provided allocator.
///
/// This is the allocator-aware equivalent of [`FromIterator`]. Implement this
/// trait for collection types that can be built from an iterator using a
/// custom allocator.
pub trait FromIteratorIn<T, A: Allocator> {
    /// Creates a collection from an iterator, allocating in `alloc`.
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>;
}

/// Collects an [`Vec`] from an iterator using the provided allocator.
///
/// The vector is created empty and then extended with the iterator's elements.
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
/// This provides the [`collect_in`](Self::collect_in) method, which is analogous
/// to [`Iterator::collect`] but takes an explicit allocator parameter.
///
/// # Example
///
/// ```ignore
/// use hashql_core::heap::{Heap, CollectIn};
///
/// let heap = Heap::new();
///
/// // Collect into a heap-allocated Vec
/// let squared: heap::Vec<'_, i32> = (1..=5)
///     .map(|x| x * x)
///     .collect_in(&heap);
/// ```
pub trait CollectIn<C, A: Allocator> {
    /// Collects the iterator into a container using the given allocator.
    fn collect_in(self, alloc: A) -> C;
}

/// Blanket implementation: any iterator can be collected into any container
/// that implements [`FromIteratorIn`].
impl<I, C: FromIteratorIn<T, A>, T, A: Allocator> CollectIn<C, A> for I
where
    I: IntoIterator<Item = T>,
{
    fn collect_in(self, alloc: A) -> C {
        C::from_iter_in(self, alloc)
    }
}
