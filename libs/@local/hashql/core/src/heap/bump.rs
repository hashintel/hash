use core::{alloc, mem, ptr, slice};

use bump_scope::BumpBox;

use super::{PhaseAllocator, ResetAllocator, ScopeAllocator, Scoped, macros::delegate_allocator};

/// The arena of a [`Scratch`] or a [`Heap`], or of a scope opened in one.
///
/// `&BumpScope` allocates, and `&mut BumpScope` has the exclusive access that [`scoped`] takes.
///
/// [`Scratch`]: super::Scratch
/// [`Heap`]: super::Heap
/// [`scoped`]: ScopeAllocator::scoped
// A `bump_scope::BumpScopeGuard` records the chunk and the position of its arena, and its `Drop`
// writes both back into the `bump_scope::BumpScope` that `BumpScopeGuard::scope` returned.
// `mem::swap` on that `BumpScope` and on the `BumpScope` of a second arena exchanges their chunks.
// The `Drop` then panics in a build with debug assertions, and in every other build it leaves both
// arenas with the chunk of the first. Safe code must therefore never hold a `&mut BumpScope` to an
// arena while a guard of that arena is alive.
//
// Both scope methods pass the reference from `BumpScopeGuard::scope` to `Scoped::new` alone, and a
// `Scoped` returns its reference from no method. Every other `&mut BumpScope` is a borrow of the
// arena of a `Bump`, from `Bump::as_mut_scope`. A guard of that arena is alive only during `scoped`
// and `scoped_ref`. `scoped` holds that reference until it drops the guard, and the claim of
// `scoped_ref` borrows the arena. `mem::swap` on two such references exchanges all the memory of
// two arenas that have no guard, as `mem::swap` on the two `Bump`s does.
#[repr(transparent)]
pub struct BumpScope<'alloc>(bump_scope::BumpScope<'alloc>);

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

delegate_allocator!(BumpScope<'_>, 0, ::bump_scope::alloc::Allocator);

// SAFETY: bump-scope hands out an allocation of a `bump_scope::BumpScope<'alloc>` as a
// `BumpBox<'alloc, _>`, which owns its memory for all of `'alloc`. `BumpBox::leak` turns that
// ownership into the returned reference. A `BumpScope` exists only behind a reference, so safe code
// cannot drop one. `mem::swap` on two `&mut BumpScope<'alloc>` moves the memory of their
// allocations to the `Bump` of the other reference, and both references borrow their `Bump` for
// `'alloc`. A slice of zero bytes points to no memory of the arena:
// `try_alloc_slice_uninit_unchecked` builds it from a dangling pointer and `len`, and it stays
// valid for every lifetime. For every other slice bump-scope allocates `len` elements. A slice
// therefore has the requested length. `try_alloc_slice_copy` requests one element for each element
// of `slice` and copies `slice` into them with `write_copy_of_slice`.
//
// A `BumpScopeGuard` records the position of the arena at its creation. Its `Drop` releases the
// memory allocated after that position and nothing before it. Both scope methods drop the guard
// after `func` returns, which keeps the memory of the scope valid until then. Between the creation
// of the guard and its drop, only the scope allocates: `scoped` holds `&mut self`, and `scoped_ref`
// holds a claim, during which bump-scope fails every allocation through `self` that takes memory of
// the arena. The comment on `BumpScope` shows that safe code cannot exchange the arena of the scope
// for another arena in the meantime. Therefore the guard releases only memory of the scope and of
// scopes nested in it.
unsafe impl<'alloc> ScopeAllocator<'alloc> for BumpScope<'alloc> {
    type Scoped<'scope> = BumpScope<'scope>;

    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        this: &Self,
        value: impl FnOnce() -> T,
    ) -> Result<&'alloc mut T, alloc::AllocError> {
        this.0
            .try_alloc_with(value)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        this: &Self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], alloc::AllocError> {
        // bump-scope aligns the position of the arena for a slice of zero bytes, which can take
        // padding, and fails that slice during `scoped_ref`.
        if size_of::<T>() == 0 || len == 0 {
            let data = ptr::NonNull::<mem::MaybeUninit<T>>::dangling();

            // SAFETY: The slice spans zero bytes. A dangling pointer that is aligned for `T` is
            // valid for reads and writes of zero bytes, and a `MaybeUninit<T>` needs no
            // initialization.
            return Ok(unsafe { slice::from_raw_parts_mut(data.as_ptr(), len) });
        }

        this.0
            .try_alloc_uninit_slice(len)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }

    #[inline]
    fn try_alloc_slice_copy<T>(
        this: &Self,
        slice: &[T],
    ) -> Result<&'alloc mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        // `bump_scope::BumpScope::try_alloc_slice_copy` calls `Clone::clone` for every element of a
        // zero-sized `T`.
        let uninit = PhaseAllocator::try_alloc_slice_uninit(this, slice.len())?;

        Ok(uninit.write_copy_of_slice(slice))
    }

    #[inline]
    fn scoped<T>(
        &mut self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T {
        // `BumpScopeGuard::scope` returns a `&'guard mut bump_scope::BumpScope<'guard>`, the one
        // lifetime that `Scoped::new` takes. `bump_scope::BumpScope::scoped` passes its closure a
        // reference with two lifetimes.
        let mut guard = self.0.scope_guard();

        func(Scoped::new(BumpScope::from_mut(guard.scope())))
    }

    #[inline]
    fn scoped_ref<T>(
        &self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T {
        let mut claim = self.0.claim();
        let mut guard = claim.scope_guard();

        func(Scoped::new(BumpScope::from_mut(guard.scope())))
    }
}

/// The owner of an arena.
///
/// `&Bump` allocates for as long as it borrows the `Bump`. To open scopes, borrow the arena through
/// [`as_mut_scope`] or [`as_scope`]. [`reset`] takes `&mut self`, which the compiler grants only
/// once those borrows and the allocations made through them are no longer in use.
///
/// [`as_mut_scope`]: Self::as_mut_scope
/// [`as_scope`]: Self::as_scope
/// [`reset`]: ResetAllocator::reset
#[derive(Debug)]
pub(super) struct Bump(bump_scope::Bump);

impl Bump {
    pub(super) fn new() -> Self {
        Self(bump_scope::Bump::new())
    }

    pub(super) fn with_capacity(capacity: usize) -> Self {
        Self(bump_scope::Bump::with_size(capacity))
    }

    /// Borrows the arena for code that shares it.
    ///
    /// The [`BumpScope`] opens scopes through [`scoped_ref`] alone.
    ///
    /// [`scoped_ref`]: ScopeAllocator::scoped_ref
    pub(super) fn as_scope(&self) -> &BumpScope<'_> {
        BumpScope::from_ref(self.0.as_scope())
    }

    /// Borrows the arena with exclusive access.
    ///
    /// The [`BumpScope`] opens scopes through [`scoped`], which has none of the restrictions of
    /// [`scoped_ref`].
    ///
    /// [`scoped`]: ScopeAllocator::scoped
    /// [`scoped_ref`]: ScopeAllocator::scoped_ref
    pub(super) fn as_mut_scope(&mut self) -> &mut BumpScope<'_> {
        BumpScope::from_mut(self.0.as_mut_scope())
    }
}

delegate_allocator!(Bump, 0, ::bump_scope::alloc::Allocator);

// SAFETY: Every method calls the function of the same name on the `BumpScope<'alloc>` that
// `as_scope` returns for the `'alloc` borrow of the `Bump`. That borrow keeps the `Bump` from being
// reset, moved or dropped during `'alloc`.
unsafe impl<'alloc> PhaseAllocator<'alloc> for &'alloc Bump {
    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        self,
        value: impl FnOnce() -> T,
    ) -> Result<&'alloc mut T, alloc::AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { ScopeAllocator::try_alloc_with_unchecked(self.as_scope(), value) }
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], alloc::AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { ScopeAllocator::try_alloc_slice_uninit_unchecked(self.as_scope(), len) }
    }

    #[inline]
    fn try_alloc_slice_copy<T>(self, slice: &[T]) -> Result<&'alloc mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        ScopeAllocator::try_alloc_slice_copy(self.as_scope(), slice)
    }
}

// SAFETY: An allocator that shares the arena borrows the `Bump`: `&Bump` is that borrow, and
// `as_scope` and `as_mut_scope` return a `BumpScope` whose lifetime is the lifetime of the borrow.
// The allocations of those allocators live no longer than that lifetime, and `Bump` itself
// implements no `ScopeAllocator`. A collection that allocates in the `Bump` by value owns it and
// lends it by shared reference alone. `reset` takes `&mut self`. Therefore no memory of the arena
// is reachable when it runs.
unsafe impl ResetAllocator for Bump {
    #[inline]
    fn reset(&mut self) {
        self.0.reset();
    }
}

#[cfg(test)]
mod tests {
    use alloc::vec::Vec;
    use core::{
        alloc::AllocError,
        assert_matches, mem, ptr,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::Bump;
    use crate::heap::{PhaseAllocator, ResetAllocator as _, ScopeAllocator};

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

            parent[0].len() + total_len(&mut scope, rest)
        })
    }

    // The same with the arena held by value, as a pass that stores its arena does.
    fn total_len_owned<'heap, 'alloc, S>(mut alloc: S, names: &[&'heap str]) -> usize
    where
        'heap: 'alloc,
        S: ScopeAllocator<'alloc>,
    {
        let Some((&first, rest)) = names.split_first() else {
            return 0;
        };

        let kept: &'alloc [&'heap str] = alloc.alloc_slice_copy(&[first]);

        alloc.scoped(|scope| {
            let parent = scope.alloc(kept);

            parent[0].len() + total_len_owned(scope, rest)
        })
    }

    // Uses its allocator for two allocations, as a type that stores one does.
    fn sum_in<'alloc, A>(alloc: A, values: &[u32]) -> u32
    where
        A: PhaseAllocator<'alloc>,
    {
        let kept = alloc.alloc_slice_copy(values);
        let sum = alloc.alloc(kept.iter().sum::<u32>());

        *sum
    }

    #[test]
    fn alloc_on_owned_bump() {
        let bump = Bump::new();

        let first = bump.alloc(1_u32);
        let second = bump.alloc_slice_copy(&[*first, 2]);

        assert_eq!((*first, &*second), (1, &[1, 2][..]));
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
    fn swap_exchanges_arenas() {
        let mut first = Bump::new();
        let mut second = Bump::new();

        let first_scope = first.as_mut_scope();
        let second_scope = second.as_mut_scope();
        let kept = first_scope.alloc(1_u32);

        mem::swap(first_scope, second_scope);
        let later = second_scope.scoped(|scope| *scope.alloc(*kept + 1));

        assert_eq!((*kept, later), (1, 2));

        // Each `Bump` releases the memory that it received in the swap.
        drop(first);
        assert_eq!(*second.alloc(3_u32), 3);
    }

    #[test]
    fn scoped_ref_fails_outer_allocation() {
        let bump = Bump::new();
        let alloc = bump.as_scope();

        alloc.scoped_ref(|scope| {
            assert_matches!(alloc.try_alloc(1_u32), Err(AllocError));
            assert_matches!((&bump).try_alloc(1_u32), Err(AllocError));
            assert_eq!(*scope.alloc(2_u32), 2);
        });

        assert_matches!(alloc.try_alloc(3_u32), Ok(&mut 3));
    }

    #[test]
    fn scoped_ref_zero_sized() {
        let bump = Bump::new();
        let alloc = bump.as_scope();

        alloc.scoped_ref(|_| {
            assert_matches!(alloc.try_alloc(()), Ok(()));
            assert_matches!(alloc.try_alloc_slice_copy(&[(); 2]), Ok([(), ()]));
            assert_matches!(alloc.try_alloc_slice_copy::<u32>(&[]), Ok([]));
            assert_matches!(alloc.try_alloc_slice_uninit::<u32>(0), Ok([]));
        });
    }

    #[test]
    fn alloc_slice_zero_bytes() {
        let bump = Bump::new();
        bump.alloc(1_u8);
        let allocated = bump.0.stats().allocated();

        assert!(bump.alloc_slice_uninit::<u64>(0).is_empty());
        assert_eq!(bump.alloc_slice_uninit::<()>(usize::MAX).len(), usize::MAX);
        assert_eq!(bump.alloc_slice_copy(&[[0_u64; 0]; 3]).len(), 3);
        assert_eq!(bump.0.stats().allocated(), allocated);
    }

    #[test]
    fn scoped_ref_beside_collection() {
        let bump = Bump::new();
        let alloc = bump.as_scope();
        let mut sums = Vec::new_in(alloc);

        for pair in [[1_u32, 2], [3, 4]] {
            let sum = alloc.scoped_ref(|scope| {
                let mut temporary = Vec::new_in(&scope);
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
        assert_eq!(total_len(bump.as_mut_scope(), &names), 4);

        bump.reset();
        assert_eq!(total_len(bump.as_mut_scope(), &names), 4);
    }

    #[test]
    fn scopes_through_exclusive_reference() {
        let names = ["a", "bcd", "ef"];

        let mut bump = Bump::new();
        let root = bump.as_mut_scope();

        // A reborrow keeps `root` usable, and both calls nest scopes of one type.
        assert_eq!(total_len_owned(&mut *root, &names), 6);
        assert_eq!(
            root.scoped(|mut scope| total_len_owned(&mut scope, &names)),
            6
        );
        assert_eq!(root.scoped_ref(|scope| *scope.alloc(1_u32)), 1);

        let kept = (&root).alloc(2_u32);
        assert_eq!(total_len_owned(root, &names) + *kept as usize, 8);
    }

    #[test]
    fn alloc_through_pointers() {
        let mut bump = Bump::new();

        assert_eq!(sum_in(&bump, &[1, 2]), 3);
        assert_eq!(sum_in(bump.as_scope(), &[3, 4]), 7);

        let nested = bump.as_mut_scope().scoped(|scope| sum_in(&scope, &[5, 6]));
        assert_eq!(nested, 11);
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

    #[test]
    fn alloc_slice_copy_zero_sized() {
        static CLONES: AtomicUsize = AtomicUsize::new(0);

        #[derive(Copy)]
        struct Marker;

        #[expect(
            clippy::expl_impl_clone_on_copy,
            clippy::non_canonical_clone_impl,
            reason = "counts the calls that a copy must not make"
        )]
        impl Clone for Marker {
            fn clone(&self) -> Self {
                CLONES.fetch_add(1, Ordering::Relaxed);
                *self
            }
        }

        let bump = Bump::new();
        let copies = bump.alloc_slice_copy(&[Marker; 3]);

        assert_eq!(copies.len(), 3);
        assert_eq!(CLONES.load(Ordering::Relaxed), 0);
    }

    #[test]
    #[should_panic(expected = "capacity overflow")]
    fn alloc_slice_uninit_layout_overflow() {
        let bump = Bump::new();

        let _slice = bump.alloc_slice_uninit::<u64>(usize::MAX);
    }
}
