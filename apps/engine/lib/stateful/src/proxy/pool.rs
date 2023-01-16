//! Provides structs that behave as *thread-`Send`able* guards for the read/write locks on the
//! batches in pools.

use std::{
    ops::{Deref, DerefMut, Index, IndexMut},
    slice::SliceIndex,
};

use crate::proxy::{BatchReadProxy, BatchWriteProxy};

/// Collects [`BatchReadProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolReadProxy<B> {
    // TODO: Remove `pub(super)` by providing parallel iterator
    pub batches: Vec<BatchReadProxy<B>>,
}

impl<B> PoolReadProxy<B> {
    pub fn deconstruct(self) -> Vec<BatchReadProxy<B>> {
        self.batches
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn batch(&self, index: usize) -> Option<&B> {
        self.batches.get(index).map(Deref::deref)
    }

    pub fn batches_iter(&self) -> impl Iterator<Item = &B> {
        self.batches.iter().map(Deref::deref)
    }
}

impl<B> Clone for PoolReadProxy<B> {
    fn clone(&self) -> Self {
        Self {
            batches: self.batches.to_vec(),
        }
    }
}

impl<B> FromIterator<BatchReadProxy<B>> for PoolReadProxy<B> {
    fn from_iter<T: IntoIterator<Item = BatchReadProxy<B>>>(iter: T) -> Self {
        Self {
            batches: Vec::from_iter(iter),
        }
    }
}

impl<B> From<Vec<BatchReadProxy<B>>> for PoolReadProxy<B> {
    fn from(batches: Vec<BatchReadProxy<B>>) -> Self {
        Self { batches }
    }
}

impl<I, B> Index<I> for PoolReadProxy<B>
where
    I: SliceIndex<[BatchReadProxy<B>]>,
{
    type Output = I::Output;

    fn index(&self, index: I) -> &Self::Output {
        self.batches.index(index)
    }
}

/// Collects [`BatchWriteProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolWriteProxy<B> {
    batches: Vec<BatchWriteProxy<B>>,
}

impl<B> PoolWriteProxy<B> {
    pub fn deconstruct(self) -> Vec<BatchWriteProxy<B>> {
        self.batches
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    // TODO: UNUSED: Needs triage
    pub fn batch(&self, index: usize) -> Option<&B> {
        self.batches.get(index).map(Deref::deref)
    }

    pub fn batch_mut(&mut self, index: usize) -> Option<&mut B> {
        self.batches.get_mut(index).map(DerefMut::deref_mut)
    }

    pub fn batches_iter(&self) -> impl Iterator<Item = &B> {
        self.batches.iter().map(Deref::deref)
    }

    pub fn batches_iter_mut(&mut self) -> impl Iterator<Item = &mut B> {
        self.batches.iter_mut().map(DerefMut::deref_mut)
    }

    /// For each batch, downgrade write access to read access.
    // TODO: UNUSED: Needs triage
    pub fn downgrade(self) -> PoolReadProxy<B> {
        PoolReadProxy {
            batches: self
                .batches
                .into_iter()
                .map(BatchWriteProxy::downgrade)
                .collect(),
        }
    }
}

impl<B> FromIterator<BatchWriteProxy<B>> for PoolWriteProxy<B> {
    fn from_iter<T: IntoIterator<Item = BatchWriteProxy<B>>>(iter: T) -> Self {
        Self {
            batches: Vec::from_iter(iter),
        }
    }
}

impl<B> From<Vec<BatchWriteProxy<B>>> for PoolWriteProxy<B> {
    fn from(batches: Vec<BatchWriteProxy<B>>) -> Self {
        Self { batches }
    }
}

impl<I, B> Index<I> for PoolWriteProxy<B>
where
    I: SliceIndex<[BatchWriteProxy<B>]>,
{
    type Output = I::Output;

    fn index(&self, index: I) -> &Self::Output {
        self.batches.index(index)
    }
}

impl<I, B> IndexMut<I> for PoolWriteProxy<B>
where
    I: SliceIndex<[BatchWriteProxy<B>]>,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        self.batches.index_mut(index)
    }
}
