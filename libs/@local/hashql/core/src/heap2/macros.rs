macro_rules! delegate_allocator {
    ($wrapper:ty, $field:tt $(,)?) => {
        // SAFETY: Every operation uses the same inner allocator and preserves its contract.
        unsafe impl ::core::alloc::Allocator for $wrapper {
            #[inline]
            fn allocate(
                &self,
                layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                ::bump_scope::alloc::Allocator::allocate(&self.$field, layout)
                    .map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            fn allocate_zeroed(
                &self,
                layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                ::bump_scope::alloc::Allocator::allocate_zeroed(&self.$field, layout)
                    .map_err(|_| ::core::alloc::AllocError)
            }

            #[inline]
            unsafe fn deallocate(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                layout: ::core::alloc::Layout,
            ) {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe { ::bump_scope::alloc::Allocator::deallocate(&self.$field, ptr, layout) }
            }

            #[inline]
            unsafe fn grow(
                &self,
                ptr: ::core::ptr::NonNull<u8>,
                old_layout: ::core::alloc::Layout,
                new_layout: ::core::alloc::Layout,
            ) -> Result<::core::ptr::NonNull<[u8]>, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe {
                    ::bump_scope::alloc::Allocator::grow(&self.$field, ptr, old_layout, new_layout)
                }
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
                unsafe {
                    ::bump_scope::alloc::Allocator::grow_zeroed(
                        &self.$field,
                        ptr,
                        old_layout,
                        new_layout,
                    )
                }
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
                unsafe {
                    ::bump_scope::alloc::Allocator::shrink(
                        &self.$field,
                        ptr,
                        old_layout,
                        new_layout,
                    )
                }
                .map_err(|_| ::core::alloc::AllocError)
            }
        }

        impl ::core::alloc::AllocatorNightly for $wrapper {}
    };
}

macro_rules! delegate_phase_allocator {
    ($alloc:lifetime, $wrapper:ty, $field:tt $(,)?) => {
        // SAFETY: The selected allocator supplies the allocations for the same lifetime.
        unsafe impl<$alloc> $crate::heap2::PhaseAllocator<$alloc> for $wrapper {
            #[inline]
            unsafe fn try_alloc_with_unchecked<T>(
                self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe {
                    $crate::heap2::PhaseAllocator::try_alloc_with_unchecked(&self.$field, value)
                }
            }

            #[inline]
            fn try_alloc_with<T>(
                self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                $crate::heap2::PhaseAllocator::try_alloc_with(&self.$field, value)
            }

            #[inline]
            fn try_alloc<T>(self, value: T) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                $crate::heap2::PhaseAllocator::try_alloc(&self.$field, value)
            }

            #[inline]
            fn alloc_with<T>(self, value: impl FnOnce() -> T) -> &$alloc mut T {
                $crate::heap2::PhaseAllocator::alloc_with(&self.$field, value)
            }

            #[inline]
            fn alloc<T>(self, value: T) -> &$alloc mut T {
                $crate::heap2::PhaseAllocator::alloc(&self.$field, value)
            }

            #[inline]
            unsafe fn try_alloc_slice_uninit_unchecked<T>(
                self,
                len: usize,
            ) -> Result<&$alloc mut [::core::mem::MaybeUninit<T>], ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner allocator.
                unsafe {
                    $crate::heap2::PhaseAllocator::try_alloc_slice_uninit_unchecked(
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
                $crate::heap2::PhaseAllocator::try_alloc_slice_uninit(&self.$field, len)
            }

            #[inline]
            fn alloc_slice_uninit<T>(self, len: usize) -> &$alloc mut [::core::mem::MaybeUninit<T>] {
                $crate::heap2::PhaseAllocator::alloc_slice_uninit(&self.$field, len)
            }

            #[inline]
            fn try_alloc_slice_copy<T: Copy>(
                self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                $crate::heap2::PhaseAllocator::try_alloc_slice_copy(&self.$field, slice)
            }

            #[inline]
            fn alloc_slice_copy<T: Copy>(self, slice: &[T]) -> &$alloc mut [T] {
                $crate::heap2::PhaseAllocator::alloc_slice_copy(&self.$field, slice)
            }

            #[inline]
            fn try_alloc_slice_clone<T: Clone>(
                self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                $crate::heap2::PhaseAllocator::try_alloc_slice_clone(&self.$field, slice)
            }

            #[inline]
            fn alloc_slice_clone<T: Clone>(self, slice: &[T]) -> &$alloc mut [T] {
                $crate::heap2::PhaseAllocator::alloc_slice_clone(&self.$field, slice)
            }
        }
    };
}

macro_rules! delegate_reset_allocator {
    ($wrapper:ty, $field:tt $(, [$($generics:tt)+])? $(,)?) => {
        // SAFETY: Reset uses the inner allocator's reset contract.
        unsafe impl $(<$($generics)+>)? $crate::heap2::ResetAllocator for $wrapper {
            #[inline]
            fn reset(&mut self) {
                $crate::heap2::ResetAllocator::reset(&mut self.$field);
            }
        }
    };
}

macro_rules! delegate_scope_allocator {
    ($alloc:lifetime, $wrapper:ty, $field:tt, $inner:ty $(,)?) => {
        // SAFETY: The selected arena supplies the allocations for the same lifetime, and both scope
        // methods run the callback inside a scope of that arena.
        unsafe impl<$alloc> $crate::heap2::ScopeAllocator<$alloc> for $wrapper {
            type Scoped<'scope> = <$inner as $crate::heap2::ScopeAllocator<$alloc>>::Scoped<'scope>;

            #[inline]
            unsafe fn try_alloc_with_unchecked<T>(
                this: &Self,
                value: impl FnOnce() -> T,
            ) -> Result<&$alloc mut T, ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner arena.
                unsafe {
                    $crate::heap2::ScopeAllocator::try_alloc_with_unchecked(&this.$field, value)
                }
            }

            #[inline]
            unsafe fn try_alloc_slice_uninit_unchecked<T>(
                this: &Self,
                len: usize,
            ) -> Result<&$alloc mut [::core::mem::MaybeUninit<T>], ::core::alloc::AllocError> {
                // SAFETY: The caller upholds the same requirements for the inner arena.
                unsafe {
                    $crate::heap2::ScopeAllocator::try_alloc_slice_uninit_unchecked(
                        &this.$field,
                        len,
                    )
                }
            }

            #[inline]
            fn try_alloc_slice_copy<T: Copy>(
                this: &Self,
                slice: &[T],
            ) -> Result<&$alloc mut [T], ::core::alloc::AllocError> {
                $crate::heap2::ScopeAllocator::try_alloc_slice_copy(&this.$field, slice)
            }

            #[inline]
            fn scoped<T>(
                &mut self,
                func: impl FnOnce($crate::heap2::Scoped<'_, $alloc, Self>) -> T,
            ) -> T {
                $crate::heap2::ScopeAllocator::scoped(&mut self.$field, |scope| {
                    func(scope.rebind())
                })
            }

            #[inline]
            fn scoped_ref<T>(
                &self,
                func: impl FnOnce($crate::heap2::Scoped<'_, $alloc, Self>) -> T,
            ) -> T {
                $crate::heap2::ScopeAllocator::scoped_ref(&self.$field, |scope| {
                    func(scope.rebind())
                })
            }
        }
    };
}

macro_rules! delegate_symbol_allocator {
    ($alloc:lifetime, $wrapper:ty, $field:tt $(,)?) => {
        // SAFETY: The selected allocator supplies the symbols for the same lifetime.
        unsafe impl<$alloc> $crate::heap2::SymbolAllocator<$alloc> for $wrapper {
            #[inline]
            fn try_alloc_symbol(
                self,
                name: &str,
            ) -> Result<$crate::symbol::Symbol<$alloc>, ::core::alloc::AllocError> {
                $crate::heap2::SymbolAllocator::try_alloc_symbol(&self.$field, name)
            }

            #[inline]
            fn alloc_symbol(self, name: &str) -> $crate::symbol::Symbol<$alloc> {
                $crate::heap2::SymbolAllocator::alloc_symbol(&self.$field, name)
            }
        }
    };
}

pub(super) use delegate_allocator;
pub(super) use delegate_phase_allocator;
pub(super) use delegate_reset_allocator;
pub(super) use delegate_scope_allocator;
pub(super) use delegate_symbol_allocator;
