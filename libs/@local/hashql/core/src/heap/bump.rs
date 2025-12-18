//! Bump allocator trait for arena-style memory management.
//!
//! This module provides the [`BumpAllocator`] trait, an extension to the standard
//! [`Allocator`] trait that adds support for bulk deallocation via [`reset`](BumpAllocator::reset).
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
//! The trait is implemented by [`Heap`] and [`Scratch`] allocators:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{BumpAllocator, CollectIn, Scratch};
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
//! impl TransformPass for MyPass<A: BumpAllocator> {
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
use core::alloc::{AllocError, Allocator};

/// A bump allocator that supports bulk deallocation.
///
/// This trait extends [`Allocator`] with arena-style memory management:
/// allocations are made by bumping a pointer, and all memory is freed at once
/// via [`reset`](Self::reset).
///
/// # Implementors
///
/// - [`Heap`](super::Heap): Full-featured arena with string interning
/// - [`Scratch`](super::Scratch): Lightweight arena for temporary allocations
pub trait BumpAllocator: Allocator {
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
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError>;

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

/// Blanket implementation allowing `&mut A` to be used where `A: BumpAllocator`.
///
/// This enables passes to store `&mut Scratch` or `&mut Heap` while still
/// calling [`reset`](BumpAllocator::reset) through the mutable reference.
impl<A> BumpAllocator for &mut A
where
    A: BumpAllocator,
{
    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError> {
        A::allocate_slice_copy(self, slice)
    }

    #[inline]
    fn reset(&mut self) {
        A::reset(self);
    }
}
