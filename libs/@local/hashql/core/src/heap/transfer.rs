//! Zero-copy data transfer into arena allocators.
use core::alloc::{AllocError, Allocator};

use super::BumpAllocator;

/// Transfers data into an arena allocator.
///
/// # Why Arena-Only?
///
/// This trait is intentionally **not** implemented for arbitrary allocators like `Global`.
/// The returned reference has lifetime `'alloc`, which is sound for arena allocators
/// because their memory remains valid until explicit `reset()` or `drop()`. For `Global`,
/// this would allow creating `&'static` references to heap memory, causing memory leaks.
///
/// # Safety
///
/// Implementors must guarantee:
///
/// - Allocations use the correct [`Layout`] for the data being transferred
/// - The allocated memory is fully initialized before returning
/// - No aliasing violations when returning `&mut` references
/// - The allocator keeps memory valid for the full `'alloc` lifetime
pub unsafe trait TransferInto<'alloc, A: Allocator> {
    type Output;

    /// Transfers `self` into the given allocator.
    fn transfer_into(&self, allocator: &'alloc A) -> Self::Output;

    /// Attempts to transfer `self` into the given allocator.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] if allocation fails.
    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError>;
}

// SAFETY: Arena memory remains valid for 'alloc. Bumpalo handles layout/initialization.
unsafe impl<'alloc, T: Copy + 'alloc, A: BumpAllocator> TransferInto<'alloc, A> for [T] {
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        allocator.try_allocate_slice_copy(self)
    }

    #[inline]
    fn transfer_into(&self, allocator: &'alloc A) -> Self::Output {
        allocator.allocate_slice_copy(self)
    }
}

// SAFETY: Arena memory remains valid for 'alloc. Bumpalo handles layout/initialization.
unsafe impl<'alloc, A: BumpAllocator> TransferInto<'alloc, A> for str {
    type Output = &'alloc mut Self;

    #[inline]
    fn try_transfer_into(&self, allocator: &'alloc A) -> Result<Self::Output, AllocError> {
        let buffer = allocator.try_allocate_slice_copy(self.as_bytes())?;

        // SAFETY: The comes from a valid string
        unsafe { Ok(Self::from_utf8_unchecked_mut(buffer)) }
    }

    #[inline]
    fn transfer_into(&self, allocator: &'alloc A) -> Self::Output {
        let buffer = allocator.allocate_slice_copy(self.as_bytes());

        // SAFETY: The comes from a valid string
        unsafe { Self::from_utf8_unchecked_mut(buffer) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::heap::Heap;

    #[test]
    fn transfer_slice() {
        let heap = Heap::new();
        let original: &[u32] = &[1, 2, 3, 4, 5];
        let transferred = original.transfer_into(&heap);

        assert_eq!(transferred, &[1, 2, 3, 4, 5]);

        // Verify it's a copy, not the same memory
        transferred[0] = 999;
        assert_eq!(original[0], 1);
    }

    #[test]
    fn transfer_str() {
        let heap = Heap::new();
        let original = "hello world";
        let transferred = original.transfer_into(&heap);

        assert_eq!(transferred, "hello world");
    }

    #[test]
    fn transfer_empty_slice() {
        let heap = Heap::new();
        let original: &[u8] = &[];
        let transferred = original.transfer_into(&heap);

        assert!(transferred.is_empty());
    }

    #[test]
    fn transfer_empty_str() {
        let heap = Heap::new();
        let original = "";
        let transferred = original.transfer_into(&heap);

        assert!(transferred.is_empty());
    }

    #[test]
    fn try_transfer_returns_ok() {
        let heap = Heap::new();
        let original: &[i64] = &[100, 200, 300];
        let result = original.try_transfer_into(&heap);

        assert!(result.is_ok());
        assert_eq!(
            result.expect("should be able to allocate"),
            &[100, 200, 300]
        );
    }

    #[expect(clippy::non_ascii_literal)]
    #[test]
    fn transfer_unicode_str() {
        let heap = Heap::new();
        let original = "日本語 🎉 émojis";
        let transferred = original.transfer_into(&heap);

        assert_eq!(transferred, "日本語 🎉 émojis");
    }
}
