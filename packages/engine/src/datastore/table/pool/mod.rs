pub mod agent;
pub mod message;
pub mod proxy;

use self::proxy::{PoolReadProxy, PoolWriteProxy};
use super::proxy::{BatchReadProxy, BatchWriteProxy};
use crate::datastore::{batch::Batch, prelude::Result};
use parking_lot::RwLock;
use std::sync::Arc;

// TODO OS[36] - COMPILE BLOCK - Result needs another generic argument, probably need to import the relevant Result from somewhere
pub trait BatchPool<K: Batch>: Send + Sync {
    fn batches(&self) -> &[Arc<RwLock<K>>];
    fn cloned_batch_pool(&self) -> Vec<Arc<RwLock<K>>>;

    fn read_proxy(&self) -> Result<PoolReadProxy<K>> {
        Ok(PoolReadProxy::from(
            self.batches()
                .iter()
                .map(|a| BatchReadProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    fn partial_read_proxy(&self, indices: &[usize]) -> Result<PoolReadProxy<K>> {
        Ok(PoolReadProxy::from(
            self.batches()
                .iter()
                .enumerate()
                .filter(|(index, _)| indices.contains(index))
                .map(|(_, a)| BatchReadProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    fn write_proxy(&mut self) -> Result<PoolWriteProxy<K>> {
        Ok(PoolWriteProxy::from(
            self.batches()
                .iter()
                .map(|a| BatchWriteProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    fn partial_write_proxy(&self, indices: &[usize]) -> Result<PoolWriteProxy<K>> {
        Ok(PoolWriteProxy::from(
            self.batches()
                .iter()
                .enumerate()
                .filter(|(index, _)| indices.contains(index))
                .map(|(_, a)| BatchWriteProxy::new(a))
                .collect::<Result<Vec<_>>>()?,
        ))
    }
}
