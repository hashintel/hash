//! Byte accounting at the allocator boundary.
//!
//! [`MemoryUsageAllocator`] tallies the layout sizes requested through an allocator. Counting
//! allocation requests avoids a separate hand-maintained size estimate for those allocations. The
//! tally is a request-side figure and not a resident-size measurement. [`MemoryUsage`] is a cheap
//! reading handle to the same counter for code that does not hold the allocator.

use core::{
    alloc::{self, Allocator},
    ptr,
    sync::atomic::{self, Atomic},
};
use std::alloc::Global;

use ::alloc::sync::Arc;

/// A reading handle onto one allocator's byte tally.
///
/// Clones observe the same counter.
#[derive(Debug, Clone)]
pub(crate) struct MemoryUsage(Arc<Atomic<usize>>);

impl MemoryUsage {
    /// Reads the running tally of requested bytes.
    ///
    /// The figure follows the requested layout sizes, including successful resizes and the sizes
    /// named when blocks are released. It counts requested bytes rather than the wrapped
    /// allocator's excess capacity or the process's resident pages. When no allocator operation is
    /// in progress and you have synchronized earlier operations with this read,
    /// [`MemoryUsageAllocator`]'s accounting conditions make it the total requested size of its
    /// live counted allocations.
    ///
    /// A relaxed load returns a snapshot that may already be stale when used. It imposes no
    /// ordering on the allocations it counts.
    pub(crate) fn get(&self) -> usize {
        self.0.load(atomic::Ordering::Relaxed)
    }
}

/// An allocator that tallies the layout sizes requested through it.
///
/// [`Allocator::allocate`] and [`Allocator::allocate_zeroed`] add `layout.size()`, a grow adds
/// the difference between the two requested sizes, a shrink subtracts that difference, and
/// [`Allocator::deallocate`] subtracts the size of the layout it is handed. Every figure is a
/// size a caller supplied. The wrapped allocator's own padding, its over-allocation above the
/// requested size, and the pages the system has actually committed are all invisible here.
///
/// Once all allocator operations have completed, interpreting the total as the requested size of
/// live counted allocations requires consistent layout accounting. Each deallocation and each old
/// layout supplied for resizing must name that block's last requested size. Every allocation
/// intended for the total must also pass through this allocator or one of its clones. Bytes
/// obtained elsewhere are never counted.
///
/// The tally records the supplied sizes even when a later fitting layout names more bytes than the
/// allocation requested. A resize then adjusts from that supplied old size. Deallocation subtracts
/// the supplied size and wraps the unsigned counter if that subtraction underflows. These
/// accounting conditions do not limit the wrapped allocator's excess capacity, which the tally
/// still excludes.
///
/// All clones share one counter.
#[derive(Debug, Clone)]
pub(crate) struct MemoryUsageAllocator<A: Allocator = Global> {
    allocator: A,
    memory_usage: Arc<Atomic<usize>>,
}

impl<A: Allocator> MemoryUsageAllocator<A> {
    /// Wraps `allocator` with a zeroed counter.
    pub(crate) fn new(allocator: A) -> Self {
        Self {
            allocator,
            memory_usage: Arc::new(Atomic::<usize>::new(0)),
        }
    }

    /// Returns a reading handle onto this allocator's counter.
    pub(crate) fn memory_usage(&self) -> MemoryUsage {
        MemoryUsage(Arc::clone(&self.memory_usage))
    }
}

impl MemoryUsageAllocator {
    /// Wraps the global allocator with a zeroed counter.
    pub(crate) fn global() -> Self {
        Self::new(Global)
    }
}

// SAFETY: every method forwards to the wrapped allocator and returns its blocks unchanged.
// Currently-allocated pointers, layout fit, and block validity are exactly the wrapped allocator's.
// Clones share the wrapped allocator's clone semantics and one counter, so blocks allocated through
// one clone deallocate through another exactly when the wrapped allocator permits it. The counter
// only observes layouts and never touches the blocks.
unsafe impl<A: Allocator> Allocator for MemoryUsageAllocator<A> {
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        let ptr = self.allocator.allocate_zeroed(layout)?;

        self.memory_usage
            .fetch_add(layout.size(), atomic::Ordering::Relaxed);

        Ok(ptr)
    }

    unsafe fn grow(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: The caller guarantees that `ptr` is currently allocated, `old_layout` fits it and
        // `new_layout` is at least as large. This allocator returns the wrapped allocator's blocks
        // unchanged. The same preconditions therefore hold for its `grow` call.
        let new_ptr = unsafe { self.allocator.grow(ptr, old_layout, new_layout)? };

        self.memory_usage.fetch_add(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: every block this allocator returns comes from the wrapped allocator unchanged.
        // The caller's obligations transfer verbatim.
        let new_ptr = unsafe { self.allocator.grow_zeroed(ptr, old_layout, new_layout)? };

        self.memory_usage.fetch_add(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: every block this allocator returns comes from the wrapped allocator unchanged.
        // The caller's obligations transfer verbatim.
        let new_ptr = unsafe { self.allocator.shrink(ptr, old_layout, new_layout)? };
        self.memory_usage.fetch_sub(
            old_layout.size().abs_diff(new_layout.size()),
            atomic::Ordering::Relaxed,
        );

        Ok(new_ptr)
    }

    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        let ptr = self.allocator.allocate(layout)?;
        self.memory_usage
            .fetch_add(layout.size(), atomic::Ordering::Relaxed);

        Ok(ptr)
    }

    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        self.memory_usage
            .fetch_sub(layout.size(), atomic::Ordering::Relaxed);

        // SAFETY: every block this allocator returns comes from the wrapped allocator unchanged.
        // The caller's obligations transfer verbatim.
        unsafe {
            self.allocator.deallocate(ptr, layout);
        }
    }
}

/// A value that can report the heap bytes it holds.
///
/// Implementations report the bytes that would be released by dropping the value and leave out
/// the bytes the value occupies inline in its owner. Composite values sum their parts. A value that
/// holds nothing on the heap reports zero.
///
/// An implementation using [`MemoryUsage`] reports its allocator's current tally rather than a
/// figure derived from the value's contents.
pub(crate) trait HeapMemoryUsage {
    /// Returns the bytes this value holds on the heap.
    fn heap_memory_usage(&self) -> u64;
}

#[cfg(test)]
mod tests {
    mod miri {
        use core::alloc::{Allocator as _, Layout};

        use crate::allocator::MemoryUsageAllocator;

        #[test]
        fn allocation_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();
            assert_eq!(usage.get(), 0);

            let layout = Layout::array::<u8>(16).expect("layout for 16 bytes should be valid");
            let ptr = allocator
                .allocate(layout)
                .expect("allocation should succeed");
            assert_eq!(usage.get(), layout.size());

            // SAFETY: `ptr` came from `allocate` above with `layout`, and this call is its only
            // deallocation.
            unsafe {
                allocator.deallocate(ptr.cast(), layout);
            }
            assert_eq!(usage.get(), 0);
        }

        #[test]
        fn zeroed_allocation_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();

            let layout = Layout::array::<u8>(32).expect("layout for 32 bytes should be valid");
            let ptr = allocator
                .allocate_zeroed(layout)
                .expect("allocation should succeed");
            assert_eq!(usage.get(), layout.size());

            // SAFETY: `ptr` came from `allocate_zeroed` above, which initializes every returned
            // byte.
            let block = unsafe { ptr.as_ref() };
            assert!(block.iter().all(|&byte| byte == 0));

            // SAFETY: `ptr` came from `allocate_zeroed` above with `layout`, deallocated exactly
            // once.
            unsafe {
                allocator.deallocate(ptr.cast(), layout);
            }
            assert_eq!(usage.get(), 0);
        }

        #[test]
        fn growth_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();

            let old_layout = Layout::array::<u8>(8).expect("layout for 8 bytes should be valid");
            let new_layout = Layout::array::<u8>(64).expect("layout for 64 bytes should be valid");
            let ptr = allocator
                .allocate(old_layout)
                .expect("allocation should succeed")
                .cast::<u8>();
            assert_eq!(usage.get(), old_layout.size());

            // SAFETY: `ptr` denotes the current allocation of `old_layout` from `allocate` above,
            // and `new_layout`'s size is at least `old_layout`'s.
            let grown = unsafe {
                allocator
                    .grow(ptr, old_layout, new_layout)
                    .expect("grow should succeed")
            };
            assert_eq!(usage.get(), new_layout.size());

            // SAFETY: `grown` denotes the current allocation of `new_layout`, deallocated exactly
            // once.
            unsafe {
                allocator.deallocate(grown.cast(), new_layout);
            }
            assert_eq!(usage.get(), 0);
        }

        #[test]
        fn zeroed_growth_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();

            let old_layout = Layout::array::<u8>(8).expect("layout for 8 bytes should be valid");
            let new_layout = Layout::array::<u8>(64).expect("layout for 64 bytes should be valid");
            let ptr = allocator
                .allocate(old_layout)
                .expect("allocation should succeed")
                .cast::<u8>();
            // SAFETY: `ptr` denotes `old_layout.size()` writable bytes from `allocate` above.
            unsafe {
                ptr.as_ptr().write_bytes(0xAA, old_layout.size());
            }

            // SAFETY: `ptr` denotes the current allocation of `old_layout` from `allocate` above,
            // and `new_layout`'s size is at least `old_layout`'s.
            let grown = unsafe {
                allocator
                    .grow_zeroed(ptr, old_layout, new_layout)
                    .expect("grow_zeroed should succeed")
            };
            assert_eq!(usage.get(), new_layout.size());

            // SAFETY: `grown` came from `grow_zeroed` above, which initializes every byte it
            // returns.
            let block = unsafe { grown.as_ref() };
            assert!(
                block[old_layout.size()..new_layout.size()]
                    .iter()
                    .all(|&byte| byte == 0)
            );

            // SAFETY: `grown` denotes the current allocation of `new_layout`, deallocated exactly
            // once.
            unsafe {
                allocator.deallocate(grown.cast(), new_layout);
            }
            assert_eq!(usage.get(), 0);
        }

        #[test]
        fn shrink_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();

            let old_layout = Layout::array::<u8>(64).expect("layout for 64 bytes should be valid");
            let new_layout = Layout::array::<u8>(8).expect("layout for 8 bytes should be valid");
            let ptr = allocator
                .allocate(old_layout)
                .expect("allocation should succeed")
                .cast::<u8>();
            assert_eq!(usage.get(), old_layout.size());

            // SAFETY: `ptr` denotes the current allocation of `old_layout` from `allocate` above,
            // and `new_layout`'s size does not exceed `old_layout`'s.
            let shrunk = unsafe {
                allocator
                    .shrink(ptr, old_layout, new_layout)
                    .expect("shrink should succeed")
            };
            assert_eq!(usage.get(), new_layout.size());

            // SAFETY: `shrunk` denotes the current allocation of `new_layout`, deallocated exactly
            // once.
            unsafe {
                allocator.deallocate(shrunk.cast(), new_layout);
            }
            assert_eq!(usage.get(), 0);
        }

        #[test]
        fn vec_growth_tally() {
            let allocator = MemoryUsageAllocator::global();
            let usage = allocator.memory_usage();
            assert_eq!(usage.get(), 0);

            let mut vec: ::alloc::vec::Vec<u8, _> = ::alloc::vec::Vec::new_in(allocator);
            for byte in 0..u8::MAX {
                vec.push(byte);
            }
            assert!(usage.get() >= usize::from(u8::MAX));

            drop(vec);
            assert_eq!(usage.get(), 0);
        }
    }
}
