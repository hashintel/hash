//! Implementation of a light-weight lock guard, which is guarded by an atomic boolean.
//!
//! Most efficient when contention is low, acquiring the lock is a single atomic swap, and releasing
//! is just one more atomic swap.
//!
//! This is adapted from the function outlined in the [std](https://doc.rust-lang.org/std/sync/atomic/fn.fence.html) documentation

use crate::sync::{fence, spin_loop, AtomicBool, Ordering};

pub(crate) struct LockGuard<'a> {
    lock: &'a AtomicLock,
}

impl Drop for LockGuard<'_> {
    fn drop(&mut self) {
        self.lock.unlock();
    }
}

// A mutual exclusion primitive based on spinlock.
pub(crate) struct AtomicLock {
    flag: AtomicBool,
}

impl AtomicLock {
    pub const fn new() -> Self {
        Self {
            flag: AtomicBool::new(false),
        }
    }

    pub(crate) fn lock(&self) -> LockGuard {
        // Wait until the old value is `false`.
        while self
            .flag
            .compare_exchange_weak(false, true, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            spin_loop();
        }

        // This fence synchronizes-with store in `unlock`.
        fence(Ordering::Acquire);

        LockGuard { lock: self }
    }

    fn unlock(&self) {
        self.flag.store(false, Ordering::Release);
    }
}
//
// pub(crate) struct AtomicLock {
//     locked: AtomicBool,
// }
//
// impl AtomicLock {
//     #[cfg(not(loom))]
//     #[inline]
//     pub const fn new() -> Self {
//         Self {
//             locked: AtomicBool::new(false),
//         }
//     }
//
//     #[cfg(loom)]
//     #[inline]
//     pub fn new() -> Self {
//         Self {
//             locked: AtomicBool::new(false),
//         }
//     }
//
//     #[inline]
//     pub(crate) fn lock(&self) -> LockGuard {
//         loop {
//             if let Some(lock) = self.try_lock() {
//                 fence(Ordering::Acquire);
//
//                 return lock;
//             }
//
//             warn!("D:");
//
//             spin_loop();
//         }
//     }
//
//     #[inline]
//     pub(crate) fn try_lock(&self) -> Option<LockGuard> {
//         if !self.locked.swap(true, Ordering::Relaxed) {
//             Some(LockGuard { lock: self })
//         } else {
//             None
//         }
//     }
// }
