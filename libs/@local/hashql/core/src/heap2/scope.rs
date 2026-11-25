use core::ops::{Deref, DerefMut};

use super::PhaseAllocator;

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

pub const unsafe trait ScopeAllocator<'alloc>: PhaseAllocator<'alloc> {
    type Scoped<'scope>: ScopeAllocator<'scope>;

    // scoped would work for both `&mut Scratch` and `&Scratch` I think.
    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T;
    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, 'alloc, Self>) -> T) -> T;
}
