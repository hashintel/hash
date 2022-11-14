//! Implementation of a light-weight lock guard, which is guarded by an atomic boolean.
//!
//! Most efficient when contention is low, acquiring the lock is a single atomic swap, and releasing
//! is just one more atomic swap.
//!
//! This is heavily inspired from the excellent [try-lock](https://crates.io/crates/try-lock)
//! crate, but without requiring a value to be guarded.

use core::{
    hint::spin_loop,
    sync::atomic::{AtomicBool, Ordering},
};

pub(crate) struct LockGuard<'a> {
    lock: &'a AtomicLock,
}

impl Drop for LockGuard<'_> {
    fn drop(&mut self) {
        self.lock.locked.store(false, Ordering::Release);
    }
}

pub(crate) struct AtomicLock {
    locked: AtomicBool,
}

impl AtomicLock {
    #[inline]
    pub const fn new() -> Self {
        Self {
            locked: AtomicBool::new(false),
        }
    }

    #[inline]
    pub(crate) fn lock(&self) -> LockGuard {
        loop {
            if let Some(lock) = self.try_lock() {
                return lock;
            }

            spin_loop()
        }
    }

    #[inline]
    pub(crate) fn try_lock(&self) -> Option<LockGuard> {
        if !self.locked.swap(true, Ordering::Acquire) {
            Some(LockGuard { lock: self })
        } else {
            None
        }
    }
}
