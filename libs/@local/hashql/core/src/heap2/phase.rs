use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    marker::Destruct,
    mem,
};

pub const unsafe trait PhaseAllocator<'alloc>: Allocator {
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

    fn try_alloc_slice<T>(&self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: Copy;

    #[inline]
    fn alloc_slice<T>(&self, slice: &[T]) -> &'alloc mut [T]
    where
        T: Copy,
    {
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
