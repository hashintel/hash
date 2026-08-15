//! Byte accounting at the allocator boundary.
//!
//! [`MemoryUsageAllocator`] wraps an allocator and counts the live bytes allocated through it,
//! so a resident-size reading comes from the allocations themselves rather than from a
//! hand-maintained estimate beside them. [`MemoryUsage`] is the reader's half: a cheap handle
//! onto the same counter, held by whoever prices the memory without holding the allocator.

use core::{
    alloc::{self, Allocator},
    ptr,
    sync::atomic::{self, Atomic},
};
use std::alloc::Global;

use ::alloc::sync::Arc;

/// A reading handle onto one allocator's live-byte counter.
///
/// Clones share the counter, so every handle reads the same total.
#[derive(Debug, Clone)]
pub(crate) struct MemoryUsage(Arc<Atomic<usize>>);

impl MemoryUsage {
    /// Reads the live bytes currently allocated through the counter's allocator.
    pub(crate) fn get(&self) -> usize {
        self.0.load(atomic::Ordering::Relaxed)
    }
}

/// An allocator that counts the live bytes allocated through it.
///
/// Every allocation adds its requested layout size and every deallocation subtracts it, so the
/// counter reads the bytes currently held. The count covers requested layout sizes alone. An
/// allocator's own padding or over-allocation stays invisible. Clones share one counter, so a
/// collection may clone its allocator freely and the total stays one number.
#[derive(Debug, Clone)]
pub(crate) struct MemoryUsageAllocator<A: Allocator = Global> {
    allocator: A,
    memory_usage: Arc<Atomic<usize>>,
}

impl<A: Allocator> MemoryUsageAllocator<A> {
    /// Wraps `allocator` with a zeroed counter.
    pub(crate) fn new(allocator: A) -> Self {
        Self {
            allocator,
            memory_usage: Arc::new(Atomic::<usize>::new(0)),
        }
    }

    /// Returns a reading handle onto this allocator's counter.
    pub(crate) fn memory_usage(&self) -> MemoryUsage {
        MemoryUsage(Arc::clone(&self.memory_usage))
    }
}

impl MemoryUsageAllocator {
    /// Wraps the global allocator with a zeroed counter.
    pub(crate) fn global() -> Self {
        Self::new(Global)
    }
}

// SAFETY: every method forwards to the wrapped allocator and returns its blocks unchanged, so
// currently-allocated pointers, layout fit, and block validity are exactly the wrapped
// allocator's. Clones share the wrapped allocator's clone semantics and one counter, so blocks
// allocated through one clone deallocate through another exactly when the wrapped allocator
// permits it. The counter only observes layouts and never touches the blocks.
unsafe impl<A: Allocator> Allocator for MemoryUsageAllocator<A> {
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        let ptr = self.allocator.allocate_zeroed(layout)?;

        self.memory_usage
            .fetch_add(layout.size(), atomic::Ordering::Relaxed);

        Ok(ptr)
    }

    unsafe fn grow(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: every block this allocator returns comes from the wrapped allocator
        // unchanged, so the caller's obligations - `ptr` denotes a current allocation of it,
        // and the layouts fit it - transfer verbatim.
        let new_ptr = unsafe { self.allocator.grow(ptr, old_layout, new_layout)? };

        self.memory_usage.fetch_add(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: every block this allocator returns comes from the wrapped allocator
        // unchanged, so the caller's obligations transfer verbatim.
        let new_ptr = unsafe { self.allocator.grow_zeroed(ptr, old_layout, new_layout)? };

        self.memory_usage.fetch_add(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: every block this allocator returns comes from the wrapped allocator
        // unchanged, so the caller's obligations transfer verbatim.
        let new_ptr = unsafe { self.allocator.shrink(ptr, old_layout, new_layout)? };
        self.memory_usage.fetch_sub(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        let ptr = self.allocator.allocate(layout)?;
        self.memory_usage
            .fetch_add(layout.size(), atomic::Ordering::Relaxed);

        Ok(ptr)
    }

    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        self.memory_usage
            .fetch_sub(layout.size(), atomic::Ordering::Relaxed);

        // SAFETY: every block this allocator returns comes from the wrapped allocator
        // unchanged, so the caller's obligations transfer verbatim.
        unsafe {
            self.allocator.deallocate(ptr, layout);
        }
    }
}
