use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, AllocatorClone, AllocatorNightly, Layout},
    marker::Destruct,
    mem,
};

/// A shared reference to an allocator.
///
/// Every `&A` whose `A` is an [`Allocator`] implements this trait, and no other type can. The
/// traits of this module that take `self` by value have it as their supertrait. An implementor of
/// one of them is therefore a reference, and every copy of it allocates from the same allocator,
/// which is the guarantee of [`AllocatorClone`].
pub impl(self) trait AllocatorPointer:
    Allocator + AllocatorClone + AllocatorNightly + Copy
{
}

impl<A> AllocatorPointer for &A where A: Allocator + ?Sized {}

/// An arena allocator whose allocations live for `'alloc`.
///
/// This is phase-oriented allocation: a program allocates a group of values during one phase and
/// releases them together when the phase ends. The arena releases its memory without running
/// destructors. The safe methods of this trait compile only for a `T` for which [`mem::needs_drop`]
/// returns `false`. To keep a value with a destructor in the arena, put it in a collection that
/// allocates from this allocator, such as a [`Box`] or a [`Vec`]. The collection drops the value
/// itself.
///
/// The references these methods return live for `'alloc`, which is a parameter of the trait. They
/// do not borrow the allocator. An earlier allocation stays usable while you allocate more, open a
/// [scope] or hand the allocator to another function.
///
/// A `PhaseAllocator` is an [`AllocatorPointer`], a shared reference to the type that holds the
/// arena. Pass it by value, as you would pass any shared reference. Every copy allocates from the
/// same arena.
///
/// # Safety
///
/// Implementors must ensure that the memory behind every reference a method of this trait returns:
///
/// - stays allocated at the same address for all of `'alloc`
/// - is not handed out again during `'alloc` by any allocator of the same arena
///
/// Both conditions must hold whatever safe code does with the allocator in the meantime, which
/// includes dropping it.
///
/// A returned slice must have exactly the requested length.
///
/// [scope]: super::ScopeAllocator
pub const unsafe trait PhaseAllocator<'alloc>: AllocatorPointer {
    /// Allocates the result of calling `value`, without checking that `T` needs no destructor.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// # Safety
    ///
    /// [`mem::needs_drop`] must return `false` for `T`. The arena releases the value without
    /// running its destructor.
    unsafe fn try_alloc_with_unchecked<T>(
        self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc mut T, AllocError>;

    /// Allocates the result of calling `value`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    #[inline]
    fn try_alloc_with<T>(
        self,
        value: impl [const] FnOnce() -> T + [const] Destruct,
    ) -> Result<&'alloc mut T, AllocError> {
        const { assert!(!mem::needs_drop::<T>()) };
        // SAFETY: The assertion above compiles only if `mem::needs_drop::<T>()` is `false`.
        unsafe { self.try_alloc_with_unchecked(value) }
    }

    /// Moves `value` into the arena.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    #[inline]
    fn try_alloc<T>(self, value: T) -> Result<&'alloc mut T, AllocError>
    where
        T: [const] Destruct,
    {
        const { assert!(!mem::needs_drop::<T>()) };
        // SAFETY: The assertion above compiles only if `mem::needs_drop::<T>()` is `false`.
        unsafe { self.try_alloc_with_unchecked(const || value) }
    }

    /// Allocates the result of calling `value`.
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_alloc_with`] to handle that failure yourself.
    ///
    /// [`try_alloc_with`]: Self::try_alloc_with
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc_with<T>(self, value: impl [const] FnOnce() -> T + [const] Destruct) -> &'alloc mut T {
        match self.try_alloc_with(value) {
            Ok(value) => value,
            Err(_) => {
                let layout = Layout::new::<T>();
                handle_alloc_error(layout)
            }
        }
    }

    /// Moves `value` into the arena.
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use [`try_alloc`]
    /// to handle that failure yourself.
    ///
    /// [`try_alloc`]: Self::try_alloc
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc<T>(self, value: T) -> &'alloc mut T
    where
        T: [const] Destruct,
    {
        match self.try_alloc(value) {
            Ok(value) => value,
            Err(_) => {
                let layout = Layout::new::<T>();
                handle_alloc_error(layout)
            }
        }
    }

    /// Allocates `len` uninitialized values, without checking that `T` needs no destructor.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// # Safety
    ///
    /// [`mem::needs_drop`] must return `false` for `T`. The arena releases the values without
    /// running their destructors.
    unsafe fn try_alloc_slice_uninit_unchecked<T>(
        self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError>;

    /// Allocates a slice of `len` uninitialized values.
    ///
    /// Use this to build a slice one element at a time, for example from an iterator. To copy a
    /// slice that already exists, use [`try_alloc_slice_copy`].
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// [`try_alloc_slice_copy`]: Self::try_alloc_slice_copy
    #[inline]
    fn try_alloc_slice_uninit<T>(
        self,
        len: usize,
    ) -> Result<&'alloc mut [mem::MaybeUninit<T>], AllocError> {
        const { assert!(!mem::needs_drop::<T>()) };
        // SAFETY: The assertion above compiles only if `mem::needs_drop::<T>()` is `false`.
        unsafe { self.try_alloc_slice_uninit_unchecked(len) }
    }

    /// Allocates a slice of `len` uninitialized values.
    ///
    /// Use this to build a slice one element at a time, for example from an iterator. To copy a
    /// slice that already exists, use [`alloc_slice_copy`].
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_alloc_slice_uninit`] to handle that failure yourself.
    ///
    /// # Panics
    ///
    /// Panics if a slice of `len` values of `T` would take more than [`isize::MAX`] bytes.
    /// [`try_alloc_slice_uninit`] returns an error in that case.
    ///
    /// [`alloc_slice_copy`]: Self::alloc_slice_copy
    /// [`try_alloc_slice_uninit`]: Self::try_alloc_slice_uninit
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc_slice_uninit<T>(self, len: usize) -> &'alloc mut [mem::MaybeUninit<T>] {
        match self.try_alloc_slice_uninit(len) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<mem::MaybeUninit<T>>(len) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }

    /// Copies `slice` into the arena.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    fn try_alloc_slice_copy<T>(self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: Copy;

    /// Copies `slice` into the arena.
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_alloc_slice_copy`] to handle that failure yourself.
    ///
    /// [`try_alloc_slice_copy`]: Self::try_alloc_slice_copy
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc_slice_copy<T>(self, slice: &[T]) -> &'alloc mut [T]
    where
        T: Copy,
    {
        match self.try_alloc_slice_copy(slice) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<T>(slice.len()) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }

    /// Clones every element of `slice` into the arena.
    ///
    /// If `T` is [`Copy`], use [`try_alloc_slice_copy`], which copies the bytes of the slice and
    /// calls [`Clone::clone`] for no element.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the arena cannot provide the memory.
    ///
    /// [`try_alloc_slice_copy`]: Self::try_alloc_slice_copy
    #[inline]
    fn try_alloc_slice_clone<T>(self, slice: &[T]) -> Result<&'alloc mut [T], AllocError>
    where
        T: [const] Clone,
    {
        let uninit = match self.try_alloc_slice_uninit::<T>(slice.len()) {
            Ok(uninit) => uninit,
            Err(error) => return Err(error),
        };

        let mut index = 0;
        while index < slice.len() {
            uninit[index].write(slice[index].clone());
            index += 1;
        }

        // SAFETY: `uninit` and `slice` have the same length, and the loop above wrote every element
        // of `uninit`.
        Ok(unsafe { uninit.assume_init_mut() })
    }

    /// Clones every element of `slice` into the arena.
    ///
    /// If `T` is [`Copy`], use [`alloc_slice_copy`], which copies the bytes of the slice and calls
    /// [`Clone::clone`] for no element.
    ///
    /// If the arena cannot provide the memory, this calls [`handle_alloc_error`]. Use
    /// [`try_alloc_slice_clone`] to handle that failure yourself.
    ///
    /// [`alloc_slice_copy`]: Self::alloc_slice_copy
    /// [`try_alloc_slice_clone`]: Self::try_alloc_slice_clone
    #[expect(clippy::single_match_else, reason = "clarity")]
    #[inline]
    fn alloc_slice_clone<T>(self, slice: &[T]) -> &'alloc mut [T]
    where
        T: [const] Clone,
    {
        match self.try_alloc_slice_clone(slice) {
            Ok(slice) => slice,
            Err(_) => {
                let Ok(layout) = Layout::array::<T>(slice.len()) else {
                    panic!("stack overflow");
                };

                handle_alloc_error(layout)
            }
        }
    }
}
