use core::ops::Index;

use orx_concurrent_vec::{ConcurrentElement, ConcurrentVec};

use crate::id::{HasId, Id as _};

#[derive(Debug, Clone, PartialEq)]
pub struct ConcurrentArena<T> {
    items: ConcurrentVec<T>,
}

impl<T> ConcurrentArena<T> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            items: ConcurrentVec::new(),
        }
    }

    /// Adds an item to the arena using a builder function that receives the assigned ID.
    ///
    /// The caller must ensure that `T` is properly initialized with the assigned ID, and that
    /// `T::id` will return the same ID.
    ///
    /// # Returns
    ///
    /// The ID assigned to the newly added item.
    pub fn push_with(&self, item: impl FnOnce(T::Id) -> T) -> T::Id
    where
        T: HasId,
    {
        let index = self.items.push_for_idx(|index| {
            let id = T::Id::from_usize(index);

            let item = item(id);
            debug_assert_eq!(item.id(), id);

            item
        });

        T::Id::from_usize(index)
    }
}

impl<T> Index<T::Id> for ConcurrentArena<T>
where
    T: HasId,
{
    // I'd like to avoid exposing `orx_concurrent_vec` here, but there's sadly no other way to do
    // this.
    type Output = ConcurrentElement<T>;

    fn index(&self, index: T::Id) -> &Self::Output {
        &self.items[index.as_usize()]
    }
}

impl<T> Default for ConcurrentArena<T> {
    fn default() -> Self {
        Self::new()
    }
}
