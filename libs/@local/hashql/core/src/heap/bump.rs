#![expect(clippy::mut_from_ref, reason = "allocator")]
use core::alloc::{AllocError, Allocator};

pub trait BumpAllocator: Allocator {
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError>;

    fn reset(&mut self);
}

impl<A> BumpAllocator for &mut A
where
    A: BumpAllocator,
{
    #[inline]
    fn allocate_slice_copy<T: Copy>(&self, slice: &[T]) -> Result<&mut [T], AllocError> {
        A::allocate_slice_copy(self, slice)
    }

    #[inline]
    fn reset(&mut self) {
        A::reset(self);
    }
}
