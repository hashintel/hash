//! A forwarding allocator that counts deallocations, for `Drop` contract tests.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    cell::Cell,
    ptr::NonNull,
};

/// Forwards to [`Global`] and counts deallocations.
pub(crate) struct CountingAllocator {
    deallocations: Cell<usize>,
}

impl CountingAllocator {
    pub(crate) fn new() -> Self {
        Self {
            deallocations: Cell::new(0),
        }
    }

    pub(crate) fn deallocations(&self) -> usize {
        self.deallocations.get()
    }
}

// SAFETY: allocation and deallocation forward to `Global` unchanged. The count is bookkeeping.
unsafe impl Allocator for CountingAllocator {
    fn allocate(&self, layout: Layout) -> Result<NonNull<[u8]>, AllocError> {
        Global.allocate(layout)
    }

    unsafe fn deallocate(&self, ptr: NonNull<u8>, layout: Layout) {
        self.deallocations.set(self.deallocations.get() + 1);
        // SAFETY: `ptr` came from `allocate` above, which forwarded to `Global` with this layout.
        unsafe { Global.deallocate(ptr, layout) }
    }
}
