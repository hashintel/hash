//! Scratch allocator for temporary allocations.

use core::{alloc, ptr};

use super::{BumpAllocator, allocator::Allocator};

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
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "TransferInto impl"
)]
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
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

impl BumpAllocator for Scratch {
    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.inner.try_alloc_slice_copy(slice)
    }

    #[inline]
    fn reset(&mut self) {
        self.inner.reset();
    }
}

// SAFETY: Delegates to bumpalo::Bump via the internal Allocator.
#[expect(unsafe_code, reason = "proxy to internal allocator")]
unsafe impl alloc::Allocator for Scratch {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        self.inner.allocate(layout)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        self.inner.allocate_zeroed(layout)
    }

    #[inline]
    unsafe fn grow(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn grow_zeroed(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
