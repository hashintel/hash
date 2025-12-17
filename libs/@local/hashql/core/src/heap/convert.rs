//! Allocator-aware conversion traits.

use core::alloc::Allocator;

use super::CloneIn as _;

/// Construct a value of type `Self` from `T` using the provided allocator.
///
/// Allocator-aware equivalent of [`From`].
pub trait FromIn<T, A: Allocator>: Sized {
    /// Performs the conversion, allocating in `allocator` if needed.
    fn from_in(value: T, allocator: A) -> Self;
}

/// Convert `self` into type `T` using the provided allocator.
///
/// Allocator-aware equivalent of [`Into`]. Prefer implementing [`FromIn`] instead;
/// this trait has a blanket implementation for all types where the target implements
/// `FromIn`.
pub trait IntoIn<T, A: Allocator>: Sized {
    /// Performs the conversion, allocating in `allocator` if needed.
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

impl<T, A: Allocator> FromIn<T, A> for Box<T, A> {
    fn from_in(value: T, allocator: A) -> Self {
        Self::new_in(value, allocator)
    }
}

impl<A: Allocator> FromIn<String, A> for Box<str, A> {
    fn from_in(value: String, allocator: A) -> Self {
        // This is the same `as_boxed_str`, but with custom allocator support.
        let bytes = value.into_bytes().clone_in(allocator).into_boxed_slice();

        // This is the same as `from_boxed_utf8_unchecked` but with a custom allocator.
        let (ptr, alloc) = Box::into_raw_with_allocator(bytes);

        // SAFETY: The bytes are guaranteed to be valid UTF-8 because they come from a String.
        unsafe { Self::from_raw_in(ptr as *mut str, alloc) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::heap::Heap;

    #[test]
    fn reflexive() {
        let heap = Heap::new();

        let result: u32 = u32::from_in(42, &heap);
        assert_eq!(result, 42);

        let result: u32 = 42_u32.into_in(&heap);
        assert_eq!(result, 42);
    }

    #[test]
    fn value_into_box() {
        let heap = Heap::new();

        let boxed: Box<i64, &Heap> = 123_i64.into_in(&heap);
        assert_eq!(*boxed, 123);

        let boxed: Box<i64, &Heap> = Box::from_in(456, &heap);
        assert_eq!(*boxed, 456);
    }

    #[test]
    fn string_into_boxed_str() {
        let heap = Heap::new();

        let boxed: Box<str, &Heap> = String::from("hello").into_in(&heap);
        assert_eq!(&*boxed, "hello");
    }

    #[expect(clippy::non_ascii_literal)]
    #[test]
    fn string_into_boxed_str_unicode() {
        let heap = Heap::new();

        let boxed: Box<str, &Heap> = String::from("日本語 🎉").into_in(&heap);
        assert_eq!(&*boxed, "日本語 🎉");
    }

    #[test]
    fn string_into_boxed_str_empty() {
        let heap = Heap::new();

        let boxed: Box<str, &Heap> = String::from("foo").into_in(&heap);
        assert_eq!(&*boxed, "foo");
    }
}
