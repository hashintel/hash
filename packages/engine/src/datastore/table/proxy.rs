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
    mem,
    ops::{Deref, DerefMut},
    ptr,
    sync::Arc,
};

use parking_lot::{
    lock_api::{RawRwLock, RawRwLockDowngrade},
    RwLock,
};

use super::pool::proxy::{PoolReadProxy, PoolWriteProxy};
use crate::datastore::{
    prelude::{AgentBatch, Error, MessageBatch, Result},
    table::{pool::BatchPool, state::view::StatePools},
};

/// A thread-sendable guard for reading a batch, see module-level documentation for more reasoning.
pub struct BatchReadProxy<K> {
    arc: Arc<RwLock<K>>,
}

impl<K> BatchReadProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchReadProxy<K>> {
        // Safety: `try_lock_shared` locks the `RawRwLock` and returns if the lock could be
        // acquired. The lock is not used if it couldn't be acquired.
        if unsafe { RwLock::raw(arc).try_lock_shared() } {
            Ok(BatchReadProxy { arc: arc.clone() })
        } else {
            Err(Error::ProxySharedLock)
        }
    }
}

impl<K> Deref for BatchReadProxy<K> {
    type Target = K;

    fn deref(&self) -> &Self::Target {
        let ptr = self.arc.data_ptr();
        // SAFETY: `BatchReadProxy` is guaranteed to contain a shared lock acquired in `new()`, thus
        // it's safe to dereference the shared underlying `data_ptr`.
        unsafe { &*ptr }
    }
}

impl<K> Clone for BatchReadProxy<K> {
    fn clone(&self) -> Self {
        // Acquire another shared lock for the new proxy
        // SAFETY: `BatchReadProxy` is guaranteed to contain a shared lock acquired in `new()`, thus
        // it's safe (and required) to acquire another shared lock. Note, that this does not hold
        // for `BatchWriteProxy`!
        let locked = unsafe { RwLock::raw(&self.arc).try_lock_shared() };
        assert!(
            locked,
            "Couldn't clone BatchReadProxy because batch couldn't acquire a shared lock. This is \
             a bug in the `BatchReadProxy` implementation!"
        );
        Self {
            arc: self.arc.clone(),
        }
    }
}

impl<K> Drop for BatchReadProxy<K> {
    fn drop(&mut self) {
        // SAFETY: `BatchReadProxy` is guaranteed to contain a shared lock acquired in `new()`, thus
        // it's safe (and required) to unlock it, when the proxy goes out of scope.
        unsafe { RwLock::raw(&self.arc).unlock_shared() }
    }
}

/// A thread-sendable guard for writing a batch, see module-level documentation for more reasoning.
pub struct BatchWriteProxy<K> {
    arc: Arc<RwLock<K>>,
}

impl<K> BatchWriteProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchWriteProxy<K>> {
        // Safety: `try_lock_exclusive` locks the `RawRwLock` and returns if the lock could be
        // acquired. The lock is not used if it couldn't be acquired.
        if unsafe { RwLock::raw(arc).try_lock_exclusive() } {
            Ok(BatchWriteProxy { arc: arc.clone() })
        } else {
            Err(Error::ProxyExclusiveLock)
        }
    }

    // TODO: UNUSED: Needs triage
    pub fn downgrade(self) -> BatchReadProxy<K> {
        // Don't drop this, otherwise it would call `raw.unlock_exclusive()`
        // We can't destructure this because `Drop` is implemented
        let this = mem::ManuallyDrop::new(self);

        // Read the value from `self`
        // SAFETY: `arc` is a "valid" value and isn't dropped by `BatchWriteProxy`.
        let arc = unsafe { ptr::read(&this.arc) };

        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        //   thus it's safe to downgrade the unique lock to a shared lock.
        unsafe { RwLock::raw(&arc).downgrade() }

        BatchReadProxy { arc }
    }
}

impl<K> Deref for BatchWriteProxy<K> {
    type Target = K;

    fn deref(&self) -> &Self::Target {
        let ptr = self.arc.data_ptr();
        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        // thus it's safe to dereference the shared underlying `data_ptr`.
        unsafe { &*ptr }
    }
}

impl<K> DerefMut for BatchWriteProxy<K> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        let ptr = self.arc.data_ptr();
        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        // thus it's safe to dereference the unique underlying `data_ptr`.
        unsafe { &mut *ptr }
    }
}

impl<K> Drop for BatchWriteProxy<K> {
    fn drop(&mut self) {
        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        // thus it's safe (and required) to unlock it, when the proxy goes out of scope.
        unsafe { RwLock::raw(&self.arc).unlock_exclusive() }
    }
}

#[derive(Clone)]
pub struct StateReadProxy {
    pub agent_proxies: PoolReadProxy<AgentBatch>,
    pub message_proxies: PoolReadProxy<MessageBatch>,
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
            agent_proxies: PoolReadProxy::from(batches.0),
            message_proxies: PoolReadProxy::from(batches.1),
        }
    }
}

impl Debug for StateReadProxy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("StateReadProxy(...)")
    }
}

impl StateReadProxy {
    pub fn new(state: &StatePools) -> Result<Self> {
        Ok(StateReadProxy {
            agent_proxies: state.agent_pool.read_proxies()?,
            message_proxies: state.message_pool.read_proxies()?,
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn new_partial(state: &StatePools, group_indices: &[usize]) -> Result<Self> {
        Ok(StateReadProxy {
            agent_proxies: state.agent_pool.partial_read_proxies(group_indices)?,
            message_proxies: state.message_pool.partial_read_proxies(group_indices)?,
        })
    }

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchReadProxy<AgentBatch>>,
        Vec<BatchReadProxy<MessageBatch>>,
    ) {
        (
            self.agent_proxies.deconstruct(),
            self.message_proxies.deconstruct(),
        )
    }

    pub fn agent_pool(&self) -> &PoolReadProxy<AgentBatch> {
        &self.agent_proxies
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_pool_mut(&mut self) -> &mut PoolReadProxy<AgentBatch> {
        &mut self.agent_proxies
    }

    pub fn message_pool(&self) -> &PoolReadProxy<MessageBatch> {
        &self.message_proxies
    }

    // TODO: UNUSED: Needs triage
    pub fn message_pool_mut(&mut self) -> &mut PoolReadProxy<MessageBatch> {
        &mut self.message_proxies
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_proxies
            .batches()
            .into_iter()
            .map(|batch| batch.num_agents())
            .sum()
    }
}

pub struct StateWriteProxy {
    agent_proxies: PoolWriteProxy<AgentBatch>,
    message_proxies: PoolWriteProxy<MessageBatch>,
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
            agent_proxies: PoolWriteProxy::from(batches.0),
            message_proxies: PoolWriteProxy::from(batches.1),
        }
    }
}

impl StateWriteProxy {
    pub fn new(state: &mut StatePools) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_proxies: state.agent_pool.write_proxies()?,
            message_proxies: state.message_pool.write_proxies()?,
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn new_partial(state: &mut StatePools, group_indices: &[usize]) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_proxies: state.agent_pool.partial_write_proxies(group_indices)?,
            message_proxies: state.message_pool.partial_write_proxies(group_indices)?,
        })
    }

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchWriteProxy<AgentBatch>>,
        Vec<BatchWriteProxy<MessageBatch>>,
    ) {
        (
            self.agent_proxies.deconstruct(),
            self.message_proxies.deconstruct(),
        )
    }

    pub fn maybe_reload(&mut self) -> Result<()> {
        for message_batch in self.message_proxies.batches_iter_mut() {
            message_batch.batch.maybe_reload()?;
        }
        for agent_batch in self.agent_proxies.batches_iter_mut() {
            agent_batch.batch.maybe_reload()?;
        }
        Ok(())
    }

    pub fn agent_pool(&self) -> &PoolWriteProxy<AgentBatch> {
        &self.agent_proxies
    }

    pub fn agent_pool_mut(&mut self) -> &mut PoolWriteProxy<AgentBatch> {
        &mut self.agent_proxies
    }

    pub fn message_pool(&self) -> &PoolWriteProxy<MessageBatch> {
        &self.message_proxies
    }

    pub fn message_pool_mut(&mut self) -> &mut PoolWriteProxy<MessageBatch> {
        &mut self.message_proxies
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_proxies
            .batches_iter()
            .map(AgentBatch::num_agents)
            .sum()
    }
}
