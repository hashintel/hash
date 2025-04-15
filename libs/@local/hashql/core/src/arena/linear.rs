use core::ops::Index;

use crate::id::{HasId, Id as _};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LinearArena<T> {
    // In theory we could chunks here instead, that'd require unsafe code, and therefore also
    // require to run miri.
    items: Vec<T>,
}

impl<T> LinearArena<T> {
    #[must_use]
    pub const fn new() -> Self {
        Self { items: Vec::new() }
    }

    const fn next_id(&self) -> usize {
        self.items.len()
    }

    pub fn push_with(&mut self, item: impl FnOnce(T::Id) -> T) -> T::Id
    where
        T: HasId,
    {
        let id = T::Id::from_usize(self.next_id());

        self.items.push(item(id));
        id
    }

    pub fn update(&mut self, item: T)
    where
        T: HasId,
    {
        let id = item.id();

        self.items[id.as_usize()] = item;
    }

    pub fn update_with(&mut self, id: T::Id, item: impl FnOnce(&mut T))
    where
        T: HasId,
    {
        item(&mut self.items[id.as_usize()]);
    }

    pub fn get(&self, id: T::Id) -> Option<&T>
    where
        T: HasId,
    {
        self.items.get(id.as_usize())
    }

    pub fn get_mut(&mut self, id: T::Id) -> Option<&mut T>
    where
        T: HasId,
    {
        self.items.get_mut(id.as_usize())
    }
}

impl<T> Index<T::Id> for LinearArena<T>
where
    T: HasId,
{
    type Output = T;

    fn index(&self, index: T::Id) -> &Self::Output {
        &self.items[index.as_usize()]
    }
}

impl<T> Default for LinearArena<T> {
    fn default() -> Self {
        Self::new()
    }
}
