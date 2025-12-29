//! Bump allocator traits for arena-style memory management.
//!
//! This module provides two traits extending the standard [`Allocator`] trait:
//!
//! - [`BumpAllocator`]: Core bump allocation with scoped arenas and slice copying
//! - [`ResetAllocator`]: Adds bulk deallocation via [`reset`](ResetAllocator::reset)
//!
//! # Overview
//!
//! Bump allocators (also known as arena allocators) allocate memory by incrementing
//! a pointer ("bumping") within a contiguous memory region. Individual deallocations
//! are not supported; instead, all allocations are freed at once by resetting the
//! bump pointer.
//!
//! This trade-off makes bump allocators ideal for:
//!
//! - **Compiler passes**: Temporary data structures that live for a single pass
//! - **AST construction**: Nodes allocated during parsing, freed after compilation
//! - **Batch processing**: Work items processed together, then discarded
//!
//! # Usage
//!
//! Both traits are implemented by [`Heap`] and [`Scratch`] allocators:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{CollectIn, ResetAllocator, Scratch};
//!
//! let mut scratch = Scratch::new();
//!
//! // Allocate some data
//! let vec: Vec<u32, &Scratch> = (1..=3).collect_in(&scratch);
//! drop(vec);
//!
//! // Reset frees all allocations at once
//! scratch.reset();
//! ```
//!
//! # Pass Pattern
//!
//! Compiler passes commonly reset the allocator at the start of `run()` to reuse
//! memory from previous invocations:
//!
//! ```ignore
//! impl TransformPass for MyPass<A: ResetAllocator> {
//!     fn run(&mut self, context: &mut Context, body: &mut Body) {
//!         self.alloc.reset();  // Reuse memory from previous run
//!         // ... pass implementation using self.alloc ...
//!     }
//! }
//! ```
//!
//! [`Heap`]: super::Heap
//! [`Scratch`]: super::Scratch
#![expect(clippy::mut_from_ref, reason = "allocator")]
use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    mem,
};

/// A bump allocator with scoped arenas and efficient slice copying.
///
/// This trait extends [`Allocator`] with arena-style memory management where
/// allocations are made by bumping a pointer within a contiguous memory region.
///
/// # Implementors
///
/// - [`Heap`](super::Heap): Full-featured arena with string interning
/// - [`Scratch`](super::Scratch): Lightweight arena for temporary allocations
pub trait BumpAllocator: Allocator {
    /// The scoped allocator type returned by [`scoped`](Self::scoped).
    ///
    /// This associated type allows each allocator to define its own scoped variant
    /// while ensuring it also implements [`BumpAllocator`].
    type Scoped<'scope>: BumpAllocator;

    /// Executes a closure with a scoped sub-arena.
    ///
    /// A scoped allocator creates a checkpoint in the arena. Allocations made within the
    /// closure use memory after this checkpoint, and when the closure returns, the arena
    /// rewinds to the checkpoint—freeing all scoped allocations while preserving any
    /// allocations made before entering the scope.
    ///
    /// This is useful for temporary intermediate allocations during a computation that
    /// should not outlive the computation itself.
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T;

    /// Copies a slice into the arena, returning a mutable reference to the copy.
    ///
    /// This is useful for transferring borrowed data into arena-owned memory.
    /// The source slice is copied element-by-element into freshly allocated arena memory.
    ///
    /// # Type Requirements
    ///
    /// The element type must be [`Copy`] to ensure safe bitwise copying without
    /// running destructors on the source data.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if memory allocation fails.
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError>;

    /// Copies a slice into the arena, returning a mutable reference to the copy.
    ///
    /// This is the infallible version of
    /// [`try_allocate_slice_copy`](Self::try_allocate_slice_copy).
    ///
    /// # Panics
    ///
    /// Panics if memory allocation fails.
    #[expect(
        clippy::single_match_else,
        clippy::option_if_let_else,
        reason = "clarity"
    )]
    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> &mut [T] {
        match self.try_allocate_slice_copy(slice) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<T>(slice.len()) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }

    /// Allocates an uninitialized slice in the arena.
    ///
    /// Returns a mutable slice of [`MaybeUninit<T>`] with the specified `len`.
    /// The caller is responsible for initializing the elements before reading them.
    ///
    /// This is useful when building a slice incrementally or when copying from
    /// an iterator where [`try_allocate_slice_copy`](Self::try_allocate_slice_copy)
    /// cannot be used.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if memory allocation fails.
    ///
    /// [`MaybeUninit<T>`]: mem::MaybeUninit
    fn try_allocate_slice_uninit<T>(
        &self,
        len: usize,
    ) -> Result<&mut [mem::MaybeUninit<T>], AllocError>;

    /// Allocates an uninitialized slice in the arena.
    ///
    /// This is the infallible version of
    /// [`try_allocate_slice_uninit`](Self::try_allocate_slice_uninit).
    ///
    /// # Panics
    ///
    /// Panics if memory allocation fails.
    #[expect(
        clippy::single_match_else,
        clippy::option_if_let_else,
        reason = "clarity"
    )]
    #[inline]
    fn allocate_slice_uninit<T>(&self, len: usize) -> &mut [mem::MaybeUninit<T>] {
        match self.try_allocate_slice_uninit(len) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<T>(len) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }
}

/// A bump allocator that supports bulk deallocation.
///
/// This trait extends [`BumpAllocator`] with the ability to reset the allocator,
/// freeing all allocations at once. This is the key operation that makes bump
/// allocation efficient: instead of tracking individual deallocations, all memory
/// is reclaimed in a single O(1) operation.
///
/// # Note
///
/// Implementors do not guarantee that [`Drop`] implementations are run for
/// allocated values when resetting. If cleanup is required, callers should
/// use owning types such as [`Box`] or [`Vec`] that handle dropping.
pub trait ResetAllocator: BumpAllocator {
    /// Resets the allocator, freeing all allocations at once.
    ///
    /// After calling `reset`, the allocator's memory is available for reuse.
    /// All previously allocated references become invalid; using them is
    /// undefined behavior (prevented by Rust's borrow checker in safe code).
    ///
    /// The allocator retains its current capacity, avoiding reallocation
    /// on subsequent use.
    fn reset(&mut self);
}

impl<A> BumpAllocator for &mut A
where
    A: BumpAllocator,
{
    type Scoped<'scope> = A::Scoped<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T {
        A::scoped(self, func)
    }

    #[inline]
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError> {
        A::try_allocate_slice_copy(self, slice)
    }

    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> &mut [T] {
        A::allocate_slice_copy(self, slice)
    }

    #[inline]
    fn allocate_slice_uninit<T>(&self, len: usize) -> &mut [mem::MaybeUninit<T>] {
        A::allocate_slice_uninit(self, len)
    }

    #[inline]
    fn try_allocate_slice_uninit<T>(
        &self,
        len: usize,
    ) -> Result<&mut [mem::MaybeUninit<T>], AllocError> {
        A::try_allocate_slice_uninit(self, len)
    }
}

impl<A> ResetAllocator for &mut A
where
    A: ResetAllocator,
{
    #[inline]
    fn reset(&mut self) {
        A::reset(self);
    }
}
