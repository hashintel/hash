//! Internal allocator wrapper around bumpalo.

use core::{alloc, ptr};

use bumpalo::Bump;

use super::BumpAllocator;

/// Internal arena allocator.
#[derive(Debug)]
pub(super) struct Allocator(Bump);

impl Allocator {
    /// Creates a new allocator with default capacity.
    #[must_use]
    #[inline]
    pub(crate) fn new() -> Self {
        Self(Bump::new())
    }

    /// Creates a new allocator with at least `capacity` bytes pre-allocated.
    #[inline]
    pub(crate) fn with_capacity(capacity: usize) -> Self {
        Self(Bump::with_capacity(capacity))
    }

    /// Sets the allocation limit for the allocator.
    #[inline]
    pub(crate) fn set_allocation_limit(&self, capacity: Option<usize>) {
        self.0.set_allocation_limit(capacity);
    }

    /// Allocates a value using a closure to avoid moving before allocation.
    #[inline]
    pub(crate) fn alloc_with<T>(&self, func: impl FnOnce() -> T) -> &mut T {
        self.0.alloc_with(func)
    }

    /// Copies a slice into the arena.
    #[inline]
    pub(crate) fn try_alloc_slice_copy<T>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        self.0
            .try_alloc_slice_copy(slice)
            .map_err(|_err| alloc::AllocError)
    }
}

impl BumpAllocator for Allocator {
    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.try_alloc_slice_copy(slice)
    }

    #[inline]
    fn reset(&mut self) {
        self.0.reset();
    }
}

// SAFETY: Delegates to bumpalo::Bump via allocator_api2.
#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl alloc::Allocator for Allocator {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate_zeroed(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
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
        // SAFETY: Caller upholds Allocator contract.
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
        // SAFETY: Caller upholds Allocator contract.
        unsafe {
            allocator_api2::alloc::Allocator::grow_zeroed(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }

    #[inline]
    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe {
            allocator_api2::alloc::Allocator::shrink(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}
