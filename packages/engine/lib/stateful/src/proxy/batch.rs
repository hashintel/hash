use core::{
    mem,
    ops::{Deref, DerefMut},
    ptr,
};
use std::sync::Arc;

use parking_lot::{
    lock_api::{RawRwLock, RawRwLockDowngrade},
    RwLock,
};

use crate::error::{Error, Result};

/// A thread-[`Send`]able guard for reading a batch, see module-level documentation for more
/// reasoning.
pub struct BatchReadProxy<K> {
    arc: Arc<RwLock<K>>,
}

impl<K> BatchReadProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchReadProxy<K>> {
        // SAFETY: `try_lock_shared` locks the `RawRwLock` and returns if the lock could be
        //   acquired. The lock is not used if it couldn't be acquired.
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
        //   it's safe to dereference the shared underlying `data_ptr`.
        unsafe { &*ptr }
    }
}

impl<K> Clone for BatchReadProxy<K> {
    fn clone(&self) -> Self {
        tracing::trace!(
            "cloning batch read proxy (arc memory address {})",
            Arc::as_ptr(&self.arc) as usize
        );
        // Acquire another shared lock for the new proxy
        // SAFETY: `BatchReadProxy` is guaranteed to contain a shared lock acquired in `new()`, thus
        //   it's safe (and required) to acquire another shared lock. Note, that this does not hold
        //   for `BatchWriteProxy`!
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
        //   it's safe (and required) to unlock it, when the proxy goes out of scope.
        unsafe { RwLock::raw(&self.arc).unlock_shared() }
    }
}

/// A thread-sendable guard for writing a batch, see module-level documentation for more reasoning.
pub struct BatchWriteProxy<K> {
    arc: Arc<RwLock<K>>,
}

impl<K> BatchWriteProxy<K> {
    pub fn new(arc: &Arc<RwLock<K>>) -> Result<BatchWriteProxy<K>> {
        // SAFETY: `try_lock_exclusive` locks the `RawRwLock` and returns if the lock could be
        //   acquired. The lock is not used if it couldn't be acquired.
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
        //   thus it's safe to dereference the shared underlying `data_ptr`.
        unsafe { &*ptr }
    }
}

impl<K> DerefMut for BatchWriteProxy<K> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        let ptr = self.arc.data_ptr();
        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        //   thus it's safe to dereference the unique underlying `data_ptr`.
        unsafe { &mut *ptr }
    }
}

impl<K> Drop for BatchWriteProxy<K> {
    fn drop(&mut self) {
        // SAFETY: `BatchWriteProxy` is guaranteed to contain a unique lock acquired in `new()`,
        //   thus it's safe (and required) to unlock it, when the proxy goes out of scope.
        unsafe { RwLock::raw(&self.arc).unlock_exclusive() }
    }
}
