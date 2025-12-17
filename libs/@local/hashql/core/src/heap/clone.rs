use alloc::alloc::handle_alloc_error;
use core::alloc::{AllocError, Allocator, Layout};

pub trait TryCloneIn<A: Allocator>: Sized {
    type Cloned;

    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError>;

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, allocator: A) -> Result<(), AllocError> {
        *into = self.try_clone_in(allocator)?;
        Ok(())
    }
}

pub trait CloneIn<A: Allocator>: Sized {
    type Cloned;

    fn clone_in(&self, allocator: A) -> Self::Cloned;

    #[inline]
    fn clone_into(&self, into: &mut Self::Cloned, allocator: A) {
        *into = self.clone_in(allocator);
    }
}

impl<T, A: Allocator> CloneIn<A> for T
where
    T: TryCloneIn<A>,
{
    type Cloned = T::Cloned;

    #[inline]
    fn clone_in(&self, allocator: A) -> Self::Cloned {
        match self.try_clone_in(allocator) {
            Ok(cloned) => cloned,
            Err(_) => handle_alloc_error(Layout::for_value::<T>(self)),
        }
    }

    #[inline]
    fn clone_into(&self, into: &mut Self::Cloned, allocator: A) {
        match self.try_clone_into(into, allocator) {
            Ok(()) => (),
            Err(_) => handle_alloc_error(Layout::for_value::<T>(self)),
        }
    }
}

macro_rules! impl_clone_in {
    ($($ty:ty),*) => {
        $(
            impl<A: Allocator> TryCloneIn<A> for $ty {
                type Cloned = $ty;

                fn try_clone_in(&self, _allocator: A) -> Result<Self::Cloned, AllocError> {
                    Ok(*self)
                }
            }
        )*
    };
}

impl_clone_in!(
    u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, usize, isize, bool, char
);

impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Vec<T, B> {
    type Cloned = Vec<T, A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        let mut dst =
            Vec::try_with_capacity_in(self.capacity(), allocator).map_err(|_err| AllocError)?;
        dst.extend_from_slice(self);
        Ok(dst)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        into.clone_from_slice(self);
        Ok(())
    }
}

impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<T, B> {
    type Cloned = Box<T, A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }
}

impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<[T], B> {
    type Cloned = Box<[T], A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }
}
