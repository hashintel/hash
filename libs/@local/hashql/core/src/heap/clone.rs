use alloc::{alloc::handle_alloc_error, boxed::Box, vec::Vec};
use core::alloc::{AllocError, Allocator, Layout};

/// [`Clone`] with an allocator argument.
///
/// The clone allocates in the allocator you pass, and its type can differ from the type of the
/// original in the allocator parameter: a `Vec<T, B>` clones into a `Vec<T, A>`.
///
/// # Implementation Note
///
/// Implement [`try_clone_in`]. The other methods have default bodies that call it. Override
/// [`try_clone_into`] where the clone can reuse the memory of its target.
///
/// # Example
///
/// ```
/// use hashql_core::heap::{CloneIn as _, Scratch};
///
/// let scratch = Scratch::new();
/// let source = vec![1_u32, 2, 3];
///
/// let cloned: Vec<u32, &Scratch> = source.clone_in(&scratch);
///
/// assert_eq!(cloned, source);
/// ```
///
/// [`try_clone_in`]: Self::try_clone_in
/// [`try_clone_into`]: Self::try_clone_into
pub trait CloneIn<A: Allocator> {
    /// The type of the clone.
    type Cloned;

    /// Clones `self` into `alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if `alloc` cannot provide the memory.
    fn try_clone_in(&self, alloc: A) -> Result<Self::Cloned, AllocError>;

    /// Clones `self` into `alloc`.
    ///
    /// If `alloc` cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_clone_in`] to handle that failure yourself.
    ///
    /// [`try_clone_in`]: Self::try_clone_in
    #[expect(
        clippy::single_match_else,
        clippy::option_if_let_else,
        reason = "clarity"
    )]
    #[inline]
    fn clone_in(&self, alloc: A) -> Self::Cloned {
        match self.try_clone_in(alloc) {
            Ok(cloned) => cloned,
            Err(_) => {
                let layout = Layout::for_value(self);
                handle_alloc_error(layout)
            }
        }
    }

    /// Replaces `target` with a clone of `self`.
    ///
    /// The clone reuses the memory of `target` where the implementation can. New memory comes from
    /// the allocator of `target`, or from `alloc` when the clone replaces `target` as a whole.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the allocator cannot provide the memory.
    #[inline]
    fn try_clone_into(&self, target: &mut Self::Cloned, alloc: A) -> Result<(), AllocError> {
        *target = self.try_clone_in(alloc)?;

        Ok(())
    }

    /// Replaces `target` with a clone of `self`.
    ///
    /// If the allocator cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_clone_into`] to handle that failure yourself.
    ///
    /// [`try_clone_into`]: Self::try_clone_into
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn clone_into(&self, target: &mut Self::Cloned, alloc: A) {
        match self.try_clone_into(target, alloc) {
            Ok(()) => {}
            Err(_) => {
                let layout = Layout::for_value(self);
                handle_alloc_error(layout)
            }
        }
    }
}

macro_rules! impl_clone_in_for_copy {
    ($($ty:ty),* $(,)?) => {
        $(
            impl<A: Allocator> CloneIn<A> for $ty {
                type Cloned = Self;

                #[inline]
                fn try_clone_in(&self, _: A) -> Result<Self, AllocError> {
                    Ok(*self)
                }
            }
        )*
    };
}

impl_clone_in_for_copy!(
    u8, u16, u32, u64, u128, usize, i8, i16, i32, i64, i128, isize, bool, char
);

impl<T, A: Allocator, B: Allocator> CloneIn<A> for Vec<T, B>
where
    T: Clone,
{
    type Cloned = Vec<T, A>;

    #[inline]
    fn try_clone_in(&self, alloc: A) -> Result<Self::Cloned, AllocError> {
        let mut cloned =
            Vec::try_with_capacity_in(self.len(), alloc).map_err(|_error| AllocError)?;
        cloned.extend_from_slice(self);

        Ok(cloned)
    }

    #[inline]
    fn try_clone_into(&self, target: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        // The elements of `target` beyond `self.len()` have no counterpart to clone from.
        target.truncate(self.len());

        let (overwritten, appended) = self.split_at(target.len());

        target
            .try_reserve(appended.len())
            .map_err(|_error| AllocError)?;

        // `clone_from_slice` lets every element reuse the memory of the element it replaces.
        target.clone_from_slice(overwritten);
        target.extend_from_slice(appended);

        Ok(())
    }
}

impl<T, A: Allocator, B: Allocator> CloneIn<A> for Box<T, B>
where
    T: Clone,
{
    type Cloned = Box<T, A>;

    #[inline]
    fn try_clone_in(&self, alloc: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(&**self, alloc)
    }

    #[inline]
    fn try_clone_into(&self, target: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        T::clone_from(target, self);

        Ok(())
    }
}

impl<T, A: Allocator, B: Allocator> CloneIn<A> for Box<[T], B>
where
    T: Clone,
{
    type Cloned = Box<[T], A>;

    #[inline]
    fn try_clone_in(&self, alloc: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(&**self, alloc)
    }

    #[inline]
    fn try_clone_into(&self, target: &mut Self::Cloned, alloc: A) -> Result<(), AllocError> {
        if target.len() == self.len() {
            target.clone_from_slice(self);
        } else {
            *target = self.try_clone_in(alloc)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use alloc::{alloc::Global, boxed::Box, string::String, vec, vec::Vec};

    use super::CloneIn;
    use crate::heap::Scratch;

    #[test]
    fn vec_into_arena() {
        let scratch = Scratch::new();
        let original = vec![String::from("a"), String::from("b")];

        let cloned: Vec<String, &Scratch> = original.clone_in(&scratch);

        assert_eq!(cloned, original);
    }

    #[test]
    fn vec_into_shorter_target() {
        let scratch = Scratch::new();
        let original = vec![1_u32, 2, 3];
        let mut target = Vec::new_in(&scratch);
        target.push(9_u32);

        CloneIn::clone_into(&original, &mut target, &scratch);

        assert_eq!(target, [1, 2, 3]);
    }

    #[test]
    fn vec_into_longer_target() {
        let original = vec![1_u32];
        let mut target = Vec::with_capacity(16);
        target.extend([7_u32, 8, 9]);
        let capacity = target.capacity();

        CloneIn::clone_into(&original, &mut target, Global);

        assert_eq!((target.as_slice(), target.capacity()), (&[1][..], capacity));
    }

    #[test]
    fn box_into_arena() {
        let scratch = Scratch::new();
        let original = Box::new(String::from("boxed"));

        let cloned: Box<String, &Scratch> = original.clone_in(&scratch);

        assert_eq!(*cloned, *original);
    }

    #[test]
    fn boxed_slice_into_target() {
        let scratch = Scratch::new();
        let original: Box<[u32]> = Box::new([1, 2, 3]);

        let mut same_len: Box<[u32], &Scratch> = original.clone_in(&scratch);
        same_len[0] = 9;
        let buffer = same_len.as_ptr();
        CloneIn::clone_into(&original, &mut same_len, &scratch);

        let mut other_len: Box<[u32], &Scratch> = Box::new_in([0], &scratch);
        CloneIn::clone_into(&original, &mut other_len, &scratch);

        assert_eq!((&*same_len, same_len.as_ptr()), (&[1, 2, 3][..], buffer));
        assert_eq!(&*other_len, [1, 2, 3]);
    }
}
