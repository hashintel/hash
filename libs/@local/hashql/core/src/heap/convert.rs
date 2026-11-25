use alloc::{boxed::Box, rc::Rc, vec::Vec};
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
    /// Converts `value` into `Self`, with the allocations of the result in `alloc`.
    fn from_in(value: T, alloc: A) -> Self;
}

/// [`Into`] with an allocator argument.
///
/// `T` implements `IntoIn<U, A>` whenever `U` implements `FromIn<T, A>`. Implement [`FromIn`], and
/// call `into_in` on the source of a conversion.
pub trait IntoIn<T, A: Allocator>: Sized {
    /// Converts `self` into a `T`, with the allocations of the result in `alloc`.
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
        let mut bytes = Vec::with_capacity_in(value.len(), alloc);
        bytes.extend_from_slice(value.as_bytes());

        let (ptr, alloc) = Box::into_raw_with_allocator(bytes.into_boxed_slice());

        // SAFETY: `ptr` comes from a `Box<[u8], A>` that allocated in `alloc`, and `str` has the
        // layout of `[u8]`. The bytes are a copy of `value`, which is valid UTF-8.
        unsafe { Self::from_raw_in(ptr as *mut str, alloc) }
    }
}

impl<A: Allocator> FromIn<&str, A> for Rc<str, A> {
    #[inline]
    fn from_in(value: &str, alloc: A) -> Self {
        let mut bytes = Rc::new_uninit_slice_in(value.len(), alloc);

        // SAFETY: No other `Rc` or `Weak` points to the allocation of `bytes`: this function
        // created it above and has not cloned it.
        let uninit = unsafe { Rc::get_mut_unchecked(&mut bytes) };
        uninit.write_copy_of_slice(value.as_bytes());

        // SAFETY: The call above initialized every byte of the slice.
        let bytes = unsafe { bytes.assume_init() };

        let (ptr, alloc) = Rc::into_raw_with_allocator(bytes);

        // SAFETY: `ptr` comes from an `Rc<[u8], A>` that allocated in `alloc`, and `str` has the
        // layout of `[u8]`. The bytes are a copy of `value`, which is valid UTF-8.
        unsafe { Self::from_raw_in(ptr as *const str, alloc) }
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
