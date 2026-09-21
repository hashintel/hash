//! Interning of distinct values into one table addressed by insertion index.
//!
//! An [`InternTable`] stores each distinct value once and answers both directions: the
//! [`TableIndex`] of a value, and the value at an index.

use core::hash::{BuildHasher as _, Hash};

use hashbrown::HashTable;
use hashql_core::{
    collections::FastHasher,
    id::{Id as _, IdSlice, IdVec, newtype},
};
use moka::Equivalent;

newtype! {
    /// A reference to one interned value by its position in an [`InternTable`]'s insertion order.
    #[id(const)]
    pub(crate) struct TableIndex<T>(u32)
}

/// A table of distinct values keyed by [`TableIndex`].
///
/// Each distinct value interns once. [`intern`](Self::intern) and [`index_of`](Self::index_of)
/// find a value's index, and [`entries`](Self::entries) reads values by index.
#[derive(Debug)]
pub(crate) struct InternTable<T> {
    /// The hasher every lookup and insertion shares.
    hasher: FastHasher,
    /// Every interned value, in insertion order.
    table: IdVec<TableIndex<T>, T>,
    /// The index of every interned value, found through the value's hash.
    reverse: HashTable<TableIndex<T>>,
}

impl<T> InternTable<T>
where
    T: 'static,
{
    /// Creates an empty table.
    pub(crate) fn new() -> Self {
        Self {
            hasher: FastHasher::default(),
            table: IdVec::new(),
            reverse: HashTable::new(),
        }
    }

    /// Returns `value`'s table index, interning it if this is its first occurrence.
    ///
    /// # Panics
    ///
    /// Panics when a new distinct value's insertion index, the current table length, lies outside
    /// the range [`TableIndex`] represents.
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

    /// Returns the table index of a value equivalent to `value`, if the table holds one.
    ///
    /// The lookup hashes `value` as `K` and compares it against interned `T` values, which
    /// [`Equivalent`]'s contract supports: a key hashes as the value it compares equal to.
    pub(super) fn index_of<K>(&self, value: &K) -> Option<TableIndex<T>>
    where
        K: Equivalent<T> + Hash + ?Sized,
    {
        let hash = self.hasher.hash_one(value);

        self.reverse
            .find(hash, |&index| value.equivalent(&self.table[index]))
            .copied()
    }

    /// Borrows every interned value, in insertion order.
    pub(super) const fn entries(&self) -> &IdSlice<TableIndex<T>, T> {
        &self.table
    }

    /// Returns the number of distinct interned values.
    pub(super) const fn len(&self) -> usize {
        self.table.len()
    }

    /// Returns whether no value has been interned yet.
    pub(super) const fn is_empty(&self) -> bool {
        self.table.is_empty()
    }
}
