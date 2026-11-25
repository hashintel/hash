use core::{
    alloc::{AllocError, Allocator},
    marker::Destruct,
    mem,
    ops::{Deref, DerefMut},
};

use super::PhaseAllocator;

/// A scope opened on the arena `A`.
///
/// A `Scoped` is a `&'scope mut` reference to the arena of the scope, [`A::Scoped<'scope>`],
/// together with the bound `'alloc: 'scope`. [`ScopeAllocator::scoped`] and
/// [`ScopeAllocator::scoped_ref`] pass one to their closure. Allocations made through it live for
/// `'scope`, and `'alloc` is the lifetime of `A`'s own allocations. Call the allocation methods on
/// it directly. Pass `&*scope` to code that takes a [`PhaseAllocator`], and `&mut *scope` to code
/// that opens scopes of its own.
///
/// [`A::Scoped<'scope>`]: ScopeAllocator::Scoped
// A closure that is higher-ranked over `'scope` may assume only the bounds on `'scope` that the
// types in its signature imply. `Scoped` requires `'alloc: 'scope`, as `std::thread::Scope`
// requires `'env: 'scope`. With that bound an allocation in the scope can hold data that lives for
// `'alloc`.
pub struct Scoped<'scope, 'alloc, A>
where
    'alloc: 'scope,
    A: ScopeAllocator<'alloc> + ?Sized,
{
    scope: &'scope mut A::Scoped<'scope>,
}

impl<'scope, 'alloc, A> Scoped<'scope, 'alloc, A>
where
    A: ScopeAllocator<'alloc> + ?Sized,
{
    #[inline]
    pub(super) const fn new(scope: &'scope mut A::Scoped<'scope>) -> Self {
        Self { scope }
    }

    // Transfer the original borrow without shortening it through `DerefMut`.
    #[inline]
    pub(super) const fn rebind<B>(self) -> Scoped<'scope, 'alloc, B>
    where
        B: ScopeAllocator<'alloc, Scoped<'scope> = A::Scoped<'scope>> + ?Sized,
    {
        Scoped::new(self.scope)
    }
}

const impl<'scope, 'alloc, A> Deref for Scoped<'scope, 'alloc, A>
where
    A: ScopeAllocator<'alloc> + ?Sized,
{
    type Target = A::Scoped<'scope>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.scope
    }
}

const impl<'alloc, A> DerefMut for Scoped<'_, 'alloc, A>
where
    A: ScopeAllocator<'alloc> + ?Sized,
{
    #[inline]
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.scope
    }
}

/// An arena whose allocations live for `'alloc` and that can open scopes.
///
/// A shared reference to a `ScopeAllocator` is a [`PhaseAllocator`] for the same `'alloc`, and a
/// method call on a `ScopeAllocator` you hold takes that reference for you. What you allocate does
/// not borrow the `ScopeAllocator` and stays usable while you open a scope on it.
///
/// A scope is an arena for temporary data: when it ends, it releases the memory allocated through
/// it. Opening one around each step of a long computation keeps the intermediate values of every
/// step from accumulating in the arena. You open a scope with a closure, and the scope ends when
/// the closure returns.
///
/// The closure receives the scope as a [`Scoped`]. Allocations made through the scope live for
/// `'scope`, a lifetime that ends with the closure, and the compiler rejects a reference into the
/// scope that would leave it. Scope memory can hold references to data that lives for `'alloc`,
/// because `'alloc` outlives `'scope`. A scope is itself a `ScopeAllocator` and can open scopes of
/// its own.
///
/// Until the closure of a scope returns, the arena allocates only through that scope and the scopes
/// nested in it. [`scoped`][Self::scoped] borrows `self` exclusively until the closure returns, and
/// the compiler rejects an allocation through `self` in the meantime.
/// [`scoped_ref`][Self::scoped_ref] leaves `self` usable, and an allocation through it fails until
/// the closure returns.
///
/// Taking `this` in place of `self` keeps the allocation functions of this trait out of method
/// resolution. A call such as `scope.try_alloc_slice_copy(slice)` therefore always resolves to the
/// method of [`PhaseAllocator`], which a shared reference to a `ScopeAllocator` implements through
/// the function of the same name.
///
/// # Advice
///
/// Use [`scoped`][Self::scoped] wherever you have exclusive access to the arena. Use
/// [`scoped_ref`][Self::scoped_ref] when you share the arena, for example with a collection that
/// holds a reference to it for its own allocations.
///
/// # Safety
///
/// Implementors must ensure that the memory behind every reference an allocation function of this
/// trait returns:
///
/// - stays allocated at the same address for all of `'alloc`
/// - is not handed out again during `'alloc` by any allocator of the same arena
///
/// Both conditions must hold whatever safe code does with the implementor in the meantime, which
/// includes dropping it and opening scopes on it. A returned slice must have exactly the requested
/// length.
///
/// Implementors must also ensure that:
///
/// - the memory of a scope stays valid until the closure that received the scope returns
/// - the end of a scope releases only memory that this scope or a scope nested in it allocated
pub const unsafe trait ScopeAllocator<'alloc>: Allocator {
    /// The arena of a scope opened on this arena.
    type Scoped<'scope>: ScopeAllocator<'scope>;

    /// Allocates the result of calling `value`, without checking that `T` needs no destructor.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// # Safety
    ///
    /// [`mem::needs_drop`] must return `false` for `T`. The arena releases the value without
    /// running its destructor.
    unsafe fn try_alloc_with_unchecked<T>(
        this: &Self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc mut T, AllocError>;

    /// Allocates `len` uninitialized values, without checking that `T` needs no destructor.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// # Safety
    ///
    /// [`mem::needs_drop`] must return `false` for `T`. The arena releases the values without
    /// running their destructors.
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        this: &Self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError>;

    /// Copies `slice` into the arena.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    fn try_alloc_slice_copy<T>(this: &Self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: Copy;

    /// Runs `func` with a new scope and releases the scope's memory when `func` returns.
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T;

    /// Runs `func` with a new scope, as [`scoped`] does, through a shared reference.
    ///
    /// # Allocation failure during the scope
    ///
    /// Do not allocate through `self` until `func` returns, and do not grow a collection that
    /// allocates through it. Such an allocation fails with [`AllocError`]. A caller that cannot
    /// report the failure, such as [`Vec::push`], calls [`handle_alloc_error`]. You can drop or
    /// shrink such a collection during the scope, which frees no memory.
    ///
    /// # Panics
    ///
    /// Panics if a scope that `scoped_ref` opened on this arena is still open. To nest scopes, open
    /// the inner scope on the outer scope.
    ///
    /// [`scoped`]: Self::scoped
    /// [`handle_alloc_error`]: alloc::alloc::handle_alloc_error
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T;
}

// SAFETY: Every method calls the function of the same name on `A`. `ScopeAllocator` requires of
// that function what `PhaseAllocator` requires of the method, and a reference to `A` adds no way to
// release memory that `A` handed out.
const unsafe impl<'alloc, A> PhaseAllocator<'alloc> for &A
where
    A: [const] ScopeAllocator<'alloc> + ?Sized,
{
    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc mut T, AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { A::try_alloc_with_unchecked(self, value) }
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { A::try_alloc_slice_uninit_unchecked(self, len) }
    }

    #[inline]
    fn try_alloc_slice_copy<T>(self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: Copy,
    {
        A::try_alloc_slice_copy(self, slice)
    }
}
