use core::{alloc, mem};

use bump_scope::BumpBox;

use super::{PhaseAllocator, ResetAllocator, ScopeAllocator, Scoped, macros::delegate_allocator};

/// The allocator of a [`Bump`] or of a scope opened in one.
#[repr(transparent)]
pub(super) struct BumpScope<'alloc>(bump_scope::BumpScope<'alloc>);

impl<'alloc> BumpScope<'alloc> {
    fn from_mut<'scope>(scope: &'scope mut bump_scope::BumpScope<'alloc>) -> &'scope mut Self {
        // SAFETY: `Self` is `repr(transparent)` over `bump_scope::BumpScope<'alloc>`. The pointer
        // is therefore valid for `Self`, and the returned reference takes over the exclusive borrow
        // of `scope` for `'scope`.
        unsafe { &mut *(&raw mut *scope).cast::<Self>() }
    }

    const fn from_ref<'scope>(scope: &'scope bump_scope::BumpScope<'alloc>) -> &'scope Self {
        // SAFETY: `Self` is `repr(transparent)` over `bump_scope::BumpScope<'alloc>`. The pointer
        // is therefore valid for `Self`, and the returned reference shares the borrow of `scope`
        // for `'scope`.
        unsafe { &*(&raw const *scope).cast::<Self>() }
    }
}

delegate_allocator!(BumpScope<'_>, 0);

// SAFETY: bump-scope hands out an allocation of a `bump_scope::BumpScope<'alloc>` as a
// `BumpBox<'alloc, _>`, which owns its memory for all of `'alloc`. `BumpBox::leak` turns that
// ownership into the returned reference. A `BumpScope` exists only behind a reference, so safe code
// cannot drop one. The slices have the requested length, because bump-scope allocates `len`
// elements and one element for each element of `slice`.
unsafe impl<'alloc> PhaseAllocator<'alloc> for BumpScope<'alloc> {
    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        &self,
        value: impl FnOnce() -> T,
    ) -> Result<&'alloc mut T, alloc::AllocError> {
        self.0
            .try_alloc_with(value)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        &self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], alloc::AllocError> {
        self.0
            .try_alloc_uninit_slice(len)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn try_alloc_slice_copy<T>(&self, slice: &[T]) -> Result<&'alloc mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        self.0
            .try_alloc_slice_copy(slice)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }
}

// SAFETY: A `BumpScopeGuard` records the position of the arena at its creation. Its `Drop` releases
// the memory allocated after that position and nothing before it. Both methods drop the guard after
// `func` returns, which keeps the memory of the scope valid until then. Between the creation of the
// guard and its drop, only the scope allocates: `scoped` holds `&mut self`, and `scoped_ref` holds
// a claim, during which bump-scope fails every allocation through `self`. Therefore the guard
// releases only memory of the scope and of scopes nested in it.
unsafe impl<'alloc> ScopeAllocator<'alloc> for BumpScope<'alloc> {
    type Scoped<'scope> = BumpScope<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        // `BumpScopeGuard::scope` returns a `&'guard mut bump_scope::BumpScope<'guard>`, the one
        // lifetime that `Scoped::new` takes. `bump_scope::BumpScope::scoped` passes its closure a
        // reference with two lifetimes.
        let mut guard = self.0.scope_guard();

        func(Scoped::new(BumpScope::from_mut(guard.scope())))
    }

    #[inline]
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        let mut claim = self.0.claim();
        let mut guard = claim.scope_guard();

        func(Scoped::new(BumpScope::from_mut(guard.scope())))
    }
}

/// The owner of an arena.
///
/// You allocate from a `Bump` through a borrow of it. `&Bump` is an allocator, and so is the
/// [`BumpScope`] that [`as_mut_scope`] returns. [`reset`] takes `&mut self`, which the compiler
/// grants only once those borrows and the allocations made through them are no longer in use.
///
/// [`as_mut_scope`]: Self::as_mut_scope
/// [`reset`]: ResetAllocator::reset
pub(super) struct Bump(bump_scope::Bump);

impl Bump {
    pub(super) fn new() -> Self {
        Self(bump_scope::Bump::new())
    }

    pub(super) fn with_capacity(capacity: usize) -> Self {
        Self(bump_scope::Bump::with_size(capacity))
    }

    fn as_scope(&self) -> &BumpScope<'_> {
        BumpScope::from_ref(self.0.as_scope())
    }

    /// Returns the allocator that has exclusive access to the arena.
    ///
    /// Its [`scoped`] opens a scope without the restrictions of [`scoped_ref`]. Through `&Bump`,
    /// both methods open the scope as [`scoped_ref`] does.
    ///
    /// [`scoped`]: ScopeAllocator::scoped
    /// [`scoped_ref`]: ScopeAllocator::scoped_ref
    pub(super) fn as_mut_scope(&mut self) -> &mut BumpScope<'_> {
        BumpScope::from_mut(self.0.as_mut_scope())
    }
}

delegate_allocator!(Bump, 0);

// SAFETY: Every method calls the method of the same name on the `BumpScope<'alloc>` that `as_scope`
// returns for the `'alloc` borrow of the `Bump`. That borrow keeps the `Bump` from being reset,
// moved or dropped during `'alloc`.
unsafe impl<'alloc> PhaseAllocator<'alloc> for &'alloc Bump {
    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        &self,
        value: impl FnOnce() -> T,
    ) -> Result<&'alloc mut T, alloc::AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { self.as_scope().try_alloc_with_unchecked(value) }
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        &self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], alloc::AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { self.as_scope().try_alloc_slice_uninit_unchecked(len) }
    }

    #[inline]
    fn try_alloc_slice_copy<T>(&self, slice: &[T]) -> Result<&'alloc mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        self.as_scope().try_alloc_slice_copy(slice)
    }
}

// SAFETY: Both methods open the scope through `BumpScope::scoped_ref` on the `BumpScope<'alloc>`
// that `as_scope` returns, which upholds the contract.
unsafe impl<'alloc> ScopeAllocator<'alloc> for &'alloc Bump {
    type Scoped<'scope> = BumpScope<'scope>;

    // `BumpScope::scoped` takes `&mut BumpScope`, which a shared borrow of the `Bump` cannot
    // provide.
    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        BumpScope::scoped_ref(self.as_scope(), |scope| func(scope.rebind()))
    }

    #[inline]
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        BumpScope::scoped_ref(self.as_scope(), |scope| func(scope.rebind()))
    }
}

// SAFETY: Every allocator of the arena borrows the `Bump`: `&Bump` is that borrow, and `as_scope`
// and `as_mut_scope` return a `BumpScope` whose lifetime is the lifetime of the borrow. The
// allocations of those allocators live no longer than that lifetime, and `Bump` itself implements
// no `PhaseAllocator`. `reset` takes `&mut self`. Therefore no memory of the arena is reachable
// when it runs.
unsafe impl ResetAllocator for Bump {
    #[inline]
    fn reset(&mut self) {
        self.0.reset();
    }
}

#[cfg(test)]
mod tests {
    use alloc::vec::Vec;
    use core::{alloc::AllocError, assert_matches, ptr};

    use super::Bump;
    use crate::heap2::{PhaseAllocator as _, ResetAllocator as _, ScopeAllocator};

    #[derive(Debug, PartialEq, Eq)]
    struct Token(u32);

    impl Clone for Token {
        fn clone(&self) -> Self {
            Self(self.0 + 1)
        }
    }

    // Copies one name into `alloc` and the remaining names into nested scopes, one scope for each
    // name. Every scope stores a reference to the allocation of its parent.
    fn total_len<'heap, 'alloc, S>(alloc: &mut S, names: &[&'heap str]) -> usize
    where
        'heap: 'alloc,
        S: ScopeAllocator<'alloc>,
    {
        let Some((&first, rest)) = names.split_first() else {
            return 0;
        };

        let kept: &'alloc [&'heap str] = alloc.alloc_slice_copy(&[first]);

        alloc.scoped(|mut scope| {
            let parent = scope.alloc(kept);

            parent[0].len() + total_len(&mut *scope, rest)
        })
    }

    // Takes its allocator by value, as a type that stores one does.
    fn sum_in<'alloc, S>(mut alloc: S, values: &[u32]) -> u32
    where
        S: ScopeAllocator<'alloc>,
    {
        let kept = alloc.alloc_slice_copy(values);

        alloc.scoped(|scope| scope.alloc_slice_copy(kept).iter().sum())
    }

    #[test]
    fn scoped_releases_scope_memory() {
        let mut bump = Bump::new();
        let scope = bump.as_mut_scope();

        let kept = scope.alloc(1_u32);
        let first = scope.scoped(|scope| ptr::from_mut(scope.alloc(2_u32)));
        let second = scope.scoped(|scope| ptr::from_mut(scope.alloc(3_u32)));

        assert_eq!(first, second);
        assert_eq!(*kept, 1);
    }

    #[test]
    fn scoped_ref_fails_outer_allocation() {
        let bump = Bump::new();
        let alloc = &bump;

        alloc.scoped_ref(|scope| {
            assert_matches!(alloc.try_alloc(1_u32), Err(AllocError));
            assert_eq!(*scope.alloc(2_u32), 2);
        });

        assert_matches!(alloc.try_alloc(3_u32), Ok(&mut 3));
    }

    #[test]
    fn scoped_on_shared_reference_claims() {
        let bump = Bump::new();
        let mut alloc = &bump;
        let other = alloc;

        alloc.scoped(|scope| {
            assert_matches!(other.try_alloc(1_u32), Err(AllocError));
            assert_eq!(*scope.alloc(2_u32), 2);
        });
    }

    #[test]
    fn scoped_ref_beside_collection() {
        let bump = Bump::new();
        let alloc = &bump;
        let mut sums = Vec::new_in(alloc);

        for pair in [[1_u32, 2], [3, 4]] {
            let sum = alloc.scoped_ref(|scope| {
                let mut temporary = Vec::new_in(&*scope);
                temporary.extend_from_slice(&pair);

                temporary.iter().sum::<u32>()
            });

            sums.push(sum);
        }

        assert_eq!(sums, [3, 7]);
    }

    #[test]
    fn scope_holds_outer_references() {
        let owned = alloc::string::String::from("bcd");
        let names = ["a", owned.as_str()];

        let mut bump = Bump::new();
        assert_eq!(total_len(&mut &bump, &names), 4);

        bump.reset();
        assert_eq!(total_len(&mut *bump.as_mut_scope(), &names), 4);
    }

    #[test]
    fn scoped_through_references() {
        let mut bump = Bump::new();

        assert_eq!(sum_in(&&bump, &[1, 2]), 3);
        assert_eq!(sum_in(&mut &bump, &[3, 4]), 7);
        assert_eq!(sum_in(bump.as_mut_scope(), &[5, 6]), 11);
    }

    #[test]
    fn alloc_slice_clone() {
        let bump = Bump::new();
        let alloc = &bump;

        let clones = alloc.alloc_slice_clone(&[Token(1), Token(5)]);
        assert_eq!(clones, [Token(2), Token(6)]);

        let empty = alloc.alloc_slice_clone::<Token>(&[]);
        assert_eq!(empty, []);
    }
}
