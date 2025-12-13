use core::alloc::Allocator;

use bumpalo::Bump;

#[derive(Debug)]
pub struct Scratch {
    bump: Bump,
}

impl Scratch {
    #[must_use]
    pub fn new() -> Self {
        Self { bump: Bump::new() }
    }

    pub fn reset(&mut self) {
        self.bump.reset();
    }
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code, reason = "proxy to bump")]
// SAFETY: this simply delegates to the bump allocator
unsafe impl Allocator for &Scratch {
    fn allocate_zeroed(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        (&self.bump).allocate_zeroed(layout)
    }

    unsafe fn grow(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).shrink(ptr, old_layout, new_layout) }
    }

    fn allocate(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        (&self.bump).allocate(layout)
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).deallocate(ptr, layout) }
    }
}
