use core::hash::{BuildHasher as _, Hash};

use hashbrown::HashTable;
use hashql_core::{
    collections::FastHasher,
    id::{Id, IdSlice, IdVec, newtype},
};
use moka::Equivalent;

newtype! {
    #[id(const)]
    pub(crate) struct TableIndex<T>(u32)
}

#[derive(Debug)]
pub(crate) struct InternTable<T> {
    hasher: FastHasher,
    table: IdVec<TableIndex<T>, T>,
    reverse: HashTable<TableIndex<T>>,
}

impl<T> InternTable<T>
where
    T: 'static,
{
    pub(crate) fn new() -> Self {
        Self {
            hasher: FastHasher::default(),
            table: IdVec::new(),
            reverse: HashTable::new(),
        }
    }

    pub(crate) fn intern(&mut self, value: T) -> TableIndex<T>
    where
        T: Hash + PartialEq,
    {
        let hash = self.hasher.hash_one(&value);

        if let Some(&value) = self.reverse.find(hash, |&index| self.table[index] == value) {
            value
        } else {
            let index = TableIndex::from_usize(self.table.len());

            self.table.push(value);
            self.reverse.insert_unique(hash, index, |&index| {
                self.hasher.hash_one(&self.table[index])
            });

            index
        }
    }

    pub(super) fn index_of<K>(&self, value: &K) -> Option<TableIndex<T>>
    where
        K: Equivalent<T> + Hash + ?Sized,
    {
        let hash = self.hasher.hash_one(value);

        self.reverse
            .find(hash, |&index| value.equivalent(&self.table[index]))
            .copied()
    }

    pub(super) const fn entries(&self) -> &IdSlice<TableIndex<T>, T> {
        &self.table
    }

    pub(super) const fn len(&self) -> usize {
        self.table.len()
    }

    pub(super) const fn is_empty(&self) -> bool {
        self.table.is_empty()
    }
}
