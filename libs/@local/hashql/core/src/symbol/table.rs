//! String interning table for HashQL symbols.
//!
//! Predefined constant symbols resolve lock-free through [`constant::lookup_hashed`], requiring no
//! runtime priming on [`Heap`](crate::heap::Heap) creation or reset.
//!
//! Runtime symbols live in a [`HashTable`] holding only runtime [`RuntimeRepr`] pointers. Each
//! lookup computes one hash with [`constant::hash_bytes`] to probe the compile-time 4-way SWAR
//! table. On a miss, [`constant::scramble_runtime_hash`] mixes that hash with a per-table random
//! seed before probing the runtime table. Keeping constants out of the runtime table removes
//! per-entry tag branching during probes and makes [`SymbolTable::reset`] clear only runtime
//! entries while keeping allocated bucket capacity.
//!
//! # Lifecycle and Epoch Coupling
//!
//! Runtime symbol pointers refer into a bump allocator. Call [`SymbolTable::reset`] before
//! resetting that bump allocator so later probes or rehashes never dereference freed memory.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator},
    fmt,
    hash::BuildHasher as _,
    ptr::NonNull,
};

use hashbrown::HashTable;

use super::{
    Symbol, constant,
    repr::{Repr, RuntimeRepr},
};
use crate::{collections::FastHasher, sync::lock::LocalLock};

#[inline]
fn random_runtime_seed() -> u64 {
    FastHasher::default().hash_one(0_u64)
}

#[repr(transparent)]
#[derive(Copy, Clone)]
struct RuntimePtr(NonNull<RuntimeRepr>);

// SAFETY: `RuntimeRepr` allocations are immutable once created and only accessed via shared reads,
// matching `Repr`'s `Send` and `Sync` contract.
#[expect(unsafe_code)]
unsafe impl Send for RuntimePtr {}

// SAFETY: See `Send` impl above.
#[expect(unsafe_code)]
unsafe impl Sync for RuntimePtr {}

/// A string interning table mapping runtime `&str` values to canonical [`RuntimeRepr`] pointers.
///
/// Predefined constant symbols resolve through [`constant::lookup_hashed`] and never occupy slots
/// in this table. Each table carries a randomized seed that scrambles the static hash before
/// probing the runtime table.
///
/// # Safety Contract
///
/// Runtime entries hold raw pointers into a bump allocator. The caller must uphold three
/// invariants:
///
/// 1. Call [`reset`](Self::reset) before resetting the bump allocator that backs runtime symbols.
/// 2. Pass the same bump allocator instance to every [`try_intern_in`](Self::try_intern_in) call on
///    this table.
/// 3. Keep that bump allocator live until [`reset`](Self::reset) runs or probes on this table end.
///
/// Dropping a `SymbolTable` after its bump allocator has been reset or dropped is safe because
/// `RuntimePtr` has no `Drop` implementation and dropping [`HashTable`] never reads stored
/// elements.
pub(crate) struct SymbolTable<A: Allocator = Global> {
    runtime_seed: u64,
    inner: LocalLock<HashTable<RuntimePtr, A>>,
}

impl<A: Allocator> SymbolTable<A> {
    /// Creates an empty symbol table using the given allocator.
    #[inline]
    fn new_in(alloc: A) -> Self {
        Self {
            runtime_seed: random_runtime_seed(),
            inner: LocalLock::new(HashTable::new_in(alloc)),
        }
    }
}

impl SymbolTable {
    /// Creates an empty symbol table using the global allocator.
    #[inline]
    pub(crate) fn new() -> Self {
        Self::new_in(Global)
    }
}

#[expect(unsafe_code)]
impl<A: Allocator> SymbolTable<A> {
    /// Clears all runtime entries while keeping allocated bucket capacity and refreshes the
    /// per-table runtime scramble seed.
    ///
    /// # Safety
    ///
    /// Call before resetting the bump allocator that backs any previously interned runtime symbols.
    #[inline]
    pub(crate) unsafe fn reset(&mut self) {
        self.inner.get_mut().clear();
        self.runtime_seed = random_runtime_seed();
    }

    /// Interns a non-constant runtime string using its scrambled `runtime_hash`.
    ///
    /// Returns the existing runtime [`Repr`] on a hit without touching `alloc` or growing the
    /// table. On a miss, allocates a [`RuntimeRepr`] from `alloc` before inserting it.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if `value.len()` exceeds [`u32::MAX`], the symbol layout overflows,
    /// or `alloc` cannot satisfy the [`RuntimeRepr`] allocation. A failed call leaves the table
    /// unchanged.
    ///
    /// # Safety
    ///
    /// The caller must guarantee:
    ///
    /// 1. `runtime_hash` equals
    ///    `constant::scramble_runtime_hash(constant::hash_bytes(value.as_bytes()), runtime_seed)`.
    /// 2. `value` is not a predefined constant symbol (call [`constant::lookup_hashed`] first).
    /// 3. Every pointer currently stored in `inner` refers to a live [`RuntimeRepr`] allocation.
    /// 4. Every call on `inner` uses the same allocator, which stays live until
    ///    [`reset`](Self::reset).
    #[inline]
    unsafe fn try_intern_runtime_in<B: Allocator>(
        inner: &mut HashTable<RuntimePtr, A>,
        runtime_seed: u64,
        runtime_hash: u64,
        value: &str,
        alloc: B,
    ) -> Result<Repr, AllocError> {
        if let Some(existing) = inner.find(runtime_hash, |existing| {
            // SAFETY: Caller guarantees every `RuntimePtr` in `inner` is live.
            let existing_bytes = unsafe { RuntimeRepr::as_bytes(existing.0.as_ptr()) };
            memchr::arch::all::is_equal(existing_bytes, value.as_bytes())
        }) {
            return Ok(Repr::runtime(existing.0));
        }

        let allocated = RuntimeRepr::try_alloc_in(value, alloc)?;
        inner.insert_unique(runtime_hash, RuntimePtr(allocated), |existing| {
            // SAFETY: Caller guarantees every `RuntimePtr` in `inner` is live.
            let existing_bytes = unsafe { RuntimeRepr::as_bytes(existing.0.as_ptr()) };
            constant::scramble_runtime_hash(constant::hash_bytes(existing_bytes), runtime_seed)
        });

        Ok(Repr::runtime(allocated))
    }

    /// Interns `name`, resolving predefined constants lock-free and allocating runtime symbols from
    /// `alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if `name.len()` exceeds [`u32::MAX`], the symbol layout overflows, or
    /// `alloc` cannot satisfy a new [`RuntimeRepr`] allocation. A failed call leaves the table
    /// unchanged.
    ///
    /// # Safety
    ///
    /// The caller must guarantee:
    ///
    /// 1. Every pointer currently stored in `self` refers to a live [`RuntimeRepr`] allocation.
    /// 2. Every call on `self` uses the same allocator, which stays live until
    ///    [`reset`](Self::reset).
    /// 3. Allocations made from `alloc` stay live and unchanged for all of `'alloc`.
    #[inline]
    pub(crate) unsafe fn try_intern_in<'alloc, B: Allocator>(
        &self,
        name: &str,
        alloc: B,
    ) -> Result<Symbol<'alloc>, AllocError> {
        let static_hash = constant::hash_bytes(name.as_bytes());
        if let Some(constant) = constant::lookup_hashed(static_hash, name) {
            // SAFETY: Constant symbols live for `'static`, which outlives `'alloc`.
            return Ok(unsafe { Symbol::from_repr(Repr::constant(constant)) });
        }

        let runtime_hash = constant::scramble_runtime_hash(static_hash, self.runtime_seed);
        let mut symbols = self.inner.lock();

        // SAFETY: `runtime_hash` is `scramble_runtime_hash(hash_bytes(name), self.runtime_seed)`,
        // `name` is not a predefined constant, and the caller upholds the pointer liveness and
        // allocator consistency invariants.
        let repr = unsafe {
            Self::try_intern_runtime_in(&mut symbols, self.runtime_seed, runtime_hash, name, alloc)
        }?;

        // SAFETY: `try_intern_runtime_in` returned `repr` from this table backed by `alloc`, and
        // the caller guarantees allocations from `alloc` stay valid for `'alloc`.
        Ok(unsafe { Symbol::from_repr(repr) })
    }
}

impl<A: Allocator> fmt::Debug for SymbolTable<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SymbolTable").finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    #![expect(unsafe_code, clippy::non_ascii_literal)]

    use core::iter;

    use super::{super::sym, Symbol, SymbolTable, constant};
    use crate::heap::Scratch;

    /// Interns `value`, as [`SymbolTable::try_intern_in`] does.
    ///
    /// # Safety
    ///
    /// Caller upholds the allocator and liveness invariants of [`SymbolTable::try_intern_in`].
    unsafe fn intern<'alloc>(
        table: &SymbolTable,
        alloc: &'alloc Scratch,
        value: &str,
    ) -> Symbol<'alloc> {
        // SAFETY: Caller upholds the invariants of `try_intern_in`.
        unsafe { table.try_intern_in(value, alloc) }.expect("should allocate the symbol")
    }

    #[test]
    fn new_table_is_empty() {
        let table = SymbolTable::new();
        assert!(table.inner.lock().is_empty());
        assert_eq!(table.inner.lock().len(), 0);
    }

    #[test]
    fn runtime_seed_randomized() {
        let static_hash = constant::hash_bytes(b"user_controlled_symbol");
        let hashes: Vec<u64> = iter::repeat_with(|| {
            let table = SymbolTable::new();
            constant::scramble_runtime_hash(static_hash, table.runtime_seed)
        })
        .take(8)
        .collect();

        assert!(
            hashes.iter().any(|&hash| hash != hashes[0]),
            "distinct SymbolTables should not share one fixed runtime scramble seed"
        );

        let mut table = SymbolTable::new();
        let before = constant::scramble_runtime_hash(static_hash, table.runtime_seed);
        let mut saw_different = false;
        for _ in 0..8 {
            // SAFETY: Table has no runtime entries.
            unsafe {
                table.reset();
            }
            if constant::scramble_runtime_hash(static_hash, table.runtime_seed) != before {
                saw_different = true;
                break;
            }
        }
        assert!(
            saw_different,
            "reset should refresh the per-table runtime scramble seed"
        );
    }

    #[test]
    fn intern_predefined_statically() {
        let table = SymbolTable::new();
        let scratch = Scratch::new();

        for &(name, expected_repr) in sym::LOOKUP {
            // SAFETY: Table is valid and scratch is live.
            let symbol = unsafe { intern(&table, &scratch, name) };
            assert_eq!(
                symbol.into_repr(),
                expected_repr,
                "predefined symbol '{name}' should return constant Repr"
            );
        }

        // Predefined symbols must never enter the runtime table.
        assert_eq!(table.inner.lock().len(), 0);
    }

    #[test]
    fn intern_idempotent() {
        let table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is valid and scratch is live.
        let first = unsafe { intern(&table, &scratch, "my_custom_symbol") };
        // SAFETY: Table is valid and scratch is live.
        let second = unsafe { intern(&table, &scratch, "my_custom_symbol") };

        assert_eq!(first, second);
        assert_eq!(table.inner.lock().len(), 1);
        assert_eq!(first.as_str(), "my_custom_symbol");
    }

    #[test]
    fn intern_distinct_strings() {
        let table = SymbolTable::new();
        let scratch = Scratch::new();

        // SAFETY: Table is valid and scratch is live.
        let foo = unsafe { intern(&table, &scratch, "foo_unique") };
        // SAFETY: Table is valid and scratch is live.
        let bar = unsafe { intern(&table, &scratch, "bar_unique") };

        assert_ne!(foo, bar);
        assert_eq!(table.inner.lock().len(), 2);
    }

    #[test]
    fn intern_edge_strings() {
        let table = SymbolTable::new();
        let scratch = Scratch::new();
        let long_string = "a".repeat(10_000);

        for sample in [
            "",
            "x",
            "ab",
            "abc",
            "abcd",
            "日本語 🎉 émojis",
            &long_string,
        ] {
            // SAFETY: Table is valid and scratch is live.
            let symbol = unsafe { intern(&table, &scratch, sample) };
            assert_eq!(symbol.as_str(), sample);
        }
    }

    #[test]
    fn reset_preserves_constants() {
        let mut table = SymbolTable::new();
        let scratch = Scratch::new();

        let (name, expected_repr) = sym::LOOKUP[0];
        // SAFETY: Table is valid and scratch is live.
        let repr_before = unsafe { intern(&table, &scratch, name) }.into_repr();
        assert_eq!(repr_before, expected_repr);

        // SAFETY: Table is valid and scratch is live.
        unsafe {
            intern(&table, &scratch, "runtime_1");
            intern(&table, &scratch, "runtime_2");
            intern(&table, &scratch, "runtime_3");
        }
        assert_eq!(table.inner.lock().len(), 3);

        // SAFETY: Scratch has not been reset.
        unsafe {
            table.reset();
        }
        assert_eq!(table.inner.lock().len(), 0);

        // SAFETY: Table is valid and scratch is live.
        let repr_after = unsafe { intern(&table, &scratch, name) }.into_repr();
        assert_eq!(repr_before, repr_after);
        assert_eq!(table.inner.lock().len(), 0);
    }

    #[test]
    fn growth_rehashes_runtime() {
        let table = SymbolTable::new();
        let scratch = Scratch::new();

        let mut symbols = Vec::with_capacity(200);
        // SAFETY: Table is valid and scratch is live.
        unsafe {
            for index in 0..200 {
                symbols.push(intern(&table, &scratch, &format!("symbol_{index}")));
            }
        }
        assert_eq!(table.inner.lock().len(), 200);

        // Re-interning after growth must return the exact same pointers.
        // SAFETY: Table is valid and scratch is live.
        unsafe {
            for (index, expected) in symbols.into_iter().enumerate() {
                let again = intern(&table, &scratch, &format!("symbol_{index}"));
                assert_eq!(again, expected);
            }
        }
        assert_eq!(table.inner.lock().len(), 200);
    }

    #[test]
    fn drop_after_allocator_drop() {
        let scratch = Scratch::new();
        let table = SymbolTable::new();

        // SAFETY: Table is valid and scratch is live.
        unsafe {
            intern(&table, &scratch, "runtime_symbol_1");
            intern(&table, &scratch, "runtime_symbol_2");
            intern(&table, &scratch, "another_runtime_symbol");
        }

        // Drop the allocator first so stored pointers dangle, then drop the table.
        drop(scratch);
        drop(table);
    }
}
