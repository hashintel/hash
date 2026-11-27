//! String interning table for HashQL symbols.
//!
//! Predefined constant symbols resolve through the compile-time 4-way SWAR static lookup table in
//! [`sym`], requiring no runtime priming on [`Heap`](crate::heap::Heap) creation or reset and no
//! lock acquisition on constant hits.
//!
//! Runtime symbols live in a [`HashTable`] holding only runtime [`RuntimeRepr`] pointers. Keeping
//! constants out of the runtime table removes per-entry tag branching during probes and makes
//! [`SymbolTable::reset`] clear only runtime entries while keeping allocated bucket capacity.
//!
//! # Lifecycle and Epoch Coupling
//!
//! Runtime symbol pointers refer into a bump allocator. Call [`SymbolTable::reset`] before
//! resetting that bump allocator so later probes or rehashes never dereference freed memory.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator},
    fmt,
    hash::{BuildHasher as _, Hasher as _},
    num::NonZero,
    ptr::NonNull,
};

use foldhash::fast::FixedState;
use hashbrown::HashTable;

use super::{
    Symbol,
    repr::{ConstantRepr, Repr, RuntimeRepr},
    sym,
};
use crate::sync::lock::LocalLock;

/// Hashes `bytes` with `seed` via [`foldhash::fast::FixedState`].
///
/// Calls [`core::hash::Hasher::write`] directly instead of `Hash::hash` because `foldhash` already
/// mixes slice length via seed rotation, avoiding the extra length-prefix multiply. Matches
/// `hashql_macros::sym::hash_symbol_bytes` so one hash probes both the compile-time static table
/// and the runtime [`HashTable`].
#[inline]
fn hash_symbol_bytes(bytes: &[u8], seed: u64) -> u64 {
    let mut hasher = FixedState::with_seed(seed).build_hasher();
    hasher.write(bytes);
    hasher.finish()
}

/// Finds the lowest 16-bit lane in `tags` equal to `tag`.
#[inline]
const fn match_swar_lane(tags: u64, tag: NonZero<u16>) -> Option<usize> {
    let needle = NonZero::<u64>::from(tag)
        .get()
        .wrapping_mul(0x0001_0001_0001_0001);
    let diff = tags ^ needle;

    // Subtracting 1 from each 16-bit lane sets bit 15 of a lane iff that lane is zero (yielding
    // 0xFFFF, whose bit 15 survives `& !diff`). A zero lane borrows into the next lane, which can
    // also set bit 15 there, while non-zero lanes below it produce no borrow. Therefore the lowest
    // set bit in `matches` always names the lowest zero lane. Because `define_symbols!` guarantees
    // all tags in a bucket are distinct and non-zero, at most one lane matches.
    let matches = diff.wrapping_sub(0x0001_0001_0001_0001) & !diff & 0x8000_8000_8000_8000;
    if matches == 0 {
        return None;
    }

    Some(((matches.trailing_zeros() >> 4) & 3) as usize)
}

/// Probes the compile-time 4-way SWAR static symbol table for `value` using precomputed `hash`.
///
/// Non-constant runtime symbols exit after one `u64` tag load and four scalar ALU operations
/// without touching `SYMBOLS` or acquiring a lock.
#[inline]
fn lookup_constant_hashed(hash: u64, value: &str) -> Option<Repr> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "bucket index intentionally truncates hash bits"
    )]
    let bucket = (hash as usize) & sym::STATIC_BUCKET_MASK;
    let &tags = sym::STATIC_TAGS.get(bucket)?;
    let tag = NonZero::new(((hash >> 48) as u16) | 1).unwrap_or_else(|| unreachable!());

    let lane = match_swar_lane(tags, tag)?;

    let symbol_index = usize::from(*sym::STATIC_INDICES.get(bucket)?.get(lane)?);
    let &candidate = sym::SYMBOLS.get(symbol_index)?;

    memchr::arch::all::is_equal(candidate.as_bytes(), value.as_bytes())
        .then_some(Repr::constant(ConstantRepr::new_unchecked(symbol_index)))
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
/// Predefined constant symbols resolve through [`lookup_constant_hashed`] and never occupy slots in
/// this table.
///
/// # Safety Contract
///
/// Runtime entries hold raw pointers into a bump allocator. The caller must uphold three
/// invariants:
///
/// 1. Call [`reset`](Self::reset) before resetting the bump allocator that backs runtime symbols.
/// 2. Pass the same bump allocator instance to every [`try_intern_in`](Self::try_intern_in) call on
///    this table.
/// 3. Keep that bump allocator live until [`reset`](Self::reset) runs or the table stops being
///    probed.
///
/// Dropping a `SymbolTable` after its bump allocator has been reset or dropped is safe because
/// `RuntimePtr` has no `Drop` implementation and dropping [`HashTable`] never reads stored
/// elements.
pub(crate) struct SymbolTable<A: Allocator = Global> {
    inner: LocalLock<HashTable<RuntimePtr, A>>,
}

impl SymbolTable {
    /// Creates an empty symbol table using the global allocator.
    #[inline]
    pub(crate) const fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<A: Allocator> SymbolTable<A> {
    /// Creates an empty symbol table using the given allocator.
    #[inline]
    const fn new_in(alloc: A) -> Self {
        Self {
            inner: LocalLock::new(HashTable::new_in(alloc)),
        }
    }
}

#[expect(unsafe_code)]
impl<A: Allocator> SymbolTable<A> {
    /// Clears all runtime entries while keeping allocated bucket capacity.
    ///
    /// # Safety
    ///
    /// Must be called before resetting the bump allocator that backs any previously interned
    /// runtime symbols.
    #[inline]
    pub(crate) unsafe fn reset(&mut self) {
        self.inner.get_mut().clear();
    }

    /// Interns `name`, resolving predefined constants lock-free and allocating runtime symbols from
    /// `alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if `alloc` cannot satisfy a new [`RuntimeRepr`] allocation. A failed
    /// call leaves the table unchanged.
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
        let hash = hash_symbol_bytes(name.as_bytes(), sym::STATIC_SEED);
        if let Some(constant) = lookup_constant_hashed(hash, name) {
            // SAFETY: Constant symbols live for `'static`, which outlives `'alloc`.
            return Ok(unsafe { Symbol::from_repr(constant) });
        }

        let mut symbols = self.inner.lock();

        // SAFETY: `hash` matches `name`, `name` is not a predefined constant, and the caller
        // upholds the pointer liveness and allocator consistency invariants.
        let repr = unsafe { Self::try_intern_runtime_in(&mut symbols, hash, name, alloc) }?;

        // SAFETY: `try_intern_runtime_in` returned `repr` from this table backed by `alloc`, and
        // the caller guarantees allocations from `alloc` stay valid for `'alloc`.
        Ok(unsafe { Symbol::from_repr(repr) })
    }

    /// Interns a non-constant runtime string using its precomputed `hash`.
    ///
    /// Returns the existing runtime [`Repr`] on a hit without touching `alloc` or growing the
    /// table. On a miss, allocates a [`RuntimeRepr`] from `alloc` before inserting it.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if `alloc` cannot satisfy the [`RuntimeRepr`] allocation. A failed
    /// call leaves the table unchanged.
    ///
    /// # Safety
    ///
    /// The caller must guarantee:
    ///
    /// 1. `hash` equals `hash_symbol_bytes(value.as_bytes(), sym::STATIC_SEED)`.
    /// 2. `value` is not a predefined constant symbol (call [`lookup_constant_hashed`] first).
    /// 3. Every pointer currently stored in `inner` refers to a live [`RuntimeRepr`] allocation.
    /// 4. Every call on `inner` uses the same allocator, which stays live until
    ///    [`reset`](Self::reset).
    #[inline]
    unsafe fn try_intern_runtime_in<B: Allocator>(
        inner: &mut HashTable<RuntimePtr, A>,
        hash: u64,
        value: &str,
        alloc: B,
    ) -> Result<Repr, AllocError> {
        if let Some(existing) = inner.find(hash, |existing| {
            // SAFETY: Caller guarantees every `RuntimePtr` in `self.inner` is live.
            let existing_bytes = unsafe { RuntimeRepr::as_bytes(existing.0.as_ptr()) };
            memchr::arch::all::is_equal(existing_bytes, value.as_bytes())
        }) {
            return Ok(Repr::runtime(existing.0));
        }

        let allocated = RuntimeRepr::try_alloc_in(value, alloc)?;
        inner.insert_unique(hash, RuntimePtr(allocated), |existing| {
            // SAFETY: Caller guarantees every `RuntimePtr` in `self.inner` is live.
            let existing_bytes = unsafe { RuntimeRepr::as_bytes(existing.0.as_ptr()) };
            hash_symbol_bytes(existing_bytes, sym::STATIC_SEED)
        });

        Ok(Repr::runtime(allocated))
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

    use core::num::NonZero;

    use super::{super::sym, Symbol, SymbolTable, match_swar_lane};
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
    fn swar_lane_matching_borrow_cases() {
        let raw_tag: u16 = 0x1235;
        let tag = NonZero::new(raw_tag).expect("non-zero tag");
        // Lane 0 matches while lane 1 equals `raw_tag ^ 1`. Borrow from lane 0 sets lane 1's diff
        // to 0xFFFF as well, and the lowest matching lane must still be lane 0.
        let borrow_trap = u64::from(raw_tag) | (u64::from(raw_tag ^ 1) << 16);
        assert_eq!(match_swar_lane(borrow_trap, tag), Some(0));

        // Non-zero lanes below a match must not trigger false matches.
        let lane1_match = u64::from(raw_tag ^ 1) | (u64::from(raw_tag) << 16);
        assert_eq!(match_swar_lane(lane1_match, tag), Some(1));

        let lane3_match = u64::from(raw_tag ^ 0x8000)
            | (u64::from(raw_tag ^ 0xFFFF) << 16)
            | (u64::from(raw_tag ^ 0x0001) << 32)
            | (u64::from(raw_tag) << 48);
        assert_eq!(match_swar_lane(lane3_match, tag), Some(3));

        // Empty lanes (`0x0000`) never match non-zero tags.
        assert_eq!(match_swar_lane(0, tag), None);
        assert_eq!(match_swar_lane(u64::from(raw_tag ^ 1), tag), None);
    }

    #[test]
    fn intern_predefined_symbols_resolve_statically() {
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
    fn intern_is_idempotent() {
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
    fn intern_empty_unicode_and_long_strings() {
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
    fn reset_clears_runtime_symbols_and_preserves_constants() {
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
    fn growth_rehashes_runtime_entries() {
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
    fn drop_after_allocator_drop_is_safe() {
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
