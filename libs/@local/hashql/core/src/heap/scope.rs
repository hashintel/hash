use core::{
    alloc::{AllocError, Allocator},
    marker::{Destruct, PhantomData},
    mem,
};

use super::{
    PhaseAllocator,
    macros::{delegate_allocator, delegate_scope_allocator},
};

/// The arena of a scope, borrowed with exclusive access.
///
/// [`ScopeAllocator::scoped`] and [`ScopeAllocator::scoped_ref`] pass a `Scoped` to their closure.
/// It is a [`ScopeAllocator`] whose allocations live for `'scope`. Call the allocation methods on
/// it directly. Pass `&scope` to code that takes a [`PhaseAllocator`], and `&mut scope` to code
/// that opens scopes of its own.
///
/// `S` is the [`ScopeAllocator::Scoped`] type of the arena that opened the scope, and `'alloc` is
/// the lifetime of that arena's allocations.
// A closure that is higher-ranked over `'scope` may assume only the bounds on `'scope` that the
// types in its signature imply. `Scoped` requires `'alloc: 'scope`, as `std::thread::Scope`
// requires `'env: 'scope`. With that bound an allocation in the scope can hold data that lives for
// `'alloc`.
pub struct Scoped<'scope, 'alloc, S>
where
    'alloc: 'scope,
{
    // No method returns this reference, and an implementor of `ScopeAllocator` may rely on that.
    // Safe code cannot exchange the arena of an open scope for another one with `mem::swap`.
    scope: &'scope mut S,
    _marker: PhantomData<&'alloc ()>,
}

impl<'scope, S> Scoped<'scope, '_, S> {
    #[inline]
    pub(super) const fn new(scope: &'scope mut S) -> Self {
        Self {
            scope,
            _marker: PhantomData,
        }
    }
}

delegate_allocator!(
    Scoped<'scope, 'alloc, S>,
    scope,
    Allocator,
    ['scope, 'alloc, S] where S: Allocator
);
delegate_scope_allocator!(
    'scope,
    Scoped<'scope, 'alloc, S>,
    scope,
    S,
    ['alloc, S] where S: ScopeAllocator<'scope>
);

/// An arena whose allocations live for `'alloc` and that can open scopes.
///
/// A shared reference to a `ScopeAllocator` is a [`PhaseAllocator`] for the same `'alloc`, and a
/// method call on a `ScopeAllocator` you hold takes that reference for you. What you allocate does
/// not borrow the `ScopeAllocator` and stays usable while you open a scope on it.
///
/// An exclusive reference to a `ScopeAllocator` is itself a `ScopeAllocator` for the same `'alloc`
/// and opens the same scopes. Pass `&mut arena` to a type that stores an `S: ScopeAllocator` when
/// you use the arena again afterwards.
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
/// [`scoped_ref`][Self::scoped_ref] leaves `self` usable, and an allocation through it that takes
/// memory fails until the closure returns.
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
/// length. The slice that [`try_alloc_slice_copy`][Self::try_alloc_slice_copy] returns must hold
/// the elements of its argument, in the same order.
///
/// Implementors must also ensure that:
///
/// - the memory of a scope stays valid until the closure that received the scope returns
/// - the end of a scope releases only memory that this scope or a scope nested in it allocated
///
/// # Example
///
/// ```
/// use hashql_core::heap::{PhaseAllocator as _, ScopeAllocator, Scratch};
///
/// // Sums the lengths of `names`. Each step copies one name into a scope of its own, which
/// // releases the copy at the end of the step.
/// fn total_len<'alloc, S>(alloc: &mut S, names: &[&str]) -> usize
/// where
///     S: ScopeAllocator<'alloc>,
/// {
///     let mut total = 0;
///
///     for name in names {
///         total += alloc.scoped(|scope| scope.alloc_slice_copy(name.as_bytes()).len());
///     }
///
///     total
/// }
///
/// let mut scratch = Scratch::new();
///
/// assert_eq!(total_len(scratch.as_mut_scope(), &["a", "bcd"]), 4);
/// ```
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
    fn scoped<T>(
        &mut self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T;

    /// Runs `func` with a new scope, as [`scoped`] does, through a shared reference.
    ///
    /// # Allocation failure during the scope
    ///
    /// Do not allocate through `self` until `func` returns, and do not grow a collection that
    /// allocates through it. Such an allocation fails with [`AllocError`] if it takes memory. An
    /// allocation of zero size takes none and may succeed. A caller that cannot report the failure,
    /// such as [`Vec::push`], calls [`handle_alloc_error`]. You can drop or shrink such a
    /// collection during the scope, which frees no memory.
    ///
    /// # Panics
    ///
    /// Panics if a scope that `scoped_ref` opened on this arena is still open. To nest scopes, open
    /// the inner scope on the outer scope.
    ///
    /// [`scoped`]: Self::scoped
    /// [`handle_alloc_error`]: alloc::alloc::handle_alloc_error
    fn scoped_ref<T>(
        &self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T;
}

// SAFETY: `S` upholds the conditions on the allocations and on the scopes, and every function here
// calls the function of the same name on that `S`. The reference owns no memory of the arena, and
// dropping it releases none. Therefore every condition that holds for `S` holds for `&mut S`.
const unsafe impl<'alloc, S> ScopeAllocator<'alloc> for &mut S
where
    S: [const] ScopeAllocator<'alloc> + ?Sized,
{
    type Scoped<'scope> = S::Scoped<'scope>;

    #[inline]
    unsafe fn try_alloc_with_unchecked<T>(
        this: &Self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc mut T, AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { S::try_alloc_with_unchecked(&**this, value) }
    }

    #[inline]
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        this: &Self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError> {
        // SAFETY: The caller upholds the same requirement.
        unsafe { S::try_alloc_slice_uninit_unchecked(&**this, len) }
    }

    #[inline]
    fn try_alloc_slice_copy<T>(this: &Self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: Copy,
    {
        S::try_alloc_slice_copy(&**this, slice)
    }

    #[inline]
    fn scoped<T>(
        &mut self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T {
        S::scoped(&mut **self, func)
    }

    #[inline]
    fn scoped_ref<T>(
        &self,
        func: impl for<'scope> FnOnce(Scoped<'scope, 'alloc, Self::Scoped<'scope>>) -> T,
    ) -> T {
        S::scoped_ref(&**self, func)
    }
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
