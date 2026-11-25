#![expect(unsafe_code)]
use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    marker::Destruct,
    mem,
};

use crate::symbol::Symbol;

const unsafe trait PhaseAllocator<'alloc>: Allocator {
    unsafe fn try_alloc_with_unchecked<T>(
        &self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc T, AllocError>;

    #[inline]
    fn try_alloc_with<T>(
        &self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc T, AllocError> {
        const { assert!(!mem::needs_drop::<T>()) };
        unsafe { self.try_alloc_with_unchecked(value) }
    }

    #[inline]
    fn try_alloc<T>(&self, value: T) -> Result<&'alloc T, AllocError>
    where
        T: [const] Destruct,
    {
        const { assert!(!mem::needs_drop::<T>()) };
        unsafe { self.try_alloc_with_unchecked(const || value) }
    }

    #[inline]
    fn alloc_with<T>(&self, value: impl [const] FnOnce() -> T + [const] Destruct) -> &'alloc T {
        match self.try_alloc_with(value) {
            Ok(value) => value,
            Err(_) => {
                let layout = Layout::new::<T>();
                handle_alloc_error(layout)
            }
        }
    }

    #[inline]
    fn alloc<T>(&self, value: T) -> &'alloc T
    where
        T: [const] Destruct,
    {
        match self.try_alloc(value) {
            Ok(value) => value,
            Err(_) => {
                let layout = Layout::new::<T>();
                handle_alloc_error(layout)
            }
        }
    }

    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        &self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError>;

    #[inline]
    fn try_alloc_slice_uninit<T>(
        &self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError> {
        const { assert!(!mem::needs_drop::<T>()) };
        unsafe { self.try_alloc_slice_uninit_unchecked(len) }
    }

    #[inline]
    fn alloc_slice_uninit<T>(&self, len: usize) -> &'alloc mut [mem::MaybeUninit<T>] {
        match self.try_alloc_slice_uninit(len) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<mem::MaybeUninit<T>>(len) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }

    unsafe fn try_alloc_slice_unchecked<T>(
        &self,
        slice: &[T],
    ) -> Result<&'alloc mut [T], AllocError>;

    #[inline]
    fn try_alloc_slice<T>(&self, slice: &[T]) -> Result<&'alloc mut [T], AllocError> {
        const { assert!(!mem::needs_drop::<T>()) };
        unsafe { self.try_alloc_slice_unchecked(slice) }
    }

    #[inline]
    fn alloc_slice<T>(&self, slice: &[T]) -> &'alloc mut [T] {
        match self.try_alloc_slice(slice) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<T>(slice.len()) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }
}

const unsafe trait ResetAllocator {
    fn reset(&mut self);
}

const unsafe trait ScopeAllocator<'alloc>: PhaseAllocator<'alloc> {
    type Scoped<'scope>: ScopeAllocator<'scope>
    where
        'alloc: 'scope;

    // scoped would work for both `&mut Scratch` and `&Scratch` I think.
    fn scoped<T>(&mut self, func: impl FnOnce(&mut Self::Scoped<'_>) -> T) -> T;
    fn scoped_ref<T>(&self, func: impl FnOnce(&mut Self::Scoped<'_>) -> T) -> T;
}

const unsafe trait SymbolAllocator<'alloc> {
    fn try_alloc_symbol(&self, name: &str) -> Result<Symbol<'alloc>, AllocError>;

    #[inline]
    fn alloc_symbol(&self, name: &str) -> Symbol<'alloc> {
        match self.try_alloc_symbol(name) {
            Ok(symbol) => symbol,
            Err(_) => {
                todo!()
            }
        }
    }
}
