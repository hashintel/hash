use core::alloc::AllocError;

use super::{
    ResetAllocator, SymbolAllocator,
    bump::{Bump, BumpScope, BumpScopeMut},
    macros::{delegate_allocator, delegate_phase_allocator, delegate_scope_allocator},
};
use crate::{
    symbol::{Symbol, SymbolTable},
    sync::lock::LocalLock,
};

/// An arena that interns [`Symbol`]s.
///
/// `&Heap` is a [`PhaseAllocator`] and a [`SymbolAllocator`]. A `Heap` has one table of interned
/// strings, which starts with the predefined symbols of the [`sym`] module. Interning the string of
/// a predefined symbol returns that symbol. [`reset`] releases the allocations and returns the
/// table to that starting state.
///
/// To open scopes, borrow the arena through [`as_mut_scope`] or [`as_scope`].
///
/// [`PhaseAllocator`]: super::PhaseAllocator
/// [`sym`]: crate::symbol::sym
/// [`reset`]: ResetAllocator::reset
/// [`as_mut_scope`]: Self::as_mut_scope
/// [`as_scope`]: Self::as_scope
#[derive(Debug)]
pub struct Heap {
    // `symbols` points into the memory of `bump`. No method returns a `&mut` reference to either
    // field: `mem::swap` on the `bump` of two heaps exchanges their memory, and each table then
    // points into memory that the other heap releases. `as_mut_scope` returns a `HeapScope`, which
    // holds the exclusive borrow of `bump` in a private field beside a reference to `symbols`.
    bump: Bump,
    symbols: LocalLock<SymbolTable>,
}

impl Heap {
    fn from_bump(bump: Bump) -> Self {
        let mut symbols = SymbolTable::new();
        // SAFETY: A new table is empty.
        unsafe {
            symbols.prime();
        }

        Self {
            bump,
            symbols: LocalLock::new(symbols),
        }
    }

    /// Creates an empty arena.
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self::from_bump(Bump::new())
    }

    /// Creates an empty arena that requests about `capacity` bytes of memory up front.
    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self::from_bump(Bump::with_capacity(capacity))
    }

    /// Borrows the arena for code that shares it.
    ///
    /// The returned arena opens scopes through [`scoped_ref`] alone. Until such a scope ends,
    /// interning a string that the table does not hold fails, as every allocation through the
    /// `Heap` does. Intern the symbols that the scope needs before you open it.
    ///
    /// [`scoped_ref`]: super::ScopeAllocator::scoped_ref
    #[inline]
    #[must_use]
    pub fn as_scope(&self) -> &BumpScope<'_> {
        self.bump.as_scope()
    }

    /// Borrows the arena with exclusive access.
    ///
    /// The returned [`HeapScope`] opens scopes through [`scoped`], which has none of the
    /// restrictions of [`scoped_ref`], and `&HeapScope` interns as `&Heap` does.
    ///
    /// [`scoped`]: super::ScopeAllocator::scoped
    /// [`scoped_ref`]: super::ScopeAllocator::scoped_ref
    #[inline]
    #[must_use]
    pub fn as_mut_scope(&mut self) -> HeapScope<'_> {
        HeapScope {
            bump: self.bump.as_mut_scope(),
            symbols: &self.symbols,
        }
    }
}

impl Default for Heap {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

delegate_allocator!(Heap, bump);
delegate_phase_allocator!('alloc, &'alloc Heap, bump);

// SAFETY: The string of a predefined symbol is static. The string of every other symbol is in
// memory that `try_intern` allocated from `self.bump`, and `self.bump` releases memory in `reset`,
// at the end of a scope and in `Drop`.
//
// The `'alloc` borrow of the `Heap` keeps it from being reset or dropped during `'alloc`. The end
// of a scope releases only memory that the scope allocated. `&Heap` opens scopes through `as_scope`
// alone, and until such a scope ends, every allocation from `self.bump` fails. `try_intern` returns
// that failure before it adds an entry to the table. The table and the memory it points into stay
// in one `Heap`: no method returns a `&mut` reference to either of them, and the comment on
// `BumpScope` shows that safe code cannot exchange the arena of a scope for another arena. No code
// writes to the string of a symbol after `try_intern` returns.
//
// Therefore the string of every returned symbol stays valid and unchanged for all of `'alloc`.
unsafe impl<'alloc> SymbolAllocator<'alloc> for &'alloc Heap {
    #[inline]
    fn try_alloc_symbol(self, name: &str) -> Result<Symbol<'alloc>, AllocError> {
        let mut symbols = self.symbols.lock();

        // SAFETY: The table holds no dangling symbol: `reset` clears it before it releases the
        // memory of `self.bump`, and the comments on this implementation and on the implementation
        // for `&HeapScope` show that no symbol is in the memory of a scope. Every call passes the
        // arena of the `Heap` that owns the table, which lives as long as that `Heap`.
        let repr = unsafe { symbols.try_intern(&self.bump, name) }?;

        // SAFETY: `try_intern` returned `repr` from the one table of this `Heap`, and the comment
        // on this implementation shows that its string is valid for `'alloc`.
        Ok(unsafe { Symbol::from_repr(repr) })
    }
}

// SAFETY: Every allocator of the arena borrows the `Heap`: `&Heap` is that borrow, and `as_scope`
// and `as_mut_scope` return a `BumpScope` and a `HeapScope` whose lifetime is the lifetime of the
// borrow. The allocations and the symbols of those allocators live no longer than that lifetime,
// and `Heap` itself implements no `ScopeAllocator`. The symbol table keeps pointers into the arena
// beyond such a borrow, and `reset` clears the table before it releases the memory. `reset` takes
// `&mut self`. Therefore no memory of the arena is reachable when it runs.
unsafe impl ResetAllocator for Heap {
    #[inline]
    fn reset(&mut self) {
        // SAFETY: `self.bump` releases its memory after this call, as `SymbolTable::reset`
        // requires.
        unsafe {
            self.symbols.get_mut().reset();
        }

        self.bump.reset();
    }
}

/// The arena of a [`Heap`], borrowed with exclusive access.
///
/// A `HeapScope` is a [`ScopeAllocator`], and `&HeapScope` is a [`SymbolAllocator`] that interns
/// into the table of the `Heap`. A scope opened on it is a plain arena that does not intern, and
/// during [`scoped`] the compiler rejects every use of the `HeapScope` itself. Intern the symbols
/// that a scope needs before you open it.
///
/// [`ScopeAllocator`]: super::ScopeAllocator
/// [`scoped`]: super::ScopeAllocator::scoped
pub struct HeapScope<'alloc> {
    // Both fields borrow one `Heap`, and no method returns a `&mut` reference to `bump`.
    // `mem::swap` on two `HeapScope`s therefore exchanges each arena together with its table.
    bump: BumpScopeMut<'alloc>,
    symbols: &'alloc LocalLock<SymbolTable>,
}

delegate_allocator!(HeapScope<'_>, bump);
delegate_scope_allocator!('alloc, HeapScope<'alloc>, bump, BumpScopeMut<'alloc>);

// SAFETY: The string of a predefined symbol is static. The string of every other symbol is in
// memory that `try_intern` allocated from `self.bump`, the arena of the `Heap` that owns
// `self.symbols`. That arena releases memory in `ResetAllocator::reset`, at the end of a scope and
// in `Drop`.
//
// `Heap::as_mut_scope` borrowed the `Heap` exclusively for `'alloc`, which keeps it from being
// reset or dropped during `'alloc`. The end of a scope releases only memory that the scope
// allocated. `scoped` borrows the `HeapScope` exclusively, and no `&HeapScope` interns until it
// returns. During `scoped_ref` every allocation from `self.bump` fails, and `try_intern` returns
// that failure before it adds an entry to the table. `self.bump` and `self.symbols` stay together:
// both fields are private and move only as one `HeapScope`, and the comment on `BumpScope` shows
// that safe code cannot exchange the arena of a scope for another arena. No code writes to the
// string of a symbol after `try_intern` returns.
//
// Therefore the string of every returned symbol stays valid and unchanged for all of `'alloc`.
unsafe impl<'alloc> SymbolAllocator<'alloc> for &HeapScope<'alloc> {
    #[inline]
    fn try_alloc_symbol(self, name: &str) -> Result<Symbol<'alloc>, AllocError> {
        let mut symbols = self.symbols.lock();

        // SAFETY: The table holds no dangling symbol, as the comment in the implementation for
        // `&Heap` shows. `self.bump` is the arena of the `Heap` that owns the table.
        let repr = unsafe { symbols.try_intern(&self.bump, name) }?;

        // SAFETY: `try_intern` returned `repr` from the one table of the `Heap`, and the comment
        // on this implementation shows that its string is valid for `'alloc`.
        Ok(unsafe { Symbol::from_repr(repr) })
    }
}

#[cfg(test)]
mod tests {
    use core::{alloc::AllocError, assert_matches, mem, ptr};

    use super::Heap;
    use crate::{
        heap2::{PhaseAllocator, ResetAllocator as _, ScopeAllocator, SymbolAllocator},
        symbol::{Symbol, sym},
    };

    // The names in these tests contain a space, which no predefined symbol does.

    // Stores the symbol of `name` in the arena, as a node that stores its name does.
    fn named_in<'alloc, A>(alloc: A, name: &str) -> &'alloc Symbol<'alloc>
    where
        A: PhaseAllocator<'alloc> + SymbolAllocator<'alloc>,
    {
        alloc.alloc(alloc.alloc_symbol(name))
    }

    // Interns one name, then runs a scope that reads it, as a pass over one item does.
    fn len_scoped<'alloc, S>(alloc: &mut S, name: &str) -> usize
    where
        S: ScopeAllocator<'alloc>,
        for<'scope> &'scope S: SymbolAllocator<'alloc>,
    {
        let symbol = (&*alloc).alloc_symbol(name);

        alloc.scoped(|scope| scope.alloc(symbol).as_str().len())
    }

    #[test]
    fn alloc_symbol_on_owned_heap() {
        let heap = Heap::new();

        let first = heap.alloc_symbol("first name");
        let again = heap.alloc_symbol("first name");
        let other = heap.alloc_symbol("other name");

        assert_eq!(first, again);
        assert!(ptr::eq(first.as_str(), again.as_str()));
        assert_ne!(first, other);
        assert_eq!(*heap.alloc(other), other);
    }

    #[test]
    fn alloc_symbol_predefined() {
        let heap = Heap::new();

        assert_eq!(heap.alloc_symbol("Integer"), sym::Integer);
    }

    #[test]
    fn alloc_symbol_through_pointer() {
        let heap = Heap::new();

        assert_eq!(named_in(&heap, "node name").as_str(), "node name");
    }

    #[test]
    fn reset_clears_runtime_symbols() {
        let mut heap = Heap::new();
        heap.alloc_symbol("runtime name");

        heap.reset();

        // An entry that survived the reset would make this call return the earlier allocation,
        // which the slice below then overwrites.
        let symbol = heap.alloc_symbol("runtime name");
        heap.alloc_slice_copy(&[0_u8; 64]);

        assert_eq!(symbol.as_str(), "runtime name");
        assert_eq!(heap.alloc_symbol("Integer"), sym::Integer);
    }

    #[test]
    fn try_alloc_symbol_during_scoped_ref() {
        let heap = Heap::new();
        let earlier = heap.alloc_symbol("earlier name");

        heap.as_scope().scoped_ref(|scope| {
            assert_matches!(heap.try_alloc_symbol("later name"), Err(AllocError));
            assert_eq!(heap.try_alloc_symbol("earlier name"), Ok(earlier));
            assert_eq!(*scope.alloc(1_u32), 1);
        });

        assert_eq!(heap.alloc_symbol("later name").as_str(), "later name");
    }

    #[test]
    fn heap_scope_interns_into_heap_table() {
        let mut heap = Heap::new();
        let earlier = ptr::from_ref(heap.alloc_symbol("earlier name").as_str());

        let scope = heap.as_mut_scope();
        let again = ptr::from_ref((&scope).alloc_symbol("earlier name").as_str());
        let later = ptr::from_ref(named_in(&scope, "later name").as_str());

        assert_eq!(again, earlier);
        assert_eq!(
            ptr::from_ref(heap.alloc_symbol("later name").as_str()),
            later
        );
    }

    #[test]
    fn heap_scope_scoped_releases_scope_memory() {
        let mut heap = Heap::new();
        let mut scope = heap.as_mut_scope();

        let kept = (&scope).alloc_symbol("kept name");
        let first = scope.scoped(|scope| ptr::from_mut(scope.alloc(2_u32)));
        let second = scope.scoped(|scope| ptr::from_mut(scope.alloc(3_u32)));

        assert_eq!(first, second);
        assert_eq!(len_scoped(&mut scope, "other name"), 10);
        assert_eq!(kept.as_str(), "kept name");
    }

    #[test]
    fn heap_scope_try_alloc_symbol_during_scoped_ref() {
        let mut heap = Heap::new();
        let outer = heap.as_mut_scope();
        let earlier = (&outer).alloc_symbol("earlier name");

        outer.scoped_ref(|scope| {
            assert_matches!((&outer).try_alloc_symbol("later name"), Err(AllocError));
            assert_eq!((&outer).try_alloc_symbol("earlier name"), Ok(earlier));
            assert_eq!(*scope.alloc(1_u32), 1);
        });

        assert_eq!((&outer).alloc_symbol("later name").as_str(), "later name");
    }

    #[test]
    fn heap_scope_swap_moves_table_with_memory() {
        let mut first = Heap::new();
        let mut second = Heap::new();

        let mut first_scope = first.as_mut_scope();
        let mut second_scope = second.as_mut_scope();
        (&first_scope).alloc_symbol("first name");

        mem::swap(&mut first_scope, &mut second_scope);
        (&first_scope).alloc_symbol("second name");

        // A table that the swap separated from its memory would compare against freed strings here.
        drop(second);
        assert_eq!(first.alloc_symbol("first name").as_str(), "first name");
        assert_eq!(first.alloc_symbol("second name").as_str(), "second name");
    }
}
