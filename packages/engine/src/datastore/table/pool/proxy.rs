//! Provides structs that behave as guards for the read/write locks on the batches in pools that
//! you can send between threads.
use crate::datastore::{
    batch::Batch,
    prelude::{Error, Result},
    table::proxy::{BatchReadProxy, BatchWriteProxy},
};

/// Collects [`BatchWriteProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolWriteProxy<K: Batch> {
    batches: Vec<BatchWriteProxy<K>>,
}

/// Collects [`BatchReadProxy`] for all the batches within the pool.
#[derive(Default)]
pub struct PoolReadProxy<K: Batch> {
    batches: Vec<BatchReadProxy<K>>,
}

impl<K: Batch> Clone for PoolReadProxy<K> {
    fn clone(&self) -> Self {
        Self {
            batches: self.batches.to_vec(),
        }
    }
}

impl<K: Batch> From<Vec<BatchWriteProxy<K>>> for PoolWriteProxy<K> {
    fn from(batches: Vec<BatchWriteProxy<K>>) -> Self {
        Self { batches }
    }
}

impl<K: Batch> From<Vec<BatchReadProxy<K>>> for PoolReadProxy<K> {
    fn from(batches: Vec<BatchReadProxy<K>>) -> Self {
        Self { batches }
    }
}

impl<K: Batch> PoolWriteProxy<K> {
    pub fn deconstruct(self) -> Vec<BatchWriteProxy<K>> {
        self.batches
    }

    pub fn n_batches(&self) -> usize {
        self.batches.len()
    }

    pub fn batch(&self, index: usize) -> Result<&K> {
        let batch = self
            .batches
            .get(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch.batch())
    }

    pub fn batch_mut(&mut self, index: usize) -> Result<&mut K> {
        let batch = self
            .batches
            .get_mut(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch.batch_mut())
    }

    pub fn batches(&self) -> Vec<&K> {
        self.batches.iter().map(|b| b.batch()).collect()
    }
}

impl<K: Batch> PoolReadProxy<K> {
    pub fn deconstruct(self) -> Vec<BatchReadProxy<K>> {
        self.batches
    }

    pub fn n_batches(&self) -> usize {
        self.batches.len()
    }

    pub fn batch(&self, index: usize) -> Result<&K> {
        let batch_reader = self
            .batches
            .get(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch_reader.batch())
    }

    pub fn batches(&self) -> Vec<&K> {
        self.batches.iter().map(|b| b.batch()).collect()
    }
}
