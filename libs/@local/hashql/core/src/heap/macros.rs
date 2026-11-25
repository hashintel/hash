macro_rules! delegate_allocator {
    ($wrapper:ty, $field:tt $(,)?) => {
        $crate::heap::macros::delegate_allocator!($wrapper, $field, ::core::alloc::Allocator);
    };
    ($wrapper:ty, $field:tt, $inner:path $(,)?) => {
        $crate::heap::macros::delegate_allocator!($wrapper, $field, $inner, []);
    };
    ($wrapper:ty, $field:tt, $inner:path, [$($generics:tt)*] $(where $($bounds:tt)+)?) => {
        // SAFETY: Every operation uses the same inner allocator and preserves its contract.
        unsafe impl<$($generics)*> ::core::alloc::Allocator for $wrapper
        $(where $($bounds)+)?
        {
            #[inline]
            fn allocate(
                &self,
                layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                <_ as $inner>::allocate(&self.$field, layout).map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            fn allocate_zeroed(
                &self,
                layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                <_ as $inner>::allocate_zeroed(&self.$field, layout)
                    .map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            unsafe fn deallocate(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                layout: ::core::alloc::Layout,
            ) {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe { <_ as $inner>::deallocate(&self.$field, ptr, layout) }
            }

            #[inline]
            unsafe fn grow(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                old_layout: ::core::alloc::Layout,
                new_layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe { <_ as $inner>::grow(&self.$field, ptr, old_layout, new_layout) }
                    .map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            unsafe fn grow_zeroed(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                old_layout: ::core::alloc::Layout,
                new_layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe { <_ as $inner>::grow_zeroed(&self.$field, ptr, old_layout, new_layout) }
                    .map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            unsafe fn shrink(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                old_layout: ::core::alloc::Layout,
                new_layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe { <_ as $inner>::shrink(&self.$field, ptr, old_layout, new_layout) }
                    .map_err(|_| ::core::alloc::AllocError)
            }
        }

        impl<$($generics)*> ::core::alloc::AllocatorNightly for $wrapper
        $(where $($bounds)+)?
        {
        }
    };
}

macro_rules! delegate_phase_allocator {
    ($alloc:lifetime, $wrapper:ty, $field:tt $(,)?) => {
        // SAFETY: The selected allocator supplies the allocations for the same lifetime.
        unsafe impl<$alloc> $crate::heap::PhaseAllocator<$alloc> for $wrapper {
            #[inline]
            unsafe fn try_alloc_with_unchecked<T>(
                self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe {
                    $crate::heap::PhaseAllocator::try_alloc_with_unchecked(&self.$field, value)
                }
            }

            #[inline]
            fn try_alloc_with<T>(
                self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                $crate::heap::PhaseAllocator::try_alloc_with(&self.$field, value)
            }

            #[inline]
            fn try_alloc<T>(self, value: T) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                $crate::heap::PhaseAllocator::try_alloc(&self.$field, value)
            }

            #[inline]
            fn alloc_with<T>(self, value: impl FnOnce() -> T) -> &$alloc mut T {
                $crate::heap::PhaseAllocator::alloc_with(&self.$field, value)
            }

            #[inline]
            fn alloc<T>(self, value: T) -> &$alloc mut T {
                $crate::heap::PhaseAllocator::alloc(&self.$field, value)
            }

            #[inline]
            unsafe fn try_alloc_slice_uninit_unchecked<T>(
                self,
                len: usize,
            ) -> Result<&$alloc mut [::core::mem::MaybeUninit<T>], ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe {
                    $crate::heap::PhaseAllocator::try_alloc_slice_uninit_unchecked(
                        &self.$field,
                        len,
                    )
                }
            }

            #[inline]
            fn try_alloc_slice_uninit<T>(
                self,
                len: usize,
            ) -> Result<&$alloc mut [::core::mem::MaybeUninit<T>], ::core::alloc::AllocError> {
                $crate::heap::PhaseAllocator::try_alloc_slice_uninit(&self.$field, len)
            }

            #[inline]
            fn alloc_slice_uninit<T>(self, len: usize) -> &$alloc mut [::core::mem::MaybeUninit<T>] {
                $crate::heap::PhaseAllocator::alloc_slice_uninit(&self.$field, len)
            }

            #[inline]
            fn try_alloc_slice_copy<T: Copy>(
                self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                $crate::heap::PhaseAllocator::try_alloc_slice_copy(&self.$field, slice)
            }

            #[inline]
            fn alloc_slice_copy<T: Copy>(self, slice: &[T]) -> &$alloc mut [T] {
                $crate::heap::PhaseAllocator::alloc_slice_copy(&self.$field, slice)
            }

            #[inline]
            fn try_alloc_slice_clone<T: Clone>(
                self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                $crate::heap::PhaseAllocator::try_alloc_slice_clone(&self.$field, slice)
            }

            #[inline]
            fn alloc_slice_clone<T: Clone>(self, slice: &[T]) -> &$alloc mut [T] {
                $crate::heap::PhaseAllocator::alloc_slice_clone(&self.$field, slice)
            }
        }
    };
}

macro_rules! delegate_reset_allocator {
    ($wrapper:ty, $field:tt $(, [$($generics:tt)+])? $(,)?) => {
        // SAFETY: Reset uses the inner allocator's reset contract.
        unsafe impl $(<$($generics)+>)? $crate::heap::ResetAllocator for $wrapper {
            #[inline]
            fn reset(&mut self) {
                $crate::heap::ResetAllocator::reset(&mut self.$field);
            }
        }
    };
}

// Delegates to a field that holds an exclusive reference to an arena of type `$inner`.
macro_rules! delegate_scope_allocator {
    ($alloc:lifetime, $wrapper:ty, $field:tt, $inner:ty $(,)?) => {
        $crate::heap::macros::delegate_scope_allocator!($alloc, $wrapper, $field, $inner, []);
    };
    (
        $alloc:lifetime, $wrapper:ty, $field:tt, $inner:ty,
        [$($generics:tt)*] $(where $($bounds:tt)+)?
    ) => {
        // SAFETY: The selected arena supplies the allocations for the same lifetime, and both scope
        // methods pass `func` to the method of the same name on that arena.
        unsafe impl<$alloc, $($generics)*> $crate::heap::ScopeAllocator<$alloc> for $wrapper
        $(where $($bounds)+)?
        {
            type Scoped<'nested> =
                <$inner as $crate::heap::ScopeAllocator<$alloc>>::Scoped<'nested>;

            #[inline]
            unsafe fn try_alloc_with_unchecked<T>(
                this: &Self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner arena.
                unsafe {
                    <$inner as $crate::heap::ScopeAllocator<$alloc>>::try_alloc_with_unchecked(
                        &*this.$field,
                        value,
                    )
                }
            }

            #[inline]
            unsafe fn try_alloc_slice_uninit_unchecked<T>(
                this: &Self,
                len: usize,
            ) -> Result<&$alloc mut [::core::mem::MaybeUninit<T>], ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner arena.
                unsafe {
                    <$inner as $crate::heap::ScopeAllocator<$alloc>>
                        ::try_alloc_slice_uninit_unchecked(&*this.$field, len)
                }
            }

            #[inline]
            fn try_alloc_slice_copy<T: Copy>(
                this: &Self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                <$inner as $crate::heap::ScopeAllocator<$alloc>>::try_alloc_slice_copy(
                    &*this.$field,
                    slice,
                )
            }

            #[inline]
            fn scoped<T>(
                &mut self,
                func: impl for<'nested> FnOnce(
                    $crate::heap::Scoped<'nested, $alloc, Self::Scoped<'nested>>,
                ) -> T,
            ) -> T {
                <$inner as $crate::heap::ScopeAllocator<$alloc>>::scoped(&mut *self.$field, func)
            }

            #[inline]
            fn scoped_ref<T>(
                &self,
                func: impl for<'nested> FnOnce(
                    $crate::heap::Scoped<'nested, $alloc, Self::Scoped<'nested>>,
                ) -> T,
            ) -> T {
                <$inner as $crate::heap::ScopeAllocator<$alloc>>::scoped_ref(&*self.$field, func)
            }
        }
    };
}

pub(super) use delegate_allocator;
pub(super) use delegate_phase_allocator;
pub(super) use delegate_reset_allocator;
pub(super) use delegate_scope_allocator;
