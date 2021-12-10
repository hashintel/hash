pub mod agent;
pub mod message;
pub mod proxy;

use std::sync::Arc;

use parking_lot::RwLock;

use self::proxy::{PoolReadProxy, PoolWriteProxy};
use super::proxy::{BatchReadProxy, BatchWriteProxy};
use crate::datastore::{batch::Batch, prelude::Result};

pub trait BatchPool<K: Batch>: Send + Sync {
    fn batches(&self) -> &[Arc<RwLock<K>>];
    fn mut_batches(&mut self) -> &mut Vec<Arc<RwLock<K>>>;

    fn update<T: BatchPool<K>>(&mut self, other: &T, indices: &[usize]) {
        let own = self.mut_batches();
        let other = other.batches();
        for index in indices.iter() {
            own[*index] = other[*index].clone();
        }
    }

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
