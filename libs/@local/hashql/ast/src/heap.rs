//! Memory management utilities for the HashQL Abstract Syntax Tree.
//!
//! This module provides arena-based allocation for AST nodes through a custom `Heap`
//! implementation. Arena allocation is an efficient memory management strategy that
//! significantly improves performance for AST construction.
//!
//! The benefits of arena allocation for AST nodes include:
//!
//! 1. Reducing allocation overhead by batch-allocating memory
//! 2. Eliminating individual deallocation calls
//! 3. Improving cache locality for better memory access patterns
//! 4. Simplifying memory management for tree structures
//!
//! ## Usage
//!
//! AST nodes and collections are parameterized with a `'heap` lifetime that references
//! the memory region where they are allocated.
//!
//! ```
//! use hashql_ast::heap::Heap;
//!
//! let heap = Heap::new();
//! let vec = heap.vec::<u32>(Some(10));
//! let map = heap.hash_map::<String, i32>(None);
//! let boxed = heap.boxed(42);
//! ```
//!
//! ## Type Aliases
//!
//! This module provides type aliases for common collections that work with the custom
//! allocator. When using these types, always use the fully qualified form with the `heap`
//! prefix (e.g., `heap::Box`, `heap::Vec`) to clearly distinguish them from standard
//! library types:
//!
//! - `heap::Box<'heap, T>`: A boxed value allocated on the heap
//! - `heap::Vec<'heap, T>`: A vector allocated on the heap
//! - `heap::VecDeque<'heap, T>`: A double-ended queue allocated on the heap
//! - `heap::HashMap<'heap, K, V, S>`: A hash map allocated on the heap
use core::alloc::Allocator;

use bumpalo::Bump;

/// A boxed value allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Box`](alloc::boxed::Box) type.
pub type Box<'heap, T> = alloc::boxed::Box<T, &'heap Heap>;

/// A vector allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Vec`](alloc::vec::Vec) type.
pub type Vec<'heap, T> = alloc::vec::Vec<T, &'heap Heap>;

/// A double-ended queue allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`VecDeque`](alloc::collections::vec_deque::VecDeque) type.
pub type VecDeque<'heap, T> = alloc::collections::vec_deque::VecDeque<T, &'heap Heap>;

/// A hash map allocated on the `Heap` with an optional custom hasher.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`HashMap`](std::collections::hash_map::HashMap) type.
pub type HashMap<'heap, K, V, S = foldhash::fast::RandomState> =
    hashbrown::HashMap<K, V, S, &'heap Heap>;

/// An arena allocator for AST nodes and collections.
///
/// See the [module level documentation] for more information.
///
/// [module level documentation]: crate::heap
#[derive(Debug)]
pub struct Heap {
    bump: Bump,
}

impl Heap {
    /// Creates a new empty heap.
    ///
    /// Initializes a heap with default capacity, which will grow as needed
    /// when allocations are made.
    #[must_use]
    pub fn new() -> Self {
        Self { bump: Bump::new() }
    }

    /// Creates a new heap with the specified initial capacity.
    ///
    /// Pre-allocates memory to avoid frequent reallocations when building
    /// larger ASTs. This can improve performance when the approximate size
    /// of the AST is known in advance.
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            bump: Bump::with_capacity(capacity),
        }
    }

    pub fn empty_slice<T>(&self) -> Box<[T]> {
        Box::new_in([], self)
    }

    /// Creates a new vector allocated on this heap.
    ///
    /// The capacity is an optional initial capacity for the vector, a value of [`None`] indicates
    /// that the vector should be allocated with a default capacity.
    pub fn vec<T>(&self, capacity: Option<usize>) -> Vec<T> {
        capacity.map_or_else(
            || Vec::new_in(self),
            |capacity| Vec::with_capacity_in(capacity, self),
        )
    }

    pub fn boxed_slice<T>(&self, vec: ::alloc::vec::Vec<T>) -> Box<[T]> {
        let mut target = Vec::with_capacity_in(vec.len(), self);
        target.extend(vec);

        target.into_boxed_slice()
    }

    /// Creates a new hash map allocated on this heap.
    ///
    /// The capacity is an optional initial capacity for the hash map, a value of [`None`] indicates
    /// that the hash map should be allocated with a default capacity.
    pub fn hash_map<K, V>(&self, capacity: Option<usize>) -> HashMap<K, V> {
        capacity.map_or_else(
            || HashMap::with_hasher_in(foldhash::fast::RandomState::default(), self),
            |capacity| {
                HashMap::with_capacity_and_hasher_in(
                    capacity,
                    foldhash::fast::RandomState::default(),
                    self,
                )
            },
        )
    }

    /// Creates a new deque allocated on this heap.
    ///
    /// The capacity is an optional initial capacity for the deque, a value of [`None`] indicates
    /// that the deque should be allocated with a default capacity.
    pub fn dequeue<T>(&self, capacity: Option<usize>) -> VecDeque<T> {
        capacity.map_or_else(
            || VecDeque::new_in(self),
            |capacity| VecDeque::with_capacity_in(capacity, self),
        )
    }

    /// Creates a new boxed value allocated on this heap.
    pub fn boxed<T>(&self, value: T) -> Box<T> {
        alloc::boxed::Box::new_in(value, self)
    }
}

impl Default for Heap {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code, reason = "proxy to bump")]
// SAFETY: this simply delegates to the bump allocator
unsafe impl Allocator for &Heap {
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
