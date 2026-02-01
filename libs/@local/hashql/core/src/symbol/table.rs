//! String interning table for HashQL symbols.
//!
//! This module provides [`SymbolTable`], a hash-based interner that maps strings to their
//! canonical [`Repr`] representation. The table supports two kinds of symbols:
//!
//! - **Constant symbols**: Statically defined symbols from [`sym::LOOKUP`]. Their [`Repr`] encodes
//!   an index into the static [`sym::SYMBOLS`] array (effectively `'static` lifetime).
//!
//! - **Runtime symbols**: Dynamically interned strings allocated on a bump allocator. Their
//!   [`Repr`] holds a pointer to a [`RuntimeSymbol`] allocation.
//!
//! # Lifecycle and Epoch Coupling
//!
//! The `SymbolTable` is designed for epoch-based memory management where allocations are
//! made during a processing phase and then freed in bulk. The critical invariant is:
//!
//! **Runtime [`Repr`] values contain pointers to bump-allocated memory. When the bump
//! allocator resets, these pointers become dangling.**
//!
//! Therefore, the table must be reset **before** the bump allocator to prevent undefined
//! behavior from accessing dangling pointers during hash table operations.
//!
//! ## Correct Reset Ordering
//!
//! ```text
//! symbol_table.reset();   // Clear runtime Reprs, restore constants
//! heap.reset();           // Now safe: no dangling pointers in the table
//! ```
//!
//! # Priming
//!
//! Calling [`SymbolTable::prime`] populates the table with predefined symbols from
//! [`sym::LOOKUP`]. This ensures that interning a predefined string returns its
//! canonical constant [`Repr`] rather than allocating a runtime symbol.
//!
//! [`sym::LOOKUP`]: super::sym::LOOKUP
//! [`sym::SYMBOLS`]: super::sym::SYMBOLS

use alloc::alloc::Global;
use core::{alloc::Allocator, hash::BuildHasher as _};

use foldhash::fast::RandomState;
use hashbrown::{HashTable, hash_table::Entry};

use super::repr::{Repr, RuntimeRepr};
use crate::heap::BumpAllocator;

/// A string interning table mapping `&str` to canonical [`Repr`] values.
///
/// The table uses a [`HashTable`] with string-based hashing and equality. Two symbols
/// with identical string content will always map to the same [`Repr`].
///
/// # Safety Contract
///
/// This type contains unsafe methods because runtime [`Repr`] values hold raw pointers
/// to bump-allocated memory. The caller must ensure:
///
/// 1. **Epoch coupling**: [`reset`](Self::reset) must be called before resetting the bump allocator
///    that backs runtime symbols. Failure to do so causes undefined behavior when the table
///    attempts to hash or compare entries with dangling pointers.
///
/// 2. **Allocator consistency**: The same bump allocator instance must be used for all
///    [`intern`](Self::intern) calls on this table.
///
/// 3. **Allocator lifetime**: The bump allocator passed to [`intern`](Self::intern) must remain
///    live for as long as the table is in use (i.e., until [`reset`](Self::reset) is called).
///
/// 4. **Priming precondition**: [`prime`](Self::prime) must only be called on an empty table
///    (typically after [`clear`](Self::clear)).
///
/// # Drop Safety
///
/// Dropping the `SymbolTable` after the bump allocator has been reset is **safe**.
/// [`Repr`] has no [`Drop`] implementation, so dropping the table does not dereference
/// any runtime symbol pointers. Only *using* the table (e.g., calling [`intern`](Self::intern))
/// after the allocator reset causes undefined behavior.
///
/// Note: This assumes the [`HashTable`]'s own allocator `A` (used for bucket storage) is
/// still valid. With the default `A = Global`, this is always the case.
#[derive(Debug)]
pub(crate) struct SymbolTable<A: Allocator = Global> {
    inner: HashTable<Repr, A>,
    hasher: RandomState,
}

impl SymbolTable {
    /// Creates a new, empty symbol table using the global allocator.
    ///
    /// The table is not primed. Call [`prime`](Self::prime) to populate it with
    /// predefined symbols before use.
    #[inline]
    pub(crate) fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<A: Allocator> SymbolTable<A> {
    /// Creates a new, empty symbol table using the given allocator.
    ///
    /// The table is not primed. Call [`prime`](Self::prime) to populate it with
    /// predefined symbols before use.
    #[inline]
    fn new_in(alloc: A) -> Self {
        Self {
            inner: HashTable::new_in(alloc),
            hasher: RandomState::default(),
        }
    }

    /// Returns the number of symbols currently in the table.
    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the table contains no symbols.
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

#[expect(unsafe_code)]
impl<A: Allocator> SymbolTable<A> {
    /// Removes all entries from the table.
    ///
    /// After calling this method, the table is empty and must be primed before use.
    ///
    /// # Safety
    ///
    /// The caller must call [`prime`](Self::prime) before any subsequent [`intern`](Self::intern)
    /// calls. Without priming, interning a predefined symbol (e.g., `"and"`) would allocate
    /// a new runtime symbol instead of returning the canonical constant [`Repr`] that matches
    /// the static symbols in [`sym`](super::sym). This would break the invariant that
    /// predefined symbols intern to their canonical constant representations.
    #[inline]
    pub(crate) unsafe fn clear(&mut self) {
        self.inner.clear();
    }

    /// Populates the table with predefined symbols from [`sym::LOOKUP`].
    ///
    /// After priming, interning any predefined symbol string will return its canonical
    /// constant [`Repr`] rather than allocating a new runtime symbol.
    ///
    /// # Preconditions
    ///
    /// The table must be empty. This is typically ensured by calling [`clear`](Self::clear)
    /// beforehand, or by using a freshly constructed table.
    ///
    /// # Safety
    ///
    /// The caller must ensure that the table is empty before calling this method.
    ///
    /// [`sym::LOOKUP`]: super::sym::LOOKUP
    pub(crate) unsafe fn prime(&mut self) {
        self.inner.reserve(super::sym::LOOKUP.len(), |_| {
            unreachable!("prime() requires an empty table; hasher callback should not be invoked")
        });

        for &(name, value) in super::sym::LOOKUP {
            let hash = self.hasher.hash_one(name);

            self.inner.insert_unique(hash, value, |_| {
                unreachable!("capacity was pre-reserved; hasher callback should not be invoked")
            });
        }
    }

    /// Resets the table to its initial primed state.
    ///
    /// This is equivalent to calling [`clear`](Self::clear) followed by [`prime`](Self::prime).
    /// After resetting, the table contains only the predefined constant symbols.
    ///
    /// # Safety
    ///
    /// **This method must be called before resetting the bump allocator** that backs any
    /// runtime symbols previously interned into this table. The reset ordering is:
    ///
    /// ```text
    /// symbol_table.reset();   // ← First: clear dangling runtime Reprs
    /// heap.reset();           // ← Second: now safe to invalidate allocations
    /// ```
    ///
    /// Violating this ordering causes undefined behavior: the bump allocator reset
    /// invalidates runtime symbol pointers, and subsequent table operations (including
    /// this method's `clear()` + `prime()` sequence, or future `intern()` calls) may
    /// attempt to dereference those dangling pointers.
    ///
    /// # Invariants Restored
    ///
    /// After this method returns:
    /// - All runtime symbols are removed from the table.
    /// - All constant symbols from [`sym::LOOKUP`] are present.
    /// - The table is ready for a new epoch of interning.
    ///
    /// [`sym::LOOKUP`]: super::sym::LOOKUP
    #[inline]
    pub(crate) unsafe fn reset(&mut self) {
        // SAFETY: correct order of operations is present.
        unsafe {
            self.clear();
            self.prime();
        }
    }

    /// Interns a string, returning its canonical [`Repr`].
    ///
    /// If the string has already been interned (either as a predefined constant or a
    /// previously interned runtime symbol), returns the existing [`Repr`]. Otherwise,
    /// allocates a new [`RuntimeSymbol`] on the provided bump allocator and inserts it.
    ///
    /// # Returns
    ///
    /// The canonical [`Repr`] for `value`. Interning the same string multiple times
    /// is idempotent—subsequent calls return the same [`Repr`].
    ///
    /// # Safety
    ///
    /// The caller must ensure:
    ///
    /// 1. **No dangling pointers**: The table must not contain dangling runtime [`Repr`] values.
    ///    This means [`reset`](Self::reset) must have been called before any preceding bump
    ///    allocator reset.
    ///
    /// 2. **Allocator consistency**: The same allocator instance must be used for all `intern()`
    ///    calls on this table. Using different allocators would result in runtime symbols from
    ///    multiple allocators, and resetting one would leave dangling pointers from the other.
    ///
    /// 3. **Allocator lifetime**: The allocator must remain live for the lifetime of this symbol
    ///    table, or until [`reset`](Self::reset) is called. All runtime [`Repr`] values in the
    ///    table point into the allocator's memory and are dereferenced during table operations.
    ///
    /// # Implementation Notes
    ///
    /// The table hashes and compares entries by their string content, not by [`Repr`]
    /// identity. This means:
    /// - Equality: `repr.as_str() == value`
    /// - Hashing: `hash(repr.as_str())`
    ///
    /// Both operations dereference runtime [`Repr`] pointers, which is why the caller
    /// must ensure no dangling pointers exist in the table.
    pub(crate) unsafe fn intern<B: BumpAllocator>(&mut self, alloc: &B, value: &str) -> Repr {
        let hash = self.hasher.hash_one(value);

        // We hash against the string, therefore we must pull out the string representation,
        // instead of hashing against the Repr directly, as that would lead to incorrect results.
        // We're mapping string -> repr. But the string representation is already stored in the
        // Repr.
        match self.inner.entry(
            hash,
            // SAFETY: Caller guarantees no dangling runtime pointers in the table.
            |repr| unsafe { repr.as_str() } == value,
            // SAFETY: Same as above; this is called during rehashing.
            |repr| self.hasher.hash_one(unsafe { repr.as_str() }),
        ) {
            Entry::Occupied(entry) => *entry.get(),
            Entry::Vacant(entry) => {
                let repr = Repr::runtime(RuntimeRepr::alloc(alloc, value));
                *entry.insert(repr).get()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(unsafe_code, clippy::non_ascii_literal)]

    use super::{super::sym, SymbolTable};
    use crate::heap::Scratch;

    #[test]
    fn new_table_is_empty() {
        let table = SymbolTable::new();
        assert!(table.is_empty());
        assert_eq!(table.len(), 0);
    }

    #[test]
    fn prime_populates_table_with_lookup_entries() {
        let mut table = SymbolTable::new();
        // SAFETY: Table is empty, no dangling pointers.
        unsafe {
            table.prime();
        }

        assert_eq!(table.len(), sym::LOOKUP.len());
        assert!(!table.is_empty());
    }

    #[test]
    fn clear_removes_all_entries() {
        let mut table = SymbolTable::new();
        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }
        assert!(!table.is_empty());

        // SAFETY: We will not call intern() after this without priming first.
        unsafe {
            table.clear();
        }
        assert!(table.is_empty());
        assert_eq!(table.len(), 0);
    }

    #[test]
    fn reset_restores_primed_state() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }
        let initial_len = table.len();

        // SAFETY: Table is primed, scratch is live.
        unsafe {
            table.intern(&scratch, "user_defined_symbol");
        };
        assert_eq!(table.len(), initial_len + 1);

        // SAFETY: Scratch has not been reset, so runtime pointers are valid.
        unsafe {
            table.reset();
        };
        assert_eq!(table.len(), initial_len);
    }

    #[test]
    fn intern_predefined_symbol_returns_constant_repr() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }

        // Intern a predefined symbol (e.g., "and" from LOOKUP).
        // The returned Repr should match the one in LOOKUP.
        for &(name, expected_repr) in sym::LOOKUP {
            // SAFETY: Table is primed, scratch is live.
            let repr = unsafe { table.intern(&scratch, name) };
            assert_eq!(
                repr, expected_repr,
                "predefined symbol '{name}' should return constant Repr"
            );
        }
    }

    #[test]
    fn intern_is_idempotent() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        };

        // SAFETY: Table is primed, scratch is live.
        let repr1 = unsafe { table.intern(&scratch, "my_custom_symbol") };
        // SAFETY: Table is primed, scratch is live.
        let repr2 = unsafe { table.intern(&scratch, "my_custom_symbol") };

        assert_eq!(repr1, repr2);
        // SAFETY: scratch is live.
        assert_eq!(unsafe { repr1.as_str() }, "my_custom_symbol");
    }

    #[test]
    fn intern_different_strings_returns_different_reprs() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }

        // SAFETY: Table is primed, scratch is live.
        let repr_foo = unsafe { table.intern(&scratch, "foo_unique") };
        // SAFETY: Table is primed, scratch is live.
        let repr_bar = unsafe { table.intern(&scratch, "bar_unique") };

        assert_ne!(repr_foo, repr_bar);
    }

    #[test]
    fn intern_empty_string() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }

        // SAFETY: Table is primed, scratch is live.
        let repr = unsafe { table.intern(&scratch, "") };

        // SAFETY: scratch is live.
        assert_eq!(unsafe { repr.as_str() }, "");
    }

    #[test]
    fn intern_unicode_string() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }

        // SAFETY: Table is primed, scratch is live.
        let repr = unsafe { table.intern(&scratch, "日本語 🎉 émojis") };

        // SAFETY: scratch is live.
        assert_eq!(unsafe { repr.as_str() }, "日本語 🎉 émojis");
    }

    #[test]
    fn intern_long_string() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        }

        let long_string = "a".repeat(10_000);

        // SAFETY: Table is primed, scratch is live.
        let repr = unsafe { table.intern(&scratch, &long_string) };

        // SAFETY: scratch is live.
        assert_eq!(unsafe { repr.as_str() }, long_string);
    }

    #[test]
    fn constants_survive_reset() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        };

        // Get a constant Repr by interning a predefined symbol.
        let (name, expected_repr) = sym::LOOKUP[0];
        // SAFETY: Table is primed, scratch is live.
        let repr_before = unsafe { table.intern(&scratch, name) };
        assert_eq!(repr_before, expected_repr);

        // SAFETY: Scratch has not been reset.
        unsafe {
            table.reset();
        };

        // SAFETY: Table is primed, scratch is live.
        let repr_after = unsafe { table.intern(&scratch, name) };

        // Constants should be identical across resets.
        assert_eq!(repr_before, repr_after);
    }

    #[test]
    fn runtime_symbols_cleared_on_reset() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        };
        let primed_len = table.len();

        // Intern some runtime symbols.
        // SAFETY: Table is primed, scratch is live.
        unsafe {
            table.intern(&scratch, "runtime_1");
            table.intern(&scratch, "runtime_2");
            table.intern(&scratch, "runtime_3");
        }
        assert_eq!(table.len(), primed_len + 3);

        // SAFETY: Scratch has not been reset.
        unsafe {
            table.reset();
        };

        // Runtime symbols should be gone, only constants remain.
        assert_eq!(table.len(), primed_len);
    }

    #[test]
    fn multiple_intern_operations_grow_table() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        };
        let initial_len = table.len();

        // SAFETY: Table is primed, scratch is live.
        unsafe {
            for i in 0..100 {
                table.intern(&scratch, &format!("symbol_{i}"));
            }
        }

        assert_eq!(table.len(), initial_len + 100);
    }

    /// Test that dropping a `SymbolTable` after the backing allocator has been reset
    /// does not cause undefined behavior.
    ///
    /// This test is designed to be run under Miri to verify drop safety.
    /// The key invariant: `Repr` has no `Drop` impl, so dropping the table
    /// does not dereference any (now-dangling) runtime symbol pointers.
    #[test]
    fn drop_after_allocator_reset_is_safe() {
        let scratch = Scratch::new();
        let mut table = SymbolTable::new();

        // SAFETY: Table is empty.
        unsafe {
            table.prime();
        };

        // Intern several runtime symbols to ensure we have dangling pointers after reset.
        // SAFETY: Table is primed, scratch is live.
        unsafe {
            table.intern(&scratch, "runtime_symbol_1");
            table.intern(&scratch, "runtime_symbol_2");
            table.intern(&scratch, "another_runtime_symbol");
        }

        // Drop the allocator FIRST - this invalidates all runtime symbol pointers.
        // The table now contains dangling pointers, but we will NOT use it.
        drop(scratch);

        // Drop the table. This should NOT cause UB because:
        // - Repr has no Drop impl (it's Copy)
        // - HashTable::drop doesn't hash/compare elements, just drops them in-place
        // - Dropping a Repr is a no-op that doesn't dereference the pointer
        drop(table);
    }
}
