use alloc::alloc::handle_alloc_error;
use core::alloc::{AllocError, Layout};

use super::PhaseAllocator;

/// Data that an arena can take a copy of.
///
/// `transfer_into` copies a slice or a string into an arena and returns the copy, which lives for
/// `'alloc`. It does for an arena what [`ToOwned`] does for the global allocator: it turns borrowed
/// data into data that the destination keeps. To move a single value into an arena, call
/// [`PhaseAllocator::alloc`].
///
/// A type that holds such data, for example a shared pointer to a slice, can implement this trait
/// with the [`Output`] of the data it holds. Code that is generic over `TransferInto` then accepts
/// the holder wherever it accepts the data.
///
/// [`Output`]: Self::Output
pub trait TransferInto<'alloc, A>
where
    A: PhaseAllocator<'alloc>,
{
    /// The copy in the arena.
    type Output;

    /// Copies `self` into the arena of `alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    fn try_transfer_into(&self, alloc: A) -> Result<Self::Output, AllocError>;

    /// Copies `self` into the arena of `alloc`.
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_transfer_into`] to handle that failure yourself.
    ///
    /// # Implementation Note
    ///
    /// The provided method reports the layout of `self` to [`handle_alloc_error`]. An
    /// implementation that copies other data than `self` must override it and report the layout of
    /// that data.
    ///
    /// [`try_transfer_into`]: Self::try_transfer_into
    #[expect(
        clippy::single_match_else,
        clippy::option_if_let_else,
        reason = "clarity"
    )]
    #[inline]
    fn transfer_into(&self, alloc: A) -> Self::Output {
        match self.try_transfer_into(alloc) {
            Ok(value) => value,
            Err(_) => {
                let layout = Layout::for_value(self);
                handle_alloc_error(layout)
            }
        }
    }
}

impl<'alloc, T, A> TransferInto<'alloc, A> for [T]
where
    T: Copy + 'alloc,
    A: PhaseAllocator<'alloc>,
{
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, alloc: A) -> Result<Self::Output, AllocError> {
        alloc.try_alloc_slice_copy(self)
    }
}

impl<'alloc, A> TransferInto<'alloc, A> for str
where
    A: PhaseAllocator<'alloc>,
{
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, alloc: A) -> Result<Self::Output, AllocError> {
        let bytes = alloc.try_alloc_slice_copy(self.as_bytes())?;

        // SAFETY: `bytes` is a copy of the bytes of `self`, which are valid UTF-8.
        Ok(unsafe { Self::from_utf8_unchecked_mut(bytes) })
    }
}

#[cfg(test)]
mod tests {
    use alloc::rc::Rc;
    use core::alloc::AllocError;

    use super::TransferInto;
    use crate::heap2::{PhaseAllocator, Scratch};

    // Holds the data that it transfers, as a shared pointer does.
    struct Shared<T: ?Sized>(Rc<T>);

    impl<'alloc, T, A> TransferInto<'alloc, A> for Shared<T>
    where
        T: TransferInto<'alloc, A> + ?Sized,
        A: PhaseAllocator<'alloc>,
    {
        type Output = T::Output;

        fn try_transfer_into(&self, alloc: A) -> Result<Self::Output, AllocError> {
            self.0.try_transfer_into(alloc)
        }

        fn transfer_into(&self, alloc: A) -> Self::Output {
            self.0.transfer_into(alloc)
        }
    }

    // Copies `value` into the arena, as an interner does with a value it has not seen before.
    fn keep<'alloc, T, U, A>(alloc: A, value: &T) -> &'alloc U
    where
        T: TransferInto<'alloc, A, Output = &'alloc mut U> + ?Sized,
        U: ?Sized + 'alloc,
        A: PhaseAllocator<'alloc>,
    {
        value.transfer_into(alloc)
    }

    #[test]
    fn transfer_slice() {
        let scratch = Scratch::new();
        let original = [1_u32, 2, 3];

        let copy = original.transfer_into(&scratch);
        copy[0] = 9;

        assert_eq!((copy, original), (&mut [9, 2, 3][..], [1, 2, 3]));
    }

    #[test]
    fn transfer_str() {
        let scratch = Scratch::new();

        assert_eq!("caf\u{e9}".transfer_into(&scratch), "caf\u{e9}");
        assert_eq!("".transfer_into(&scratch), "");
    }

    #[test]
    fn transfer_unsized_generic() {
        let scratch = Scratch::new();

        assert_eq!(keep(&scratch, "name"), "name");
        assert_eq!(keep(&scratch, &[1_u8, 2][..]), [1, 2]);
    }

    #[test]
    fn transfer_through_holder() {
        let scratch = Scratch::new();
        let shared = Shared(Rc::<str>::from("name"));

        let copy: &mut str = shared.transfer_into(&scratch);
        copy.make_ascii_uppercase();

        assert_eq!((&*copy, &*shared.0), ("NAME", "name"));
        assert_eq!(keep(&scratch, &shared), "name");
    }
}
