//! Memory management utilities for HashQL.
//!
//! This module provides arena-based allocation through [`Heap`] and [`Scratch`].
//!
//! # Usage
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::Heap;
//!
//! let heap = Heap::new();
//!
//! // Allocate collections in the arena
//! let mut vec: hashql_core::heap::Vec<'_, u32> = Vec::new_in(&heap);
//! vec.push(1);
//! vec.push(2);
//!
//! // Intern strings for efficient comparison
//! let sym1 = heap.intern_symbol("hello");
//! let sym2 = heap.intern_symbol("hello");
//! assert!(std::ptr::eq(sym1.as_str(), sym2.as_str())); // Same pointer
//! ```
//!
//! # Type Aliases
//!
//! Use the `heap::` prefix to distinguish from standard library types:
//!
//! - [`heap::Box<'heap, T>`](Box)
//! - [`heap::Vec<'heap, T>`](Vec)
//! - [`heap::VecDeque<'heap, T>`](VecDeque)
//! - [`heap::HashMap<'heap, K, V, S>`](HashMap)
//!
//! # Allocator-Aware Traits
//!
//! This module provides traits that mirror standard library traits but accept an allocator:
//!
//! | Trait | Std Equivalent | Use When |
//! |-------|----------------|----------|
//! | [`CloneIn`] | [`Clone`] | Cloning a value into an arena |
//! | [`FromIn`] / [`IntoIn`] | [`From`] / [`Into`] | Converting types with allocation |
//! | [`FromIteratorIn`] / [`CollectIn`] | [`FromIterator`] / [`Iterator::collect`] | Collecting iterators into arena containers |
//! | [`TransferInto`] | — | Copying `&[T]` or `&str` into an arena |
//!
//! ## [`CloneIn`]
//!
//! Clone a value into an allocator:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{CloneIn, Heap};
//!
//! let heap = Heap::new();
//! let original: Vec<u32> = vec![1, 2, 3];
//! let cloned: hashql_core::heap::Vec<'_, u32> = original.clone_in(&heap);
//! ```
//!
//! ## [`FromIn`] / [`IntoIn`]
//!
//! Convert values with allocation:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{Heap, IntoIn};
//!
//! let heap = Heap::new();
//! let boxed: hashql_core::heap::Box<'_, i32> = 42_i32.into_in(&heap);
//! ```
//!
//! ## [`CollectIn`]
//!
//! Collect iterators into arena containers:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{CollectIn, Heap};
//!
//! let heap = Heap::new();
//! let vec: hashql_core::heap::Vec<'_, i32> = (0..5).collect_in(&heap);
//! ```
//!
//! ## [`TransferInto`]
//!
//! Copy borrowed data (`&[T]` or `&str`) into the arena. Only implemented for arena allocators
//! to prevent memory leaks from creating `&'static` references:
//!
//! ```
//! # #![feature(allocator_api)]
//! use hashql_core::heap::{Heap, TransferInto};
//!
//! let heap = Heap::new();
//! let slice: &[u32] = &[1, 2, 3];
//! let arena_slice: &mut [u32] = slice.transfer_into(&heap);
//! ```
#![expect(unsafe_code)]
mod allocator;
mod bump;
mod clone;
mod convert;
mod iter;
mod scratch;
mod transfer;

use core::{alloc, ptr};
use std::sync::Mutex;

use ::alloc::{boxed, collections::vec_deque, vec};
use hashbrown::HashSet;

use self::allocator::{Allocator, AllocatorScope};
pub use self::{
    bump::{BumpAllocator, ResetAllocator},
    clone::{CloneIn, TryCloneIn},
    convert::{FromIn, IntoIn},
    iter::{CollectIn, FromIteratorIn},
    scratch::Scratch,
    transfer::TransferInto,
};
use crate::{
    collections::{FastHashSet, fast_hash_set_with_capacity},
    symbol::{Symbol, sym::TABLES},
};

/// A boxed value allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Box`](::alloc::boxed::Box) type.
pub type Box<'heap, T> = boxed::Box<T, &'heap Heap>;

/// A vector allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Vec`](::alloc::vec::Vec) type.
pub type Vec<'heap, T> = vec::Vec<T, &'heap Heap>;

/// A double-ended queue allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`VecDeque`](::alloc::collections::vec_deque::VecDeque) type.
pub type VecDeque<'heap, T> = vec_deque::VecDeque<T, &'heap Heap>;

/// A hash map allocated on the `Heap` with an optional custom hasher.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`HashMap`](std::collections::hash_map::HashMap) type.
pub type HashMap<'heap, K, V, S = foldhash::fast::RandomState> =
    hashbrown::HashMap<K, V, S, &'heap Heap>;

/// An arena allocator for AST nodes and collections with string interning.
///
/// Combines a bump allocator with a string interning table for deduplicated
/// symbol storage. Interned strings enable O(1) comparison via pointer equality.
#[derive(Debug)]
pub struct Heap {
    inner: Allocator,
    // Interned strings stored as `&'static str` for implementation convenience.
    // SAFETY: The `'static` is a lie. These point into arena memory and are safe because:
    // - All access goes through `Symbol<'heap>`, bounding the effective lifetime
    // - This set is cleared before `inner.reset()` is called
    strings: Mutex<HashSet<&'static str, foldhash::fast::RandomState>>,
}

impl Heap {
    /// Creates a new empty heap without performing initial allocations.
    ///
    /// This creates a heap structure without allocating memory for common symbols.
    /// The actual allocation work is deferred until [`Self::prime`] is called,
    /// allowing precise control over when memory allocation occurs.
    ///
    /// For normal usage, prefer [`Self::new`] which handles initialization automatically.
    ///
    /// # Usage Requirements
    ///
    /// The caller must call [`Self::prime`] exactly once before using the heap
    /// for any allocations or symbol interning operations. Using an unprimed heap may
    /// result in missing essential symbols that other parts of the system expect to exist.
    #[must_use]
    #[inline]
    pub fn uninitialized() -> Self {
        Self {
            inner: Allocator::new(),
            strings: Mutex::default(),
        }
    }

    /// Primes an empty heap with common symbols, performing the deferred allocations.
    ///
    /// This method allocates memory for and initializes the heap's symbol table with
    /// predefined symbols from the global symbol tables. It performs the allocation
    /// work that was deferred when the heap was created with [`Self::uninitialized`].
    ///
    /// This is automatically called by [`Self::new`] and [`Self::reset`], so manual
    /// invocation is only necessary when using the [`Self::uninitialized`] constructor.
    ///
    /// # Panics
    ///
    /// Panics if the heap is already primed.
    pub fn prime(&mut self) {
        let strings = self.strings.get_mut().expect("lock should not be poisoned");
        assert!(
            strings.is_empty(),
            "heap has already been primed or has interned symbols"
        );

        Self::prime_symbols(strings);
    }

    /// Creates a new heap.
    ///
    /// Creates and immediately primes the heap with common symbols. The heap will start with
    /// default capacity and grow as needed.
    ///
    /// For cases where you need control over allocation timing, use [`Self::uninitialized`]
    /// followed by [`Self::prime`].
    #[must_use]
    #[inline]
    pub fn new() -> Self {
        let mut strings = fast_hash_set_with_capacity(0);
        Self::prime_symbols(&mut strings);

        Self {
            inner: Allocator::new(),
            strings: Mutex::new(strings),
        }
    }

    /// Creates a new heap with the specified initial capacity.
    ///
    /// Pre-allocates memory to avoid frequent reallocations when building larger ASTs. This can
    /// improve performance when the approximate size of the AST is known in advance.
    ///
    /// The heap is immediately primed with common symbols.
    #[must_use]
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        let mut strings = fast_hash_set_with_capacity(0);
        Self::prime_symbols(&mut strings);

        Self {
            inner: Allocator::with_capacity(capacity),
            strings: Mutex::new(strings),
        }
    }

    /// Allocates a value in the arena, returning a mutable reference.
    ///
    /// Only accepts types that do **not** require [`Drop`]. Types requiring destructors
    /// must use [`heap::Box`](Box) or [`heap::Vec`](Vec) instead.
    #[inline]
    pub fn alloc<T>(&self, value: T) -> &mut T {
        const { assert!(!core::mem::needs_drop::<T>()) };

        self.inner.alloc_with(|| value)
    }

    fn prime_symbols(strings: &mut FastHashSet<&'static str>) {
        strings.reserve(TABLES.iter().map(|table| table.len()).sum());

        for &table in TABLES {
            for &symbol in table {
                assert!(strings.insert(symbol.as_str()));
            }
        }
    }

    /// Interns a string symbol, returning a reference to the interned value.
    ///
    /// If the string has already been interned, returns the existing [`Symbol`] pointing
    /// to the same memory. Otherwise, copies the string into the arena and creates a new
    /// [`Symbol`].
    ///
    /// Two calls to `intern_symbol` with equal strings will return [`Symbol`]s that compare
    /// equal via pointer comparison (O(1)), not string comparison.
    ///
    /// # Panics
    ///
    /// Panics if the internal mutex is poisoned.
    pub fn intern_symbol<'this>(&'this self, value: &str) -> Symbol<'this> {
        let mut strings = self.strings.lock().expect("lock should not be poisoned");

        if let Some(&string) = strings.get(value) {
            return Symbol::new_unchecked(string);
        }

        let string = &*value.transfer_into(self);

        // SAFETY: The `'static` lifetime is a lie to enable HashSet storage.
        // Sound because: (1) external access is through `Symbol<'this>`, (2) strings
        // are cleared before arena reset, (3) `reset()` requires `&mut self`.
        #[expect(unsafe_code)]
        let string: &'static str = unsafe { &*ptr::from_ref::<str>(string) };

        strings.insert(string);
        drop(strings);

        Symbol::new_unchecked(string)
    }
}

impl Default for Heap {
    fn default() -> Self {
        Self::new()
    }
}

impl BumpAllocator for Heap {
    type Scoped<'scope> = AllocatorScope<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Self::Scoped<'_>) -> T) -> T {
        self.inner.scoped(func)
    }

    #[inline]
    fn try_allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], alloc::AllocError> {
        self.inner.try_allocate_slice_copy(slice)
    }
}

impl ResetAllocator for Heap {
    /// Resets the heap, invalidating all previous allocations.
    ///
    /// Clears all allocations and re-primes with common symbols.
    /// The allocator retains its current capacity.
    ///
    /// # Panics
    ///
    /// Panics if the internal mutex is poisoned.
    #[inline]
    fn reset(&mut self) {
        // IMPORTANT: Clear strings BEFORE resetting the arena to prevent dangling references.
        // The HashSet stores `&'static str` that actually point into arena memory.
        {
            let mut strings = self.strings.lock().expect("lock should not be poisoned");
            strings.clear();
            Self::prime_symbols(&mut strings);
            drop(strings);
        }

        self.inner.reset();
    }
}

// SAFETY: Delegates to bumpalo::Bump via the internal Allocator.
#[expect(unsafe_code, reason = "proxy to internal allocator")]
unsafe impl alloc::Allocator for Heap {
    #[inline]
    fn allocate(&self, layout: alloc::Layout) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        self.inner.allocate(layout)
    }

    #[inline]
    fn allocate_zeroed(
        &self,
        layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        self.inner.allocate_zeroed(layout)
    }

    #[inline]
    unsafe fn grow(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn grow_zeroed(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn shrink(
        &self,
        ptr: ptr::NonNull<u8>,
        old_layout: alloc::Layout,
        new_layout: alloc::Layout,
    ) -> Result<ptr::NonNull<[u8]>, alloc::AllocError> {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    #[inline]
    unsafe fn deallocate(&self, ptr: ptr::NonNull<u8>, layout: alloc::Layout) {
        // SAFETY: Caller upholds Allocator contract.
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
