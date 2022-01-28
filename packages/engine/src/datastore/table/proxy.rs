//! Provides structs that behave as guards for the read/write locks on batches and pools that
//! you can send between threads.
//!
//! Proxies are basically just self-referential structs, which is why they use pointers/unsafe code
//! internally. Usually locking a RwLock would give a Guard that has a lifetime depending on the
//! RwLock, but in our use case, this isn’t necessary, because as long as the Proxy exists, an Arc
//! containing the RwLock will exist, so there’s no possibility of the Proxy referencing a RwLock
//! that no longer exists. In other words, the Proxy is like a self-referential struct containing
//! both a Guard and an Arc with the RwLock that the Guard refers to, so as long as the Proxy
//! exists, the RwLock will also exist and the Guard will refer to an existing RwLock.
//!
//! Also, the Guard is actually just the pointer inside the RwLock, so we don’t need to store it in
//! a separate field. Also, the RwLock is like a Box in the sense that even if it is moved, its
//! contents stay in the same place on the heap, so they don’t need to be pinned -- therefore, if
//! the Proxy is moved, the references returned by the Proxy to its RwLock’s contents (i.e. its
//! “guard”) will still be valid.
// TODO: move each proxy into it's own module, for example, batch proxy should go inside the batch
//  module, state in state, etc. Move the above doc-comment into the batch proxy module as the
//  self referential unsafe stuff only applies to batches
use std::{
    fmt::{Debug, Formatter},
    sync::Arc,
};

use parking_lot::{lock_api::RawRwLock, RwLock};

use super::{
    pool::proxy::{PoolReadProxy, PoolWriteProxy},
    state::{ReadState, WriteState},
};
use crate::datastore::{
    batch::Batch,
    prelude::{AgentBatch, Error, MessageBatch, Result},
    table::pool::BatchPool,
};

/// A thread-sendable guard for reading a batch, see module-level documentation for more reasoning
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

    pub fn inner(&self) -> &K {
        let ptr = self.arc.data_ptr();
        // Safety: This method uses unsafe code to get a shared reference to the underlying data.
        // However since this object acts as a guarantee of no write locks existing, then data races
        // stemming from the dereferencing happening within this method cannot happen
        unsafe { &*ptr }
    }
}

impl<K: Batch> Clone for BatchReadProxy<K> {
    fn clone(&self) -> Self {
        // SAFETY: Since a BatchReadProxy already exists, the existing BatchReadProxy
        //         must already have the shared lock, so no writer can currently have
        //         the lock, so it must be possible to take the shared lock again.
        let locked = unsafe { self.arc.raw() }.try_lock_shared();
        assert!(locked, "Clone BatchReadProxy");
        Self {
            arc: self.arc.clone(),
        }
    }
}

impl<K: Batch> Drop for BatchReadProxy<K> {
    fn drop(&mut self) {
        unsafe { self.arc.raw().unlock_shared() }
    }
}

/// A thread-sendable guard for writing a batch, see module-level documentation for more reasoning.
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

    pub fn inner_mut(&mut self) -> &mut K {
        let ptr = self.arc.data_ptr();
        // Safety: This method uses unsafe code to get a mutable reference to the underlying data.
        // However since this object acts as a guarantee of no other read/write locks existing,
        // then data races stemming from the dereferencing happening within this method cannot
        // happen
        unsafe { &mut *ptr }
    }

    pub fn inner(&self) -> &K {
        let ptr = self.arc.data_ptr();
        // Safety: This method uses unsafe code to get a mutable reference to the underlying data.
        // However since this object acts as a guarantee of no other read/write locks existing, then
        // data races stemming from the dereferencing happening within this method cannot happen
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

impl Clone for StateReadProxy {
    fn clone(&self) -> Self {
        Self {
            agent_pool_proxy: self.agent_pool_proxy.clone(),
            message_pool_proxy: self.message_pool_proxy.clone(),
        }
    }
}

impl
    From<(
        Vec<BatchReadProxy<AgentBatch>>,
        Vec<BatchReadProxy<MessageBatch>>,
    )> for StateReadProxy
{
    fn from(
        batches: (
            Vec<BatchReadProxy<AgentBatch>>,
            Vec<BatchReadProxy<MessageBatch>>,
        ),
    ) -> Self {
        Self {
            agent_pool_proxy: PoolReadProxy::from(batches.0),
            message_pool_proxy: PoolReadProxy::from(batches.1),
        }
    }
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

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchReadProxy<AgentBatch>>,
        Vec<BatchReadProxy<MessageBatch>>,
    ) {
        (
            self.agent_pool_proxy.deconstruct(),
            self.message_pool_proxy.deconstruct(),
        )
    }

    pub fn agent_pool(&self) -> &PoolReadProxy<AgentBatch> {
        &self.agent_pool_proxy
    }

    pub fn message_pool(&self) -> &PoolReadProxy<MessageBatch> {
        &self.message_pool_proxy
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_pool_proxy
            .batches()
            .into_iter()
            .map(|batch| batch.num_agents())
            .sum()
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

impl
    From<(
        Vec<BatchWriteProxy<AgentBatch>>,
        Vec<BatchWriteProxy<MessageBatch>>,
    )> for StateWriteProxy
{
    fn from(
        batches: (
            Vec<BatchWriteProxy<AgentBatch>>,
            Vec<BatchWriteProxy<MessageBatch>>,
        ),
    ) -> Self {
        Self {
            agent_pool_proxy: PoolWriteProxy::from(batches.0),
            message_pool_proxy: PoolWriteProxy::from(batches.1),
        }
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

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchWriteProxy<AgentBatch>>,
        Vec<BatchWriteProxy<MessageBatch>>,
    ) {
        (
            self.agent_pool_proxy.deconstruct(),
            self.message_pool_proxy.deconstruct(),
        )
    }

    pub fn agent_pool(&self) -> &PoolWriteProxy<AgentBatch> {
        &self.agent_pool_proxy
    }

    pub fn agent_pool_mut(&mut self) -> &mut PoolWriteProxy<AgentBatch> {
        &mut self.agent_pool_proxy
    }

    pub fn message_pool(&self) -> &PoolWriteProxy<MessageBatch> {
        &self.message_pool_proxy
    }

    pub fn message_pool_mut(&mut self) -> &mut PoolWriteProxy<MessageBatch> {
        &mut self.message_pool_proxy
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_pool_proxy
            .batches()
            .into_iter()
            .map(|batch| batch.num_agents())
            .sum()
    }
}
