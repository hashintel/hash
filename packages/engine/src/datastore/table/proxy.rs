use std::fmt::{Debug, Formatter};
use std::sync::Arc;

use parking_lot::{lock_api::RawRwLock, RwLock};

use crate::datastore::table::pool::BatchPool;
use crate::datastore::{
    batch::Batch,
    prelude::{AgentBatch, Error, MessageBatch, Result},
};

use super::{
    pool::proxy::{PoolReadProxy, PoolWriteProxy},
    state::{ReadState, WriteState},
};

pub struct BatchReadProxy<K: Batch> {
    arc: Arc<RwLock<K>>,
}

impl<K: Batch> BatchReadProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchReadProxy<K>> {
        if unsafe { arc.raw() }.try_lock_shared() {
            Ok(BatchReadProxy { arc: arc.clone() })
        } else {
            Err(Error::from("Couldn't acquire shared lock on object"))
        }
    }

    /// # Safety
    /// This method uses unsafe code to get a shared reference
    /// to the underlying data. However since this object
    /// acts as a guarantee of no write locks
    /// existing, then data races stemming from the dereferencing
    /// happening within this method cannot happen
    pub fn inner<'s>(&'s self) -> &'s K {
        let ptr = self.arc.data_ptr();
        unsafe { &*ptr }
    }
}

impl<K: Batch> Drop for BatchReadProxy<K> {
    fn drop(&mut self) {
        unsafe { self.arc.raw().unlock_shared() }
    }
}

pub struct BatchWriteProxy<K: Batch> {
    arc: Arc<RwLock<K>>,
}

impl<K: Batch> BatchWriteProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchWriteProxy<K>> {
        if unsafe { arc.raw() }.try_lock_exclusive() {
            Ok(BatchWriteProxy { arc: arc.clone() })
        } else {
            Err(Error::from("Couldn't acquire exclusive lock on object"))
        }
    }

    /// # Safety
    /// This method uses unsafe code to get a mutable reference
    /// to the underlying data. However since this object
    /// acts as a guarantee of no other read/write locks
    /// existing, then data races stemming from the dereferencing
    /// happening within this method cannot happen
    pub fn inner_mut<'s>(&'s mut self) -> &'s mut K {
        let ptr = self.arc.data_ptr();
        unsafe { &mut *ptr }
    }

    /// # Safety
    /// This method uses unsafe code to get a mutable reference
    /// to the underlying data. However since this object
    /// acts as a guarantee of no other read/write locks
    /// existing, then data races stemming from the dereferencing
    /// happening within this method cannot happen
    pub fn inner<'s>(&'s self) -> &'s K {
        let ptr = self.arc.data_ptr();
        unsafe { &*ptr }
    }
}

impl<K: Batch> Drop for BatchWriteProxy<K> {
    fn drop(&mut self) {
        unsafe { self.arc.raw().unlock_exclusive() }
    }
}

pub struct StateReadProxy {
    agent_pool_proxy: PoolReadProxy<AgentBatch>,
    message_pool_proxy: PoolReadProxy<MessageBatch>,
}

impl Debug for StateReadProxy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("StateReadProxy(...)")
    }
}

impl StateReadProxy {
    pub fn new<K: ReadState>(state: &K) -> Result<Self> {
        Ok(StateReadProxy {
            agent_pool_proxy: state.agent_pool().read_proxy()?,
            message_pool_proxy: state.message_pool().read_proxy()?,
        })
    }

    pub fn new_partial<K: ReadState>(state: &K, indices: &[usize]) -> Result<Self> {
        Ok(StateReadProxy {
            agent_pool_proxy: state.agent_pool().partial_read_proxy(indices)?,
            message_pool_proxy: state.message_pool().partial_read_proxy(indices)?,
        })
    }

    pub fn agent_pool(&self) -> &PoolReadProxy<AgentBatch> {
        &self.agent_pool_proxy
    }

    pub fn message_pool(&self) -> &PoolReadProxy<MessageBatch> {
        &self.message_pool_proxy
    }
}

pub struct StateWriteProxy {
    agent_pool_proxy: PoolWriteProxy<AgentBatch>,
    message_pool_proxy: PoolWriteProxy<MessageBatch>,
}

impl Debug for StateWriteProxy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("StateWriteProxy(...)")
    }
}

impl StateWriteProxy {
    pub fn new<K: WriteState>(state: &mut K) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_pool_proxy: state.agent_pool_mut().write_proxy()?,
            message_pool_proxy: state.message_pool_mut().write_proxy()?,
        })
    }

    pub fn new_partial<K: WriteState>(state: &K, indices: &[usize]) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_pool_proxy: state.agent_pool().partial_write_proxy(indices)?,
            message_pool_proxy: state.message_pool().partial_write_proxy(indices)?,
        })
    }

    pub fn agent_pool(&self) -> &PoolWriteProxy<AgentBatch> {
        &self.agent_pool_proxy
    }

    pub fn agent_pool_mut(&mut self) -> &PoolWriteProxy<AgentBatch> {
        &mut self.agent_pool_proxy
    }

    pub fn message_pool(&self) -> &PoolWriteProxy<MessageBatch> {
        &self.message_pool_proxy
    }

    pub fn message_pool_mut(&mut self) -> &PoolWriteProxy<MessageBatch> {
        &mut self.message_pool_proxy
    }
}
