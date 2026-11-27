use alloc::{boxed::Box, rc::Rc};
use core::alloc::Allocator;

/// [`From`] with an allocator argument.
///
/// Implement it for the target of a conversion that allocates. Every implementation provides the
/// matching [`IntoIn`].
///
/// # Example
///
/// ```
/// use hashql_core::heap::{FromIn as _, IntoIn as _, Scratch};
///
/// let scratch = Scratch::new();
///
/// let boxed = Box::<str, &Scratch>::from_in("total price", &scratch);
/// let number: Box<u32, &Scratch> = 3_u32.into_in(&scratch);
///
/// assert_eq!(&*boxed, "total price");
/// assert_eq!(*number, 3);
/// ```
pub trait FromIn<T, A: Allocator>: Sized {
    /// Converts `value` into `Self`.
    ///
    /// A conversion that allocates takes the memory from `alloc`.
    fn from_in(value: T, alloc: A) -> Self;
}

/// [`Into`] with an allocator argument.
///
/// `T` implements `IntoIn<U, A>` whenever `U` implements `FromIn<T, A>`. Implement [`FromIn`], and
/// call `into_in` on the source of a conversion.
pub trait IntoIn<T, A: Allocator>: Sized {
    /// Converts `self` into a `T`.
    ///
    /// A conversion that allocates takes the memory from `alloc`.
    fn into_in(self, alloc: A) -> T;
}

impl<T, A: Allocator> FromIn<T, A> for T {
    #[inline]
    fn from_in(value: T, _: A) -> Self {
        value
    }
}

impl<T, U, A: Allocator> IntoIn<U, A> for T
where
    U: FromIn<T, A>,
{
    #[inline]
    fn into_in(self, alloc: A) -> U {
        U::from_in(self, alloc)
    }
}

impl<T, A: Allocator> FromIn<T, A> for Box<T, A> {
    #[inline]
    fn from_in(value: T, alloc: A) -> Self {
        Self::new_in(value, alloc)
    }
}

impl<A: Allocator> FromIn<&str, A> for Box<str, A> {
    #[inline]
    fn from_in(value: &str, alloc: A) -> Self {
        Self::clone_from_ref_in(value, alloc)
    }
}

impl<A: Allocator> FromIn<&str, A> for Rc<str, A> {
    #[inline]
    fn from_in(value: &str, alloc: A) -> Self {
        Self::clone_from_ref_in(value, alloc)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{boxed::Box, rc::Rc};

    use super::{FromIn as _, IntoIn as _};
    use crate::heap::Scratch;

    #[test]
    fn reflexive() {
        let scratch = Scratch::new();

        let value: u32 = 42_u32.into_in(&scratch);

        assert_eq!(value, 42);
    }

    #[test]
    fn value_into_box() {
        let scratch = Scratch::new();

        let boxed: Box<u64, &Scratch> = 7_u64.into_in(&scratch);

        assert_eq!(*boxed, 7);
    }

    #[test]
    fn str_into_box() {
        let scratch = Scratch::new();

        let boxed: Box<str, &Scratch> = "caf\u{e9}".into_in(&scratch);
        let empty = Box::<str, _>::from_in("", &scratch);

        assert_eq!((&*boxed, &*empty), ("caf\u{e9}", ""));
    }

    #[test]
    fn str_into_rc() {
        let scratch = Scratch::new();

        let shared: Rc<str, &Scratch> = "caf\u{e9}".into_in(&scratch);
        let again = Rc::clone(&shared);
        let empty = Rc::<str, _>::from_in("", &scratch);

        assert_eq!((&*shared, &*again, &*empty), ("caf\u{e9}", "caf\u{e9}", ""));
    }
}
