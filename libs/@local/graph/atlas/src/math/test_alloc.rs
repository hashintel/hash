use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    cell::Cell,
    ptr::NonNull,
};

/// A [`Global`] allocator with a deallocation counter for ownership tests.
pub(crate) struct CountingAllocator {
    deallocations: Cell<usize>,
}

impl CountingAllocator {
    /// Creates an allocator with a zero deallocation count.
    pub(crate) fn new() -> Self {
        Self {
            deallocations: Cell::new(0),
        }
    }

    /// Returns how many deallocations have passed through this allocator.
    pub(crate) fn deallocations(&self) -> usize {
        self.deallocations.get()
    }
}

// SAFETY: Allocator requires allocations to remain valid until released through that allocator. All
// instances delegate storage management to Global, and moving or dropping the counter leaves those
// allocations unchanged. Therefore this implementation preserves Global's allocation lifetime and
// layout contracts.
unsafe impl Allocator for CountingAllocator {
    fn allocate(&self, layout: Layout) -> Result<NonNull<[u8]>, AllocError> {
        Global.allocate(layout)
    }

    unsafe fn deallocate(&self, ptr: NonNull<u8>, layout: Layout) {
        self.deallocations.set(self.deallocations.get() + 1);
        // SAFETY: the caller must provide a currently allocated pointer and a fitting layout. All
        // buffers this allocator obtains come from Global, with their allocation layouts preserved
        // unchanged through this call. Therefore Global may deallocate this pointer with the
        // supplied layout under the caller's obligations.
        unsafe { Global.deallocate(ptr, layout) }
    }
}
