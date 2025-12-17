//! Internal allocator wrapper around bumpalo.
//!
//! This module provides [`Allocator`], a thin wrapper around [`bumpalo::Bump`] that
//! implements the unstable [`core::alloc::Allocator`] trait by delegating to
//! [`allocator_api2`].
//!
//! # Why This Wrapper Exists
//!
//! 1. **API Bridging**: `bumpalo` implements `allocator_api2::alloc::Allocator`, but we need
//!    `core::alloc::Allocator` for use with standard library collections. This wrapper bridges the
//!    two APIs.
//!
//! 2. **Encapsulation**: By keeping `Bump` internal, we can change the underlying allocator
//!    implementation without affecting the public API.
//!
//! # Thread Safety
//!
//! `Bump` is `Send` but not `Sync`. This wrapper inherits those bounds, meaning:
//! - The allocator can be moved between threads
//! - The allocator cannot be shared between threads via `&Allocator`
//!
//! This is the correct behavior for a bump allocator, which is not designed for
//! concurrent access.

use core::{alloc, ptr};

use bumpalo::Bump;

/// Internal bump allocator wrapper.
///
/// This type is `pub(super)` to restrict usage to the `heap` module. External code
/// should use [`Heap`](super::Heap) or [`Scratch`](super::Scratch) instead.
#[derive(Debug)]
pub(super) struct Allocator(Bump);

impl Allocator {
    /// Creates a new allocator with an empty arena.
    #[must_use]
    #[inline]
    pub(crate) fn new() -> Self {
        Self(Bump::new())
    }

    /// Creates a new allocator with pre-allocated capacity.
    ///
    /// This can improve performance when the approximate allocation size is known
    /// in advance, avoiding reallocations during use.
    #[inline]
    pub(crate) fn with_capacity(capacity: usize) -> Self {
        Self(Bump::with_capacity(capacity))
    }

    /// Resets the allocator, invalidating all previous allocations.
    ///
    /// After calling this method, all memory allocated by this allocator is
    /// considered freed. Any references to previously allocated data become
    /// invalid (though Rust's borrow checker prevents dangling references in
    /// safe code).
    ///
    /// The allocator retains its current capacity for future allocations.
    #[inline]
    pub(crate) fn reset(&mut self) {
        self.0.reset();
    }

    /// Allocates space for a value and initializes it using the provided closure.
    ///
    /// This is the primary allocation method for individual values. The closure
    /// is called to construct the value in-place, avoiding unnecessary moves.
    pub(crate) fn alloc_with<T>(&self, func: impl FnOnce() -> T) -> &mut T {
        self.0.alloc_with(func)
    }
}

// SAFETY: This implementation delegates all operations to `bumpalo::Bump` via the
// `allocator_api2` compatibility layer. The safety of each operation is guaranteed
// by `bumpalo`'s implementation, which is widely used and well-audited.
//
// The wrapper adds no additional invariants or unsafe operations beyond delegation.
#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl alloc::Allocator for Allocator {
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate_zeroed(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `layout`.
        // We forward to bumpalo which handles deallocation (typically a no-op for bump).
        unsafe {
            allocator_api2::alloc::Allocator::deallocate(&&self.0, ptr, layout);
        }
    }

    #[inline]
    unsafe fn grow(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `old_layout`,
        // and that `new_layout.size() >= old_layout.size()`.
        unsafe {
            allocator_api2::alloc::Allocator::grow(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }

    #[inline]
    unsafe fn grow_zeroed(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Same as `grow`, with additional guarantee that new bytes are zeroed.
        unsafe {
            allocator_api2::alloc::Allocator::grow_zeroed(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }

    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `old_layout`,
        // and that `new_layout.size() <= old_layout.size()`.
        unsafe {
            allocator_api2::alloc::Allocator::shrink(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}
