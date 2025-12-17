use std::alloc::Allocator;

pub trait FromIn<T, A: Allocator>: Sized {
    fn from_in(value: T, allocator: A) -> Self;
}
pub trait IntoIn<T, A: Allocator>: Sized {
    fn into_in(self, allocator: A) -> T;
}

// FromIn is reflexive
impl<T, A: Allocator> FromIn<T, A> for T {
    fn from_in(value: T, _: A) -> Self {
        value
    }
}

// FromIn<T, A> for U implies IntoIn<U, A> for T
impl<T, U, A: Allocator> IntoIn<U, A> for T
where
    U: FromIn<T, A>,
{
    fn into_in(self, allocator: A) -> U {
        U::from_in(self, allocator)
    }
}
