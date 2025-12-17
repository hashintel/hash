//! Clone operations with custom allocators.
//!
//! This module provides traits for cloning values into a specified allocator,
//! analogous to [`Clone`] but with explicit allocator control. This is essential
//! for arena-based memory management where cloned data must live in a specific
//! memory region.
//!
//! # Trait Hierarchy
//!
//! ```text
//! TryCloneIn<A>          CloneIn<A>
//!     │                      │
//!     │  (fallible)          │  (infallible, panics on OOM)
//!     │                      │
//!     └──────────────────────┘
//!            blanket impl: CloneIn for T where T: TryCloneIn
//! ```
//!
//! # Difference from [`Clone`]
//!
//! - [`Clone`]: Uses the global allocator implicitly
//! - [`CloneIn`]/[`TryCloneIn`]: Allocates in a caller-specified allocator
//!
//! This distinction is critical for arena allocators where all related data
//! must reside in the same memory region for bulk deallocation.
#![expect(clippy::option_if_let_else)]

use alloc::alloc::handle_alloc_error;
use core::alloc::{AllocError, Allocator, Layout};

/// Fallibly clones a value into a specified allocator.
///
/// This trait enables cloning values into arena or custom allocators, returning
/// an error if allocation fails rather than panicking.
///
/// # Type Parameters
///
/// - `A`: The allocator type to clone into
///
/// # Associated Types
///
/// - `Cloned`: The resulting type after cloning. This may differ from `Self` if the clone changes
///   the allocator type parameter (e.g., `Vec<T, Global>` → `Vec<T, &'heap Heap>`).
pub trait TryCloneIn<A: Allocator>: Sized {
    /// The type produced by cloning into allocator `A`.
    type Cloned;

    /// Attempts to clone `self` into the given allocator.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the allocator cannot fulfill the allocation request.
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError>;

    /// Attempts to clone `self` into an existing destination.
    ///
    /// This can be more efficient than [`try_clone_in`](Self::try_clone_in) when
    /// the destination already has allocated capacity.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if allocation fails during the clone operation.
    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, allocator: A) -> Result<(), AllocError> {
        *into = self.try_clone_in(allocator)?;
        Ok(())
    }
}

/// Infallibly clones a value into a specified allocator.
///
/// This is the infallible counterpart to [`TryCloneIn`]. On allocation failure,
/// it invokes the global allocation error handler (typically aborting the process).
///
/// A blanket implementation exists for all types implementing [`TryCloneIn`].
///
/// # Panics
///
/// Panics (or aborts) if the underlying allocation fails, via [`handle_alloc_error`].
pub trait CloneIn<A: Allocator>: Sized {
    /// The type produced by cloning into allocator `A`.
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

/// Implements [`TryCloneIn`] for primitive `Copy` types.
///
/// These types require no allocation to clone - they are simply copied by value.
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

impl<A: Allocator> TryCloneIn<A> for ! {
    type Cloned = Self;

    fn try_clone_in(&self, _allocator: A) -> Result<Self::Cloned, AllocError> {
        *self
    }
}

/// Clones a [`Vec`] into a different allocator.
///
/// The cloned vector has the same capacity and contents as the original,
/// but uses the target allocator for its backing storage.
impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Vec<T, B> {
    type Cloned = Vec<T, A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        let mut dst =
            Vec::try_with_capacity_in(self.capacity(), allocator).map_err(|_err| AllocError)?;
        dst.extend_from_slice(self);
        Ok(dst)
    }

    #[inline]
    fn try_clone_into(&self, into: &mut Self::Cloned, _: A) -> Result<(), AllocError> {
        into.clone_from_slice(self);
        Ok(())
    }
}

/// Clones a [`Box`] into a different allocator.
impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<T, B> {
    type Cloned = Box<T, A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }
}

/// Clones a boxed slice into a different allocator.
impl<T: Clone, A: Allocator, B: Allocator> TryCloneIn<A> for Box<[T], B> {
    type Cloned = Box<[T], A>;

    #[inline]
    fn try_clone_in(&self, allocator: A) -> Result<Self::Cloned, AllocError> {
        Box::try_clone_from_ref_in(self, allocator)
    }
}
