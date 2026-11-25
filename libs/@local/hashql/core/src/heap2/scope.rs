use core::ops::{Deref, DerefMut};

use super::PhaseAllocator;

/// A scope opened on the allocator `A`.
///
/// A `Scoped` is a `&'scope mut` reference to the allocator of the scope, [`A::Scoped<'scope>`],
/// together with the bound `'alloc: 'scope`. [`ScopeAllocator::scoped`] and
/// [`ScopeAllocator::scoped_ref`] pass one to their closure. Allocations made through it live for
/// `'scope`, and `'alloc` is the lifetime of `A`'s own allocations. Call the allocation methods on
/// it directly. Pass `&mut *scope` to code that takes an allocator, or `&*scope` where a shared
/// reference is enough.
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

/// A [`PhaseAllocator`] that can open scopes.
///
/// A scope is an allocator for temporary data: when it ends, it releases the memory allocated
/// through it. Opening one around each step of a long computation keeps the intermediate values of
/// every step from accumulating in the arena. You open a scope with a closure, and the scope ends
/// when the closure returns.
///
/// The closure receives the scope as a [`Scoped`]. Allocations made through the scope live for
/// `'scope`, a lifetime that ends with the closure, and the compiler rejects a reference into the
/// scope that would leave it. Scope memory can hold references to data that lives for `'alloc`,
/// because `'alloc` outlives `'scope`. A scope is itself a `ScopeAllocator` and can open scopes of
/// its own.
///
/// An allocation through any other allocator of the arena fails for as long as a scope is open.
/// [`scoped`][Self::scoped] borrows `self` exclusively until the closure returns, and the compiler
/// rejects an allocation through `self` in the meantime. [`scoped_ref`][Self::scoped_ref] leaves
/// `self` usable, and avoiding such an allocation is up to you.
///
/// A shared reference to an allocator is an allocator as well. Its [`scoped`][Self::scoped] opens
/// the scope as [`scoped_ref`][Self::scoped_ref] does, because the reference has no exclusive
/// access to the allocator. The same restrictions apply to every copy of the reference.
///
/// # Advice
///
/// Use [`scoped`][Self::scoped] wherever you have exclusive access to the allocator. Use
/// [`scoped_ref`][Self::scoped_ref] when you share the allocator, for example with a collection
/// that holds it for its own allocations.
///
/// # Safety
///
/// Implementors must ensure that:
///
/// - the memory of a scope stays valid until the closure that received the scope returns
/// - the end of a scope releases only memory that this scope or a scope nested in it allocated
///
/// Memory that `self` allocated must stay valid for `'alloc`, whether `self` allocated it before
/// the scope opened or while the scope is open.
pub const unsafe trait ScopeAllocator<'alloc>: PhaseAllocator<'alloc> {
    /// The allocator of a scope opened on this allocator.
    type Scoped<'scope>: ScopeAllocator<'scope>;

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
    /// Panics if a scope that `scoped_ref` opened on this allocator is still open. To nest scopes,
    /// open the inner scope on the outer scope.
    ///
    /// [`scoped`]: Self::scoped
    /// [`AllocError`]: core::alloc::AllocError
    /// [`handle_alloc_error`]: alloc::alloc::handle_alloc_error
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T;
}

// SAFETY: Every scope is one that `A::scoped_ref` opened, and `A` upholds the contract for it.
unsafe impl<'alloc, A> ScopeAllocator<'alloc> for &A
where
    A: ScopeAllocator<'alloc> + ?Sized,
{
    type Scoped<'scope> = A::Scoped<'scope>;

    // `A::scoped` takes `&mut A`, which a shared reference cannot provide.
    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        A::scoped_ref(self, |scope| func(scope.rebind()))
    }

    #[inline]
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        A::scoped_ref(self, |scope| func(scope.rebind()))
    }
}

// SAFETY: Every scope is one that `A` opened, and `A` upholds the contract for it.
unsafe impl<'alloc, A> ScopeAllocator<'alloc> for &mut A
where
    A: ScopeAllocator<'alloc> + ?Sized,
{
    type Scoped<'scope> = A::Scoped<'scope>;

    #[inline]
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        A::scoped(self, |scope| func(scope.rebind()))
    }

    #[inline]
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T {
        A::scoped_ref(self, |scope| func(scope.rebind()))
    }
}
