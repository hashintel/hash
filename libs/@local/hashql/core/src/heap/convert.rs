//! Allocator-aware conversion traits.

use core::alloc::Allocator;

/// Construct a value of type `Self` from `T` using the provided allocator.
///
/// Allocator-aware equivalent of [`From`].
pub trait FromIn<T, A: Allocator>: Sized {
    fn from_in(value: T, allocator: A) -> Self;
}

/// Convert `self` into type `T` using the provided allocator.
///
/// Allocator-aware equivalent of [`Into`]. Prefer implementing [`FromIn`] instead.
pub trait IntoIn<T, A: Allocator>: Sized {
    fn into_in(self, allocator: A) -> T;
}

impl<T, A: Allocator> FromIn<T, A> for T {
    fn from_in(value: T, _: A) -> Self {
        value
    }
}

impl<T, U, A: Allocator> IntoIn<U, A> for T
where
    U: FromIn<T, A>,
{
    fn into_in(self, allocator: A) -> U {
        U::from_in(self, allocator)
    }
}

impl<T, A: Allocator> FromIn<T, A> for Box<T, A> {
    fn from_in(value: T, allocator: A) -> Self {
        Box::new_in(value, allocator)
    }
}
