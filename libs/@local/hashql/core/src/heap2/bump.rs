use core::{alloc, mem};

use bump_scope::BumpBox;

use super::{PhaseAllocator, ScopeAllocator, Scoped, macros::delegate_allocator};
use crate::heap::ResetAllocator;

#[repr(transparent)]
pub(super) struct BumpScope<'alloc>(bump_scope::BumpScope<'alloc>);

impl<'alloc> BumpScope<'alloc> {
    fn from_mut<'scope>(scope: &'scope mut bump_scope::BumpScope<'alloc>) -> &'scope mut Self {
        unsafe { &mut *(&raw mut *scope).cast::<Self>() }
    }

    fn from_ref<'scope>(scope: &'scope bump_scope::BumpScope<'alloc>) -> &'scope Self {
        unsafe { &*(&raw const *scope).cast::<Self>() }
    }
}

pub(super) struct Bump(bump_scope::Bump);

impl Bump {
    pub(super) fn new() -> Self {
        Self(bump_scope::Bump::new())
    }

    pub(super) fn with_capacity(capacity: usize) -> Self {
        Self(bump_scope::Bump::with_size(capacity))
    }
}

delegate_allocator!(Bump, 0);

unsafe impl<'alloc> PhaseAllocator<'alloc> for &'alloc Bump {
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
    fn try_alloc_slice<T>(&self, slice: &[T]) -> Result<&'alloc mut [T], alloc::AllocError>
    where
        T: Copy,
    {
        self.0
            .try_alloc_slice_copy(slice)
            .map(BumpBox::leak)
            .map_err(|_err| alloc::AllocError)
    }
}

unsafe impl<'alloc> ScopeAllocator<'alloc> for Bump {
    type Scoped<'scope> = BumpScope<'scope>;

    fn scoped<T>(&mut self, func: impl FnOnce(Scoped<'_, '_, Self>) -> T) -> T {
        self.0
            .scoped(|scope| func(Scoped::new(BumpScope::from_mut(scope))))
    }

    fn scoped_ref<T>(&self, func: impl FnOnce(Scoped<'_, '_, Self>) -> T) -> T {
        self.0
            .claim()
            .scoped(|scope| func(Scoped::new(BumpScope::from_mut(scope))))
    }
}

impl ResetAllocator for Bump {
    fn reset(&mut self) {
        self.0.reset();
    }
}
