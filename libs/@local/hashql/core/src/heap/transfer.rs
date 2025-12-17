use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    ptr, slice,
};

pub unsafe trait TryTransferInto<A: Allocator> {
    type Output;

    fn try_transfer_into(&self, allocator: A) -> Result<Self::Output, AllocError>;
}

pub trait TransferInto<A: Allocator> {
    type Output;

    fn transfer_into(&self, allocator: A) -> Self::Output;
}

impl<T, A: Allocator> TransferInto<A> for T
where
    T: ?Sized + TryTransferInto<A>,
{
    type Output = T::Output;

    #[inline]
    fn transfer_into(&self, allocator: A) -> Self::Output {
        match self.try_transfer_into(allocator) {
            Ok(output) => output,
            Err(_) => handle_alloc_error(Layout::for_value::<T>(self)),
        }
    }
}

unsafe impl<'alloc, T: Copy + 'alloc, A: Allocator> TryTransferInto<&'alloc A> for [T] {
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        let layout = Layout::for_value(self);
        let dst = allocator.allocate(layout)?.cast::<T>();

        let result = unsafe {
            ptr::copy_nonoverlapping(self.as_ptr(), dst.as_ptr(), self.len());
            slice::from_raw_parts_mut(dst.as_ptr(), self.len())
        };

        Ok(result)
    }
}

unsafe impl<'alloc, A: Allocator> TryTransferInto<&'alloc A> for str {
    type Output = &'alloc mut Self;

    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        let bytes = self.as_bytes().try_transfer_into(allocator)?;

        Ok(unsafe { core::str::from_utf8_unchecked_mut(bytes) })
    }
}
