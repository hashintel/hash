//! Allocator-aware conversion traits.

use alloc::rc::Rc;
use core::alloc::Allocator;

use super::CollectIn as _;

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
        let bytes: Vec<u8, A> = value.into_bytes().into_iter().collect_in(allocator);

        // This is the same as `from_boxed_utf8_unchecked` but with a custom allocator.
        let (ptr, alloc) = Box::into_raw_with_allocator(bytes.into_boxed_slice());

        // SAFETY: The bytes are guaranteed to be valid UTF-8 because they come from a String.
        unsafe { Self::from_raw_in(ptr as *mut str, alloc) }
    }
}

impl<A: Allocator> FromIn<&str, A> for Rc<str, A> {
    #[inline]
    fn from_in(value: &str, allocator: A) -> Self {
        // This is very much the same as Rc::from(), but without the specialization
        let mut slice = Rc::new_uninit_slice_in(value.len(), allocator);

        // SAFETY: We have just created the slice, so we're guaranteed to have exclusive access.
        let slice_ref = unsafe { Rc::get_mut_unchecked(&mut slice) };
        slice_ref.write_copy_of_slice(value.as_bytes());

        // SAFETY: We have just written to the slice, so we're guaranteed to have initialized it.
        let slice = unsafe { slice.assume_init() };

        let (ptr, alloc) = Rc::into_raw_with_allocator(slice);

        // SAFETY: str has the same layout as `[u8]`, so this is safe.
        unsafe { Self::from_raw_in(ptr as *const str, alloc) }
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

    #[test]
    fn str_into_rc_str() {
        let heap = Heap::new();

        let rc: Rc<str, &Heap> = "hello".into_in(&heap);
        assert_eq!(&*rc, "hello");

        let rc: Rc<str, &Heap> = Rc::from_in("world", &heap);
        assert_eq!(&*rc, "world");
    }

    #[expect(clippy::non_ascii_literal)]
    #[test]
    fn str_into_rc_str_unicode() {
        let heap = Heap::new();

        let rc: Rc<str, &Heap> = "日本語 🎉".into_in(&heap);
        assert_eq!(&*rc, "日本語 🎉");
    }

    #[test]
    fn str_into_rc_str_empty() {
        let heap = Heap::new();

        let rc: Rc<str, &Heap> = "".into_in(&heap);
        assert_eq!(&*rc, "");
        assert_eq!(rc.len(), 0);
    }

    #[test]
    fn rc_str_clone_shares_data() {
        let heap = Heap::new();

        let rc1: Rc<str, &Heap> = "shared".into_in(&heap);
        let rc2 = Rc::clone(&rc1);

        assert_eq!(&*rc1, "shared");
        assert_eq!(&*rc2, "shared");
        assert!(Rc::ptr_eq(&rc1, &rc2));
    }
}
