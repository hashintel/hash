//! Memory management utilities for HashQL.
//!
//! This module provides arena-based allocation through a custom [`Heap`] implementation.
//! Arena allocation is an efficient memory management strategy that significantly improves
//! performance for AST construction and query processing.
//!
//! # Benefits of Arena Allocation
//!
//! 1. **Reduced allocation overhead**: Memory is allocated in large chunks, amortizing the cost of
//!    system allocator calls
//! 2. **Bulk deallocation**: All allocations are freed at once when the arena is dropped or reset,
//!    eliminating per-object deallocation overhead
//! 3. **Improved cache locality**: Related objects are allocated contiguously, improving CPU cache
//!    utilization
//! 4. **Simplified lifetime management**: All objects share the arena's lifetime, eliminating
//!    complex ownership hierarchies
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                          Heap                               │
//! │  ┌───────────────────┐  ┌─────────────────────────────────┐ │
//! │  │     Allocator     │  │ Mutex<HashSet<&'static str>>    │ │
//! │  │    (bumpalo)      │  │     (interned strings)          │ │
//! │  └───────────────────┘  └─────────────────────────────────┘ │
//! └─────────────────────────────────────────────────────────────┘
//!            │                           │
//!            ▼                           ▼
//!    heap::Vec, heap::Box         Symbol<'heap>
//!    (arena-allocated)         (lifetime-bounded)
//! ```
//!
//! ## Components
//!
//! | Component | Purpose |
//! |-----------|---------|
//! | [`Heap`] | Primary allocator with string interning for AST construction |
//! | [`Scratch`] | Lightweight allocator for temporary allocations |
//! | [`Allocator`](allocator::Allocator) | Internal bumpalo wrapper (not public) |
//!
//! ## Traits
//!
//! | Trait | Purpose |
//! |-------|---------|
//! | [`TransferInto`] / [`TryTransferInto`] | Copy data into an allocator |
//! | [`CloneIn`] / [`TryCloneIn`] | Clone values using a custom allocator |
//! | [`FromIn`] / [`IntoIn`] | Convert values with allocation |
//! | [`FromIteratorIn`] / [`CollectIn`] | Collect iterators into arena containers |
//!
//! # Safety Invariants
//!
//! ## Lifetime Encapsulation
//!
//! The [`Heap`] uses a `'static` lifetime internally for storing interned strings in
//! a [`HashSet`](hashbrown::HashSet). This is safe because:
//!
//! 1. All external access goes through [`Symbol<'heap>`](crate::symbol::Symbol), which correctly
//!    bounds the lifetime to the heap
//! 2. The string table is cleared *before* the arena is reset (see [`Heap::reset`])
//! 3. `Symbol`'s pointer-based equality relies on interning uniqueness, which is enforced by
//!    checking the `HashSet` before insertion
//!
//! ## Borrow Checker Protection
//!
//! Arena invalidation (`reset()` or `drop()`) is protected by Rust's borrow checker:
//!
//! - `reset()` requires `&mut self`
//! - `drop()` requires ownership
//! - Allocations require `&self`
//!
//! Therefore, outstanding references prevent arena invalidation at compile time.
//!
//! ## No-Drop Constraint
//!
//! The [`Heap::alloc`] method enforces `!needs_drop::<T>()` at compile time. Types
//! requiring destructors must use [`heap::Box`](Box) or [`heap::Vec`](Vec), which
//! run their `Drop` implementations before the arena reclaims memory.
//!
//! # Usage
//!
//! Types are parameterized with a `'heap` lifetime that ties them to their allocator:
//!
//! ```
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
//! This module provides type aliases for common collections. Always use the fully
//! qualified form with the `heap::` prefix to distinguish from standard library types:
//!
//! - [`heap::Box<'heap, T>`](Box): A boxed value allocated in the arena
//! - [`heap::Vec<'heap, T>`](Vec): A vector allocated in the arena
//! - [`heap::VecDeque<'heap, T>`](VecDeque): A double-ended queue in the arena
//! - [`heap::HashMap<'heap, K, V, S>`](HashMap): A hash map in the arena
//!
//! # Thread Safety
//!
//! [`Heap`] and [`Scratch`] are `Send` but not `Sync`, inherited from the underlying
//! [`bumpalo::Bump`]. This means:
//!
//! - ✓ You can move an allocator to another thread
//! - ✗ You cannot share `&Heap` across threads
//!
//! The `Mutex` on the string table protects against re-entrant access within a single
//! thread, not concurrent multi-threaded access.
#![expect(unsafe_code)]
mod allocator;
mod clone;
mod convert;
mod iter;
mod scratch;
mod transfer;

use core::ptr;
use std::sync::Mutex;

use ::alloc::{alloc, boxed, collections::vec_deque, vec};
use hashbrown::HashSet;

use self::allocator::Allocator;
pub use self::{
    clone::{CloneIn, TryCloneIn},
    convert::{FromIn, IntoIn},
    iter::{CollectIn, FromIteratorIn},
    scratch::Scratch,
    transfer::{TransferInto, TryTransferInto},
};
use crate::{
    collections::{FastHashSet, fast_hash_set_with_capacity},
    symbol::{Symbol, sym::TABLES},
};

/// A boxed value allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Box`](alloc::boxed::Box) type.
pub type Box<'heap, T> = boxed::Box<T, &'heap Heap>;

/// A vector allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`Vec`](alloc::vec::Vec) type.
pub type Vec<'heap, T> = vec::Vec<T, &'heap Heap>;

/// A double-ended queue allocated on the `Heap`.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`VecDeque`](alloc::collections::vec_deque::VecDeque) type.
pub type VecDeque<'heap, T> = vec_deque::VecDeque<T, &'heap Heap>;

/// A hash map allocated on the `Heap` with an optional custom hasher.
///
/// This type should always be used with the `heap::` prefix to avoid confusion
/// with the standard library [`HashMap`](std::collections::hash_map::HashMap) type.
pub type HashMap<'heap, K, V, S = foldhash::fast::RandomState> =
    hashbrown::HashMap<K, V, S, &'heap Heap>;

/// An arena allocator for AST nodes and collections with string interning.
///
/// `Heap` is the primary memory allocator for HashQL's compilation pipeline. It combines
/// a bump allocator for efficient memory allocation with a string interning table for
/// deduplicated symbol storage.
///
/// See the [module-level documentation](crate::heap) for architecture details and safety
/// invariants.
///
/// # String Interning
///
/// The heap maintains an internal table of interned strings. When you call
/// [`intern_symbol`](Self::intern_symbol), the string is:
///
/// 1. Checked against existing interned strings
/// 2. If found, the existing reference is returned
/// 3. If not found, the string is copied into the arena and added to the table
///
/// This enables O(1) string comparison via pointer equality in [`Symbol`](crate::symbol::Symbol).
///
/// # Internal Representation
///
/// The string table stores `&'static str` references internally for implementation
/// convenience (avoiding lifetime parameters in the `HashSet`). This is safe because:
///
/// - External access is always through `Symbol<'heap>`, which correctly bounds the lifetime
/// - The table is cleared before arena reset (see [`reset`](Self::reset))
/// - The `'static` references never escape the heap abstraction
#[derive(Debug)]
pub struct Heap {
    inner: Allocator,
    /// Interned strings stored as `&'static str` for implementation convenience.
    ///
    /// # Safety
    ///
    /// These references point into arena-allocated memory. The `'static` lifetime is a
    /// lie that is safe because:
    /// 1. All access goes through `Symbol<'heap>`, bounding the effective lifetime
    /// 2. This set is cleared before `inner.reset()` is called
    /// 3. The `Heap` is `!Sync`, preventing concurrent access issues
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

    /// Resets the heap, invalidating all previous allocations.
    ///
    /// This method:
    /// 1. Clears the interned string table
    /// 2. Re-primes with common symbols from [`TABLES`](crate::symbol::sym::TABLES)
    /// 3. Resets the underlying arena allocator
    ///
    /// The allocator retains its current capacity for future allocations.
    ///
    /// # Safety Ordering
    ///
    /// The string table is cleared *before* the arena is reset. This ensures no
    /// `&'static str` references in the table point to freed memory.
    ///
    /// # Borrow Checker Protection
    ///
    /// This method takes `&mut self`, which cannot coexist with any `&self` borrows.
    /// Since allocations and `intern_symbol` require `&self`, the borrow checker
    /// prevents calling `reset()` while any references to allocated data exist.
    ///
    /// # Panics
    ///
    /// Panics if the internal mutex is poisoned.
    pub fn reset(&mut self) {
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

    /// Allocates a value in the arena, returning a mutable reference.
    ///
    /// This is the primary method for allocating individual values. The returned
    /// reference is valid for the lifetime of the heap (until `reset()` or `drop()`).
    ///
    /// # Compile-Time Restriction
    ///
    /// This method only accepts types that do **not** implement [`Drop`]. This is
    /// enforced at compile time via a const assertion. Types requiring destructors
    /// must use [`heap::Box`](Box) or [`heap::Vec`](Vec) instead.
    ///
    /// # Why No Drop Types?
    ///
    /// Arena allocators free memory in bulk without running individual destructors.
    /// Allowing `Drop` types here would silently skip their cleanup logic, potentially
    /// causing resource leaks (file handles, network connections, etc.).
    #[inline]
    pub fn alloc<T>(&self, value: T) -> &mut T {
        // Compile-time assertion: T must not require drop
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
    /// # Interning Guarantee
    ///
    /// Two calls to `intern_symbol` with equal strings will return `Symbol`s that compare
    /// equal via pointer comparison (O(1)), not string comparison.
    ///
    /// # Panics
    ///
    /// Panics if the internal mutex is poisoned due to a panic in another thread.
    pub fn intern_symbol<'this>(&'this self, value: &str) -> Symbol<'this> {
        let mut strings = self.strings.lock().expect("lock should not be poisoned");

        if let Some(&string) = strings.get(value) {
            return Symbol::new_unchecked(string);
        }

        let string = &*value.transfer_into(self);

        // SAFETY: We extend the arena-allocated string to `'static` for storage in the HashSet.
        // This is sound because:
        //
        // 1. **Lifetime encapsulation**: The `'static` reference is immediately wrapped in
        //    `Symbol::new_unchecked(string)`, which returns `Symbol<'this>`. The `'static` never
        //    escapes — all external access is bounded by `'this` (the heap borrow).
        //
        // 2. **Reset ordering**: `Heap::reset()` clears `self.strings` *before* calling
        //    `self.inner.reset()`, ensuring no dangling `'static` references remain in the
        //    container when the arena memory is invalidated.
        //
        // 3. **Borrow checker protection**: `reset()` requires `&mut self`, which cannot coexist
        //    with the `&self` borrow used to create the `Symbol`. This prevents use-after-free at
        //    compile time.
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

// SAFETY: This implementation delegates all operations to the internal `Allocator`,
// which wraps `bumpalo::Bump`. The safety of each operation is guaranteed by bumpalo's
// well-audited implementation. No additional invariants are introduced by this wrapper.
//
// Thread safety: `Heap` is `Send` but not `Sync`, inherited from `bumpalo::Bump`.
#[expect(unsafe_code, reason = "proxy to internal allocator")]
unsafe impl alloc::Allocator for Heap {
    fn allocate(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        self.inner.allocate(layout)
    }

    fn allocate_zeroed(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        self.inner.allocate_zeroed(layout)
    }

    unsafe fn grow(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `old_layout`.
        unsafe { self.inner.grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `old_layout`.
        unsafe { self.inner.grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `old_layout`.
        unsafe { self.inner.shrink(ptr, old_layout, new_layout) }
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: Caller guarantees `ptr` was allocated by this allocator with `layout`.
        unsafe { self.inner.deallocate(ptr, layout) }
    }
}
