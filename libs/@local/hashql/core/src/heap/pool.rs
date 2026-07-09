//! Allocator pools for parallel bump allocation.
//!
//! [`ScratchPool`] provides thread-safe scratch allocation. Each thread borrows
//! its own [`ScratchPoolGuard`] via [`get`](ScratchPool::get), which derefs to
//! [`Scratch`].
//!
//! [`HeapPool`] provides thread-safe heap allocation with symbol interning.
//! Each thread borrows its own [`HeapPoolGuard`] via [`get`](HeapPool::get),
//! which derefs to [`Heap`].

use core::{
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
};
use std::sync::nonpoison::Mutex;

use super::{Heap, ResetAllocator as _, Scratch};

/// A pool of [`Scratch`] allocators for parallel bump allocation.
///
/// Each thread obtains its own [`Scratch`] via [`get`](Self::get). The
/// allocator is returned to the pool and reset when the guard is dropped.
///
/// By default the pool is unbounded. Use [`bounded`](Self::bounded) to cap
/// the number of retained allocators; excess allocators are dropped instead
/// of returned.
pub struct ScratchPool {
    pool: Mutex<Vec<Scratch>>,
    max_size: usize,
}

impl ScratchPool {
    /// Creates a new unbounded scratch pool.
    #[must_use]
    #[inline]
    pub const fn new() -> Self {
        Self {
            pool: Mutex::new(Vec::new()),
            max_size: usize::MAX,
        }
    }

    /// Creates a new scratch pool that retains at most `max_size` allocators.
    ///
    /// When a guard is dropped and the pool is already at capacity, the
    /// allocator is dropped instead of returned to the pool.
    #[must_use]
    #[inline]
    pub const fn bounded(max_size: usize) -> Self {
        Self {
            pool: Mutex::new(Vec::new()),
            max_size,
        }
    }

    /// Borrows a [`Scratch`] from the pool.
    ///
    /// Reuses a previously returned allocator if available, otherwise creates
    /// a new one. The allocator is reset and returned to the pool when the
    /// guard is dropped.
    #[inline]
    pub fn get(&self) -> ScratchPoolGuard<'_> {
        let scratch = self.pool.lock().pop().unwrap_or_default();

        ScratchPoolGuard {
            pool: self,
            scratch: ManuallyDrop::new(scratch),
        }
    }
}

impl Default for ScratchPool {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

/// A borrowed [`Scratch`] from a [`ScratchPool`].
///
/// Derefs to [`Scratch`], so it can be used anywhere a `&Scratch` is expected.
/// On drop, the allocator is reset and returned to the pool for reuse.
#[clippy::has_significant_drop]
pub struct ScratchPoolGuard<'pool> {
    pool: &'pool ScratchPool,
    scratch: ManuallyDrop<Scratch>,
}

impl Deref for ScratchPoolGuard<'_> {
    type Target = Scratch;

    #[inline]
    fn deref(&self) -> &Scratch {
        &self.scratch
    }
}

impl DerefMut for ScratchPoolGuard<'_> {
    #[inline]
    fn deref_mut(&mut self) -> &mut Scratch {
        &mut self.scratch
    }
}

#[expect(unsafe_code, reason = "ManuallyDrop::take in Drop")]
impl Drop for ScratchPoolGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: This is the `Drop` impl, so `drop` is called exactly once.
        // After `take`, `self.scratch` is logically moved out and will not be
        // read or dropped again.
        let mut scratch = unsafe { ManuallyDrop::take(&mut self.scratch) };
        scratch.reset();

        let mut scratches = self.pool.pool.lock();

        if scratches.len() < self.pool.max_size {
            scratches.push(scratch);
        }
    }
}

/// A pool of [`Heap`] allocators for parallel allocation with symbol interning.
///
/// Each thread obtains its own [`Heap`] via [`get`](Self::get). The heap is
/// returned to the pool and reset when the guard is dropped.
///
/// By default the pool is unbounded. Use [`bounded`](Self::bounded) to cap
/// the number of retained heaps; excess heaps are dropped instead of returned.
pub struct HeapPool {
    pool: Mutex<Vec<Heap>>,
    max_size: usize,
}

impl HeapPool {
    /// Creates a new unbounded heap pool.
    #[must_use]
    #[inline]
    pub const fn new() -> Self {
        Self {
            pool: Mutex::new(Vec::new()),
            max_size: usize::MAX,
        }
    }

    /// Creates a new heap pool that retains at most `max_size` heaps.
    ///
    /// When a guard is dropped and the pool is already at capacity, the heap
    /// is dropped instead of returned to the pool.
    #[must_use]
    #[inline]
    pub const fn bounded(max_size: usize) -> Self {
        Self {
            pool: Mutex::new(Vec::new()),
            max_size,
        }
    }

    /// Borrows a [`Heap`] from the pool.
    ///
    /// Reuses a previously returned heap if available, otherwise creates a new
    /// one. The heap is reset and returned to the pool when the guard is
    /// dropped.
    #[inline]
    pub fn get(&self) -> HeapPoolGuard<'_> {
        let heap = self.pool.lock().pop().unwrap_or_default();

        HeapPoolGuard {
            pool: self,
            heap: ManuallyDrop::new(heap),
        }
    }
}

impl Default for HeapPool {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

/// A borrowed [`Heap`] from a [`HeapPool`].
///
/// Derefs to [`Heap`], so it can be used anywhere a `&Heap` is expected.
/// On drop, the heap is reset and returned to the pool for reuse.
#[clippy::has_significant_drop]
pub struct HeapPoolGuard<'pool> {
    pool: &'pool HeapPool,
    heap: ManuallyDrop<Heap>,
}

impl Deref for HeapPoolGuard<'_> {
    type Target = Heap;

    #[inline]
    fn deref(&self) -> &Heap {
        &self.heap
    }
}

impl DerefMut for HeapPoolGuard<'_> {
    #[inline]
    fn deref_mut(&mut self) -> &mut Heap {
        &mut self.heap
    }
}

#[expect(unsafe_code, reason = "ManuallyDrop::take in Drop")]
impl Drop for HeapPoolGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: This is the `Drop` impl, so `drop` is called exactly once.
        // After `take`, `self.heap` is logically moved out and will not be
        // read or dropped again.
        let mut heap = unsafe { ManuallyDrop::take(&mut self.heap) };
        heap.reset();

        let mut heaps = self.pool.pool.lock();

        if heaps.len() < self.pool.max_size {
            heaps.push(heap);
        }
    }
}

const _: () = {
    const fn assert_send<T: Send>() {}
    const fn assert_sync<T: Sync>() {}

    assert_send::<ScratchPool>();
    assert_sync::<ScratchPool>();
    assert_send::<ScratchPoolGuard<'_>>();

    assert_send::<HeapPool>();
    assert_sync::<HeapPool>();
    assert_send::<HeapPoolGuard<'_>>();
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scratch_pool_reuses_allocators() {
        let pool = ScratchPool::new();

        let guard = pool.get();
        let mut vec: Vec<u32, _> = Vec::new_in(&*guard);
        vec.push(42);
        assert_eq!(vec[0], 42);
        drop(vec);
        drop(guard);

        // Second get reuses the allocator.
        let guard = pool.get();
        let mut vec: Vec<u32, _> = Vec::new_in(&*guard);
        vec.push(99);
        assert_eq!(vec[0], 99);
        drop(vec);
        drop(guard);

        assert_eq!(pool.pool.lock().len(), 1);
    }

    #[test]
    fn scratch_pool_grows_under_concurrent_demand() {
        let pool = ScratchPool::new();

        let guard1 = pool.get();
        let guard2 = pool.get();

        let mut vec1: Vec<u32, _> = Vec::new_in(&*guard1);
        let mut vec2: Vec<u32, _> = Vec::new_in(&*guard2);
        vec1.push(1);
        vec2.push(2);
        assert_eq!(vec1[0], 1);
        assert_eq!(vec2[0], 2);

        drop(vec1);
        drop(vec2);
        drop(guard1);
        drop(guard2);

        assert_eq!(pool.pool.lock().len(), 2);
    }

    #[test]
    fn scratch_pool_bounded_drops_excess() {
        let pool = ScratchPool::bounded(1);

        let guard1 = pool.get();
        let guard2 = pool.get();
        drop(guard1);
        drop(guard2);

        assert_eq!(pool.pool.lock().len(), 1);
    }

    #[test]
    fn heap_pool_reuses_heaps() {
        let pool = HeapPool::new();

        // First get: creates a new heap.
        let guard = pool.get();
        let sym1 = guard.intern_symbol("hello");
        assert_eq!(sym1.as_str(), "hello");
        drop(guard);

        // Second get: should reuse the heap (pool has one to hand back).
        // The returned heap was reset, so the runtime symbol is gone,
        // but interning the same string still works (gets a fresh allocation).
        let guard = pool.get();
        let sym2 = guard.intern_symbol("hello");
        assert_eq!(sym2.as_str(), "hello");
        drop(guard);

        // Pool should have exactly one heap in it now.
        assert_eq!(pool.pool.lock().len(), 1);
    }

    #[test]
    fn heap_pool_bounded_drops_excess() {
        let pool = HeapPool::bounded(1);

        // Borrow two heaps simultaneously.
        let guard1 = pool.get();
        let guard2 = pool.get();
        guard1.intern_symbol("a");
        guard2.intern_symbol("b");

        // Return both. Only one should be retained.
        drop(guard1);
        drop(guard2);
        assert_eq!(pool.pool.lock().len(), 1);

        // A new get still works (reuses the one retained heap).
        let guard = pool.get();
        assert_eq!(pool.pool.lock().len(), 0);
        drop(guard);
        assert_eq!(pool.pool.lock().len(), 1);
    }

    #[test]
    fn heap_pool_grows_under_concurrent_demand() {
        let pool = HeapPool::new();

        // Borrow two heaps simultaneously.
        let guard1 = pool.get();
        let guard2 = pool.get();

        // Both are independent: interning in one doesn't affect the other.
        let sym1 = guard1.intern_symbol("aaa");
        let sym2 = guard2.intern_symbol("bbb");
        assert_eq!(sym1.as_str(), "aaa");
        assert_eq!(sym2.as_str(), "bbb");

        drop(guard1);
        drop(guard2);

        // Both heaps returned to pool.
        assert_eq!(pool.pool.lock().len(), 2);
    }
}
