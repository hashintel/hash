//! Scratch allocator for temporary allocations.

use core::alloc;

use super::allocator::Allocator;

/// A resettable scratch allocator for temporary allocations.
///
/// Unlike [`Heap`](super::Heap), `Scratch` does not provide string interning.
/// Use for short-lived temporary allocations that can be freed in bulk.
///
/// ```
/// # #![feature(allocator_api)]
/// # use hashql_core::heap::Scratch;
/// let mut scratch = Scratch::new();
/// let mut vec: Vec<u32, &Scratch> = Vec::new_in(&scratch);
/// vec.push(42);
/// # drop(vec);
/// scratch.reset();
/// ```
#[derive(Debug)]
#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct Scratch {
    pub(super) inner: Allocator,
}

impl Scratch {
    /// Creates a new scratch allocator.
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

// SAFETY: Delegates to bumpalo::Bump via the internal Allocator.
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
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
