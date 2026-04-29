//! Pool of scratch allocators for parallel bump allocation.
//!
//! [`ScratchPool`] enables bump allocation across multiple threads. Each thread
//! borrows its own [`ScratchPoolGuard`] via [`get`](ScratchPool::get), which provides
//! an independent bump allocator.
//!
//! # Usage
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::ScratchPool;
//!
//! let pool = ScratchPool::new();
//!
//! let guard = pool.get();
//! let mut vec: Vec<u32, _> = Vec::new_in(&guard);
//! vec.push(42);
//! ```

use core::{alloc, mem, ptr};

use bump_scope::{BumpBox, BumpPool, BumpPoolGuard};

use super::{AllocatorScope, BumpAllocator, allocator::Checkpoint};

/// A pool of scratch allocators for parallel bump allocation.
///
/// Unlike [`Scratch`](super::Scratch) which is `!Sync`, `ScratchPool` can be shared
/// across threads. Each thread obtains its own [`ScratchPoolGuard`] via [`get`](Self::get),
/// which provides an independent bump allocator.
///
/// # Example
///
/// ```
/// # #![feature(allocator_api)]
/// use hashql_core::heap::ScratchPool;
///
/// let pool = ScratchPool::new();
/// let guard = pool.get();
///
/// let mut vec: Vec<u32, _> = Vec::new_in(&guard);
/// vec.push(1);
/// vec.push(2);
/// ```
pub struct ScratchPool(BumpPool);

impl ScratchPool {
    /// Creates a new empty scratch pool.
    #[must_use]
    #[inline]
    pub fn new() -> Self {
        Self(BumpPool::new())
    }

    /// Borrows an allocator from the pool.
    ///
    /// Each call may reuse a previously returned allocator or create a new one.
    #[inline]
    pub fn get(&self) -> ScratchPoolGuard<'_> {
        ScratchPoolGuard(self.0.get())
    }

    /// Resets all allocators in the pool, freeing all allocations at once.
    ///
    /// The pool retains its current capacity.
    ///
    /// # Panics
    ///
    /// All [`ScratchPoolGuard`]s must have been dropped before calling this method.
    #[inline]
    pub fn reset(&mut self) {
        self.0.reset();
    }
}

impl Default for ScratchPool {
    fn default() -> Self {
        Self::new()
    }
}

/// A borrowed allocator from a [`ScratchPool`].
///
/// Implements [`BumpAllocator`] and [`Allocator`](alloc::Allocator), so it can be
/// used anywhere a bump allocator is expected.
pub struct ScratchPoolGuard<'pool>(BumpPoolGuard<'pool>);

impl BumpAllocator for ScratchPoolGuard<'_> {
    type Checkpoint = Checkpoint;
    type Scoped<'scope> = AllocatorScope<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T {
        self.0.scoped(|scope| func(AllocatorScope(scope)))
    }

    #[inline]
    fn checkpoint(&self) -> Self::Checkpoint {
        Checkpoint(self.0.checkpoint())
    }

    #[inline]
    unsafe fn rollback(&self, checkpoint: Self::Checkpoint) {
        // SAFETY: The same safety preconditions apply.
        unsafe { self.0.reset_to(checkpoint.0) }
    }

    #[inline]
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.0
            .try_alloc_slice_copy(slice)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn try_allocate_slice_uninit<T>(
        &self,
        len: usize,
    ) -> Result<&mut [mem::MaybeUninit<T>], alloc::AllocError> {
        const {
            assert!(
                !core::mem::needs_drop::<T>(),
                "Cannot allocate a type that needs drop"
            );
        };

        self.0
            .try_alloc_uninit_slice(len)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }
}

// SAFETY: Delegates to bump_scope via the internal BumpPoolGuard.
#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl alloc::Allocator for ScratchPoolGuard<'_> {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate(&*self.0, layout).map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        bump_scope::alloc::Allocator::allocate_zeroed(&*self.0, layout)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe {
            bump_scope::alloc::Allocator::deallocate(&*self.0, ptr, layout);
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
            bump_scope::alloc::Allocator::grow(&*self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::grow_zeroed(&*self.0, ptr, old_layout, new_layout)
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
            bump_scope::alloc::Allocator::shrink(&*self.0, ptr, old_layout, new_layout)
                .map_err(|_err| alloc::AllocError)
        }
    }
}
