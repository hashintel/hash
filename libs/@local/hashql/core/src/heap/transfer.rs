//! Zero-copy data transfer into allocators.
//!
//! This module provides traits for transferring data into a target allocator,
//! creating a new allocation and copying the source data. Unlike [`Clone`], which
//! uses the global allocator, these traits allow specifying a custom allocator
//! for the destination.
//!
//! # Lifetime Safety
//!
//! The key safety property of this module is the lifetime binding between the
//! allocator reference and the returned data:
//!
//! ```text
//! fn try_transfer_into(&self, allocator: &'alloc A) -> Result<&'alloc mut T, AllocError>
//!                                        ^^^^^^                ^^^^^^
//!                                        └──────────────────────┘
//!                                        Output lifetime bound to allocator borrow
//! ```
//!
//! This ensures returned references cannot outlive the allocator borrow. Since
//! arena `reset()` requires `&mut self` and `drop()` requires ownership, Rust's
//! borrow checker prevents arena invalidation while any transferred references exist.
#![expect(clippy::option_if_let_else)]

use alloc::alloc::handle_alloc_error;
use core::{
    alloc::{AllocError, Allocator, Layout},
    ptr, slice,
};

/// Fallibly transfers data into an allocator, returning a reference tied to the allocator's
/// lifetime.
///
/// This trait enables copying data into arena allocators while maintaining proper lifetime
/// bounds. The returned reference is guaranteed to be valid for as long as the allocator
/// borrow exists.
///
/// # Safety
///
/// Implementors must guarantee:
///
/// - **Correct layout**: Allocations must use the correct [`Layout`] for the data being
///   transferred, including proper size and alignment.
/// - **Valid initialization**: The allocated memory must be fully initialized with valid data
///   before returning.
/// - **No aliasing**: When returning `&mut` references, no other references to the same memory may
///   exist.
/// - **Lifetime correctness**: The returned reference must point to memory that remains valid for
///   the entire `'alloc` lifetime.
///
/// # Lifetime Guarantee
///
/// The allocator is taken by reference (`&'alloc A`), binding the output lifetime to `'alloc`.
/// This prevents use-after-free: you cannot call `reset()` (requires `&mut self`) or drop the
/// allocator (requires ownership) while references to transferred data exist.
pub unsafe trait TryTransferInto<A: Allocator> {
    /// The type of the transferred data.
    type Output;

    /// Attempts to transfer `self` into the given allocator.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if the allocator cannot fulfill the allocation request.
    fn try_transfer_into(&self, allocator: A) -> Result<Self::Output, AllocError>;
}

/// Infallibly transfers data into an allocator.
///
/// This is the infallible counterpart to [`TryTransferInto`]. On allocation failure,
/// it invokes the global allocation error handler (typically aborting the process).
///
/// # Panics
///
/// Panics (or aborts) if the underlying allocation fails, via [`handle_alloc_error`].
pub trait TransferInto<A: Allocator> {
    /// The type of the transferred data.
    type Output;

    /// Transfers `self` into the given allocator.
    fn transfer_into(&self, allocator: A) -> Self::Output;
}

impl<T, A: Allocator> TransferInto<A> for T
where
    T: ?Sized + TryTransferInto<A>,
{
    type Output = T::Output;

    #[inline]
    fn transfer_into(&self, allocator: A) -> Self::Output {
        match self.try_transfer_into(allocator) {
            Ok(output) => output,
            Err(_) => handle_alloc_error(Layout::for_value::<T>(self)),
        }
    }
}

/// Transfers a slice into an allocator by copying its contents.
///
/// # Safety
///
/// This implementation is safe because:
/// - `Layout::for_value(self)` produces the correct layout for the slice
/// - `T: Copy` ensures bitwise copying is valid (no drop flags, no ownership transfer issues)
/// - The destination is freshly allocated, guaranteeing non-overlap with the source
/// - The returned lifetime `'alloc` is bound to the allocator borrow
// SAFETY: All invariants documented on `TryTransferInto` are upheld:
// - Layout is computed via `Layout::for_value`, which is correct for slices
// - Memory is fully initialized via `copy_nonoverlapping` before returning
// - Fresh allocation ensures no aliasing
// - Lifetime bound to allocator reference prevents use-after-free
unsafe impl<'alloc, T: Copy + 'alloc, A: Allocator> TryTransferInto<&'alloc A> for [T] {
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        let layout = Layout::for_value(self);
        let dst = allocator.allocate(layout)?.cast::<T>();

        // SAFETY:
        // - `self.as_ptr()` is valid for reads of `self.len()` elements (slice guarantee)
        // - `dst.as_ptr()` points to freshly allocated memory with correct size and alignment
        // - Source and destination do not overlap (fresh allocation)
        // - `T: Copy` ensures no drop flags or ownership concerns
        let result = unsafe {
            ptr::copy_nonoverlapping(self.as_ptr(), dst.as_ptr(), self.len());
            slice::from_raw_parts_mut(dst.as_ptr(), self.len())
        };

        Ok(result)
    }
}

/// Transfers a string slice into an allocator by copying its UTF-8 bytes.
///
/// # Safety
///
/// This implementation is safe because:
/// - Delegates to `[u8]::try_transfer_into` for the actual copy
/// - Source `&str` guarantees valid UTF-8, which is preserved by the byte copy
/// - `from_utf8_unchecked_mut` is valid because the copied bytes are identical to the source
// SAFETY: UTF-8 validity is preserved because we copy the exact bytes from a valid `&str`.
// The `[u8]` implementation handles all allocation safety concerns.
unsafe impl<'alloc, A: Allocator> TryTransferInto<&'alloc A> for str {
    type Output = &'alloc mut Self;

    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        let bytes = self.as_bytes().try_transfer_into(allocator)?;

        // SAFETY: `self` is a valid `&str`, so `self.as_bytes()` is valid UTF-8.
        // We copied those exact bytes, so `bytes` is also valid UTF-8.
        Ok(unsafe { core::str::from_utf8_unchecked_mut(bytes) })
    }
}
