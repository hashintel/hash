//! Provides structs that behave as *thread-sendable* guards for the read/write locks on the batches
//! in pools.

use std::{
    ops::{Deref, DerefMut, Index, IndexMut},
    slice::SliceIndex,
};

use crate::datastore::table::proxy::{BatchReadProxy, BatchWriteProxy};

/// Collects [`BatchReadProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolReadProxy<K> {
    // TODO: Remove `pub(super)` by providing parallel iterator
    pub(super) batches: Vec<BatchReadProxy<K>>,
}

impl<K> PoolReadProxy<K> {
    pub fn deconstruct(self) -> Vec<BatchReadProxy<K>> {
        self.batches
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn batch(&self, index: usize) -> Option<&K> {
        self.batches.get(index).map(Deref::deref)
    }

    // TODO: Use a concrete type, e.g.
    //   struct BatchIter<'b, B + 'b> {
    //       iter: std::slice::Iter<'b, BatchReadProxy<B>>,
    //   }
    pub fn batches_iter(&self) -> impl Iterator<Item = &K> {
        self.batches.iter().map(Deref::deref)
    }

    // TODO: Remove and use `batches_iter` instead
    pub fn batches(&self) -> Vec<&K> {
        self.batches_iter().collect()
    }
}

impl<K> Clone for PoolReadProxy<K> {
    fn clone(&self) -> Self {
        Self {
            batches: self.batches.to_vec(),
        }
    }
}

impl<K> FromIterator<BatchReadProxy<K>> for PoolReadProxy<K> {
    fn from_iter<T: IntoIterator<Item = BatchReadProxy<K>>>(iter: T) -> Self {
        Self {
            batches: Vec::from_iter(iter),
        }
    }
}

impl<K> From<Vec<BatchReadProxy<K>>> for PoolReadProxy<K> {
    fn from(batches: Vec<BatchReadProxy<K>>) -> Self {
        Self { batches }
    }
}

impl<I, K> Index<I> for PoolReadProxy<K>
where
    I: SliceIndex<[BatchReadProxy<K>]>,
{
    type Output = I::Output;

    fn index(&self, index: I) -> &Self::Output {
        self.batches.index(index)
    }
}

/// Collects [`BatchWriteProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolWriteProxy<K> {
    batches: Vec<BatchWriteProxy<K>>,
}

impl<K> PoolWriteProxy<K> {
    pub fn deconstruct(self) -> Vec<BatchWriteProxy<K>> {
        self.batches
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    // TODO: UNUSED: Needs triage
    pub fn batch(&self, index: usize) -> Option<&K> {
        self.batches.get(index).map(Deref::deref)
    }

    pub fn batch_mut(&mut self, index: usize) -> Option<&mut K> {
        self.batches.get_mut(index).map(DerefMut::deref_mut)
    }

    pub fn batches_iter(&self) -> impl Iterator<Item = &K> {
        self.batches.iter().map(Deref::deref)
    }

    pub fn batches_iter_mut(&mut self) -> impl Iterator<Item = &mut K> {
        self.batches.iter_mut().map(DerefMut::deref_mut)
    }

    // TODO: Remove and use `batches_iter` instead
    pub fn batches(&self) -> Vec<&K> {
        self.batches_iter().collect()
    }

    pub fn batches_mut(&mut self) -> Vec<&mut K> {
        self.batches_iter_mut().collect()
    }

    /// For each batch, downgrade write access to read access.
    // TODO: UNUSED: Needs triage
    pub fn downgrade(self) -> PoolReadProxy<K> {
        PoolReadProxy {
            batches: self
                .batches
                .into_iter()
                .map(BatchWriteProxy::downgrade)
                .collect(),
        }
    }
}

impl<K> FromIterator<BatchWriteProxy<K>> for PoolWriteProxy<K> {
    fn from_iter<T: IntoIterator<Item = BatchWriteProxy<K>>>(iter: T) -> Self {
        Self {
            batches: Vec::from_iter(iter),
        }
    }
}

impl<K> From<Vec<BatchWriteProxy<K>>> for PoolWriteProxy<K> {
    fn from(batches: Vec<BatchWriteProxy<K>>) -> Self {
        Self { batches }
    }
}

impl<I, K> Index<I> for PoolWriteProxy<K>
where
    I: SliceIndex<[BatchWriteProxy<K>]>,
{
    type Output = I::Output;

    fn index(&self, index: I) -> &Self::Output {
        self.batches.index(index)
    }
}

impl<I, K> IndexMut<I> for PoolWriteProxy<K>
where
    I: SliceIndex<[BatchWriteProxy<K>]>,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        self.batches.index_mut(index)
    }
}
