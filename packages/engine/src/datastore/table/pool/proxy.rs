use crate::datastore::{
    batch::Batch,
    prelude::{Error, Result},
    table::proxy::{BatchReadProxy, BatchWriteProxy},
};

#[derive(Default)]
pub struct PoolWriteProxy<K: Batch> {
    batches: Vec<BatchWriteProxy<K>>,
}

#[derive(Default)]
pub struct PoolReadProxy<K: Batch> {
    batches: Vec<BatchReadProxy<K>>,
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
    pub fn batch(&self, index: usize) -> Result<&K> {
        let batch = self
            .batches
            .get(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch.inner())
    }
    pub fn batch_mut(&mut self, index: usize) -> Result<&mut K> {
        let batch = self
            .batches
            .get_mut(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch.inner_mut())
    }
}

impl<K: Batch> PoolReadProxy<K> {
    pub fn batch(&self, index: usize) -> Result<&K> {
        let batch = self
            .batches
            .get(index)
            .ok_or_else(|| Error::from(format!("No batch with index {}", index)))?;
        Ok(batch.inner())
    }
}
