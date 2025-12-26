//! Internal allocator wrapper around bumpalo.

use core::{alloc, ptr};

use bump_scope::{Bump, BumpBox, BumpScope};

use super::{BumpAllocator, bump::ResetAllocator};

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
        Self(Bump::with_size(capacity))
    }

    /// Allocates a value using a closure to avoid moving before allocation.
    #[inline]
    pub(crate) fn alloc_with<T>(&self, func: impl FnOnce() -> T) -> &mut T {
        BumpBox::leak(self.0.alloc_with(func))
    }
}

impl BumpAllocator for Allocator {
    type Scoped<'scope> = AllocatorScope<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T {
        self.0.scoped(|scope| func(AllocatorScope(scope)))
    }

    #[inline]
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.0
            .try_alloc_slice_copy(slice)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }
}

impl ResetAllocator for Allocator {
    #[inline]
    fn reset(&mut self) {
        self.0.reset();
    }
}

// SAFETY: Delegates to bump_scope
#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl alloc::Allocator for Allocator {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate(&self.0, layout).map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate_zeroed(&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe {
            bump_scope::alloc::Allocator::deallocate(&self.0, ptr, layout);
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
            bump_scope::alloc::Allocator::grow(&self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::grow_zeroed(&self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::shrink(&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}

pub struct AllocatorScope<'scope>(BumpScope<'scope>);

impl BumpAllocator for AllocatorScope<'_> {
    type Scoped<'scope> = AllocatorScope<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T {
        self.0.scoped(|scope| func(AllocatorScope(scope)))
    }

    #[inline]
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.0
            .try_alloc_slice_copy(slice)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }
}

// SAFETY: Delegates to bump_scope
#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl alloc::Allocator for AllocatorScope<'_> {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate(&self.0, layout).map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate_zeroed(&self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe {
            bump_scope::alloc::Allocator::deallocate(&self.0, ptr, layout);
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
            bump_scope::alloc::Allocator::grow(&self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::grow_zeroed(&self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::shrink(&self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}
