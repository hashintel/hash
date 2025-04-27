use core::{fmt::Debug, hash::Hash};

use super::Interned;
use crate::{collection::ConcurrentHashSet, heap::Heap};

#[derive(derive_more::Debug)]
#[debug(bound(T: Eq))]
pub struct InternSet<'heap, T: ?Sized> {
    // scc::HashMap isn't ideal for our purpose here, but allows us to re-use dependencies, for a
    // single threaded (or few-threaded) workload a `DashMap` performs better, even better would
    // likely be the change to something similar as the original implementation in rustc, which
    // uses the hashbrown `HashTable` in conjunction with a `RefCell`/`Mutex` to provide interior
    // mutability. This option would increase the required code (and therefore maintenance) by
    // quite a bit. For our use case, as we only have short periods of time where we need to
    // access the set, this would likely result in a significant performance improvement.
    // Should this ever become a bottleneck, we can consider alternatives.
    inner: ConcurrentHashSet<&'heap T>,
    heap: &'heap Heap,
}

impl<'heap, T: ?Sized> InternSet<'heap, T> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            inner: ConcurrentHashSet::default(),
            heap,
        }
    }
}

impl<'heap, T: ?Sized + Eq + Hash> InternSet<'heap, T> {
    fn insert(&self, value: &'heap T) -> Interned<'heap, T> {
        if self.inner.insert(value) == Ok(()) {
            Interned::new_unchecked(value)
        } else {
            tracing::debug!("concurrent insertion detected, using existing value");

            // We never remove so we know this is going to work
            let value = self
                .inner
                .read(value, |kind| *kind)
                .unwrap_or_else(|| unreachable!());

            Interned::new_unchecked(value)
        }
    }
}

impl<'heap, T> InternSet<'heap, T>
where
    T: Eq + Hash,
{
    #[expect(clippy::option_if_let_else, reason = "readability")]
    pub fn intern(&self, value: T) -> Interned<'heap, T> {
        const { assert!(!core::mem::needs_drop::<T>()) };
        const { assert!(core::mem::size_of::<T>() != 0) };

        if let Some(value) = self.inner.read(&value, |value| *value) {
            Interned::new_unchecked(value)
        } else {
            let value = self.heap.alloc(value);

            self.insert(value)
        }
    }
}

impl<'heap, T> InternSet<'heap, [T]>
where
    T: Debug + Copy + Eq + Hash,
{
    #[expect(clippy::option_if_let_else, reason = "readability")]
    pub fn intern_slice(&self, value: &[T]) -> Interned<'heap, [T]> {
        const { assert!(!core::mem::needs_drop::<T>()) };
        const { assert!(core::mem::size_of::<T>() != 0) };

        if let Some(value) = self.inner.read(value, |value| *value) {
            Interned::new_unchecked(value)
        } else {
            let value = self.heap.slice(value);

            self.insert(value)
        }
    }
}
