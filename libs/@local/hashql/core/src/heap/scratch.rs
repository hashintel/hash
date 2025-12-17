//! Scratch allocator for temporary allocations.
//!
//! This module provides [`Scratch`], a resettable bump allocator designed for
//! temporary allocations that can be bulk-freed by calling [`Scratch::reset`].
//!
//! # Use Cases
//!
//! `Scratch` is ideal for temporary working memory during:
//! - Query processing phases that produce intermediate results
//! - Parsing stages where temporary buffers are needed
//! - Any operation requiring many small allocations that can be discarded together
//!
//! # Difference from [`Heap`](super::Heap)
//!
//! | Feature | `Heap` | `Scratch` |
//! |---------|--------|-----------|
//! | String interning | ✓ | ✗ |
//! | Symbol table | ✓ | ✗ |
//! | Intended lifetime | Long-lived (AST) | Short-lived (temporaries) |
//! | Reset frequency | Rarely | Frequently |
//!
//! # Example
//!
//! ```
//! # #![feature(allocator_api)]
//! # use hashql_core::heap::Scratch;
//! let mut scratch = Scratch::new();
//!
//! // Use scratch for temporary allocations
//! let mut vec: Vec<u32, &Scratch> = Vec::new_in(&scratch);
//! vec.push(1);
//! vec.push(2);
//! vec.push(3);
//!
//! // Process the data...
//! let sum: u32 = vec.iter().sum();
//!
//! // All allocations must be dropped before reset
//! drop(vec);
//!
//! // Reset to free all memory at once
//! scratch.reset();
//!
//! // Scratch can now be reused
//! let mut new_vec: Vec<u32, &Scratch> = Vec::new_in(&scratch);
//! ```
//!
//! # Safety Considerations
//!
//! While `reset()` is a safe method, it semantically requires that no references
//! to allocated data exist. Rust's borrow checker enforces this: you cannot call
//! `reset(&mut self)` while any `&Scratch` borrows exist.

use core::alloc;

use super::allocator::Allocator;

/// A resettable scratch allocator for temporary allocations.
///
/// See the [module-level documentation](self) for usage examples and design rationale.
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
    ///
    /// After calling this method, all previously allocated memory is considered
    /// freed. The allocator retains its capacity for future allocations.
    ///
    /// # Borrow Checker Guarantee
    ///
    /// This method takes `&mut self`, which means it cannot be called while any
    /// `&Scratch` references exist. Since allocations require `&Scratch`, this
    /// ensures no dangling references can exist after reset.
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: This implementation delegates all operations to the internal `Allocator`,
// which in turn delegates to `bumpalo::Bump`. No additional invariants are introduced.
//
// Thread safety: `Scratch` is `Send` but not `Sync`, inherited from `bumpalo::Bump`.
// This prevents concurrent access, which is correct for a bump allocator.
#[expect(unsafe_code, reason = "proxy to internal allocator")]
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
        // SAFETY: Caller guarantees ptr was allocated by this allocator with old_layout.
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller guarantees ptr was allocated by this allocator with old_layout.
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller guarantees ptr was allocated by this allocator with old_layout.
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: Caller guarantees ptr was allocated by this allocator with layout.
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
