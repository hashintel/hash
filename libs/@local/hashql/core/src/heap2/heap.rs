use core::alloc::AllocError;

use super::{
    ResetAllocator, SymbolAllocator,
    bump::{Bump, BumpScope},
    macros::{delegate_allocator, delegate_phase_allocator},
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
/// To open scopes, borrow the arena through [`as_scope`].
///
/// [`PhaseAllocator`]: super::PhaseAllocator
/// [`sym`]: crate::symbol::sym
/// [`reset`]: ResetAllocator::reset
/// [`as_scope`]: Self::as_scope
#[derive(Debug)]
pub struct Heap {
    // `symbols` points into the memory of `bump`. No method returns `&mut` access to either field:
    // `mem::swap` on the `bump` of two heaps exchanges their memory, and each table then points
    // into memory that the other heap releases.
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

    /// Borrows the arena to open scopes on it.
    ///
    /// The returned arena opens scopes through [`scoped_ref`]. Until such a scope ends, interning a
    /// string that the table does not hold fails, as every allocation through the `Heap` does.
    /// Intern the symbols that the scope needs before you open it.
    ///
    /// [`scoped_ref`]: super::ScopeAllocator::scoped_ref
    #[inline]
    #[must_use]
    pub fn as_scope(&self) -> &BumpScope<'_> {
        self.bump.as_scope()
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
// of a scope releases only memory that the scope allocated. A `Heap` opens scopes through
// `as_scope` alone, and until such a scope ends, every allocation from `self.bump` fails.
// `try_intern` returns that failure before it adds an entry to the table. The table and the memory
// it points into stay in one `Heap`, because no method returns `&mut` access to either of them. No
// code writes to the string of a symbol after `try_intern` returns.
//
// Therefore the string of every returned symbol stays valid and unchanged for all of `'alloc`.
unsafe impl<'alloc> SymbolAllocator<'alloc> for &'alloc Heap {
    #[inline]
    fn try_alloc_symbol(self, name: &str) -> Result<Symbol<'alloc>, AllocError> {
        let mut symbols = self.symbols.lock();

        // SAFETY: The table holds no dangling symbol: `reset` clears it before it releases the
        // memory of `self.bump`, and the comment on this implementation shows that no symbol is in
        // the memory of a scope. Every call passes `self.bump`, which lives as long as the `Heap`
        // that owns the table.
        let repr = unsafe { symbols.try_intern(&self.bump, name) }?;

        // SAFETY: `try_intern` returned `repr` from the one table of this `Heap`, and the comment
        // on this implementation shows that its string is valid for `'alloc`.
        Ok(unsafe { Symbol::from_repr(repr) })
    }
}

// SAFETY: Every allocator of the arena borrows the `Heap`: `&Heap` is that borrow, and `as_scope`
// returns a `BumpScope` whose lifetime is the lifetime of the borrow. The allocations and the
// symbols of those allocators live no longer than that lifetime, and `Heap` itself implements no
// `ScopeAllocator`. The symbol table keeps pointers into the arena beyond such a borrow, and
// `reset` clears the table before it releases the memory. `reset` takes `&mut self`. Therefore no
// memory of the arena is reachable when it runs.
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

#[cfg(test)]
mod tests {
    use core::{alloc::AllocError, assert_matches, ptr};

    use super::Heap;
    use crate::{
        heap2::{PhaseAllocator, ResetAllocator as _, ScopeAllocator as _, SymbolAllocator},
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
}
