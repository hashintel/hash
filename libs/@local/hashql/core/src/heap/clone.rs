//! Allocator-aware cloning traits.
#![expect(clippy::option_if_let_else)]

use alloc::alloc::handle_alloc_error;
use core::alloc::{AllocError, Allocator, Layout};

/// Fallibly clones a value into a specified allocator.
///
/// Allocator-aware equivalent of [`Clone`], allowing the caller to specify
/// which allocator the cloned value should use.
pub trait TryCloneIn<A: Allocator>: Sized {
    /// The resulting type after cloning. May differ from `Self` when the clone
    /// uses a different allocator type.
    type Cloned;

    /// Attempts to clone `self` into the given allocator.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if allocation fails.
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError>;

    /// Attempts to clone `self` into an existing destination.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if allocation fails.
    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, allocator: A) -> Result<(), AllocError> {
        *into = self.try_clone_in(allocator)?;
        Ok(())
    }
}

/// Infallibly clones a value into a specified allocator.
///
/// Allocator-aware equivalent of [`Clone`]. Panics on allocation failure
/// via [`handle_alloc_error`].
pub trait CloneIn<A: Allocator>: Sized {
    /// The resulting type after cloning.
    type Cloned;

    /// Clones `self` into the given allocator.
    fn clone_in(&self, allocator: A) -> Self::Cloned;

    /// Clones `self` into an existing destination.
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
        let cloned = <[T]>::to_vec_in(self, allocator);
        Ok(cloned)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        into.clear();
        into.extend_from_slice(self);
        Ok(())
    }
}

impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<T, B> {
    type Cloned = Box<T, A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        T::clone_from(into, self);
        Ok(())
    }
}

impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<[T], B> {
    type Cloned = Box<[T], A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, allocator: A) -> Result<(), AllocError> {
        if into.len() == self.len() {
            into.clone_from_slice(self);
            return Ok(());
        }

        *into = self.try_clone_in(allocator)?;
        Ok(())
    }
}
