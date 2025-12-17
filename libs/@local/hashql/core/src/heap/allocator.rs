use core::{alloc, ptr};

use bumpalo::Bump;

#[derive(Debug)]
pub struct Allocator(Bump);

impl Allocator {
    /// Creates a new scratch allocator with an empty arena.
    #[must_use]
    #[inline]
    pub fn new() -> Self {
        Self(Bump::new())
    }

    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        Self(Bump::with_capacity(capacity))
    }

    /// Resets the allocator, freeing all allocations at once.
    #[inline]
    pub fn reset(&mut self) {
        self.0.reset();
    }
}

#[expect(unsafe_code, reason = "proxy to bump")]
// SAFETY: this simply delegates to the bump allocator
unsafe impl alloc::Allocator for Allocator {
    fn allocate(
        &self,
        layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    fn allocate_zeroed(
        &self,
        layout: std::alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, std::alloc::AllocError> {
        allocator_api2::alloc::Allocator::allocate_zeroed(&&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
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
        unsafe {
            allocator_api2::alloc::Allocator::shrink(&&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}
