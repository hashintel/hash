//! Scratch allocator for temporary allocations.
//!
//! This module provides [`Scratch`], a resettable bump allocator designed for
//! temporary allocations that can be bulk-freed by calling [`Scratch::reset`].

use core::alloc;

use super::allocator::Allocator;

/// A resettable scratch allocator for temporary allocations.
///
/// `Scratch` wraps a [`Bump`] allocator, providing a simple interface for
/// allocating memory that can be efficiently freed in bulk. This is useful
/// for temporary allocations during query processing where individual
/// deallocations are unnecessary.
///
/// # Usage
///
/// The allocator can be used directly with collections via the [`Allocator`] trait:
///
/// ```
/// # #![feature(allocator_api)]
/// # use hashql_core::heap::Scratch;
/// let mut scratch = Scratch::new();
/// let mut vec: Vec<u32, &Scratch> = Vec::new_in(&scratch);
/// vec.push(42);
/// # drop(vec);
/// // When done, reset to free all allocations at once
/// scratch.reset();
/// ```
#[derive(Debug)]
pub struct Scratch {
    inner: Allocator,
}

impl Scratch {
    /// Creates a new scratch allocator with an empty arena.
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Allocator::new(),
        }
    }

    /// Resets the allocator, freeing all allocations at once.
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code, reason = "proxy to internal allocator")]
// SAFETY: this simply delegates to the bump allocator
unsafe impl alloc::Allocator for Scratch {
    fn allocate(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        self.inner.allocate(layout)
    }

    fn allocate_zeroed(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        self.inner.allocate_zeroed(layout)
    }

    unsafe fn grow(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
