//! Row-major matrices whose rows support aligned SIMD access.

use alloc::alloc::Global;
use core::{
    alloc::{Allocator, Layout},
    fmt,
    ops::{Index, IndexMut},
    ptr::{self, NonNull},
    simd::f32x8,
    slice,
};

use super::AlignedVecN;

#[cfg(test)]
mod tests;

/// An owned row-major `f32` matrix with SIMD-aligned rows.
///
/// The row width `N` is a nonzero multiple of 8. Each row occupies a whole number of aligned
/// [`f32x8`] groups in the allocation, preserving alignment at every row start.
/// [`rows`](Self::rows) exposes these as [`AlignedVecN`] views. Constructing a matrix with zero
/// width or a width not divisible by 8 fails to compile. [`BoxedVecN`](super::BoxedVecN) provides
/// owned storage for one vector.
///
/// The caller picks the row count at runtime. [`zeroed`](Self::zeroed) is the constructor, and rows
/// fill in place through [`rows_mut`](Self::rows_mut). Indexing selects a row and panics when the
/// index is at least the row count. Cloning copies the complete buffer into a separate allocation
/// using a clone of the retained allocator.
///
/// Allocation failure during construction or cloning is handled by
/// [`handle_alloc_error`](alloc::alloc::handle_alloc_error). These operations panic if the required
/// layout cannot be represented.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::matrixn::MatrixN;
///
/// let mut matrix = MatrixN::<32>::zeroed(2);
/// matrix.rows_mut()[1].as_array_mut()[0] = 1.0;
///
/// assert_eq!(matrix.len(), 2);
/// assert_eq!(matrix.rows()[0].as_array()[0], 0.0);
/// assert_eq!(matrix.rows()[1].as_array()[0], 1.0);
/// ```
pub(crate) struct MatrixN<const N: usize, A: Allocator = Global> {
    ptr: NonNull<f32>,
    rows: usize,
    alloc: A,
}

impl<const N: usize> MatrixN<N> {
    /// Creates a zero-filled matrix in the global allocator.
    ///
    /// Every component is `0.0`. Allocation failure is handled by
    /// [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the matrix layout cannot be represented. See [`Self::zeroed_in`].
    #[inline]
    #[must_use]
    pub(crate) fn zeroed(rows: usize) -> Self {
        Self::zeroed_in(rows, Global)
    }

    /// Copies rows in iterator order into a matrix in the global allocator.
    ///
    /// Allocation failure is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the declared row count's layout cannot be represented, or if the iterator yields
    /// fewer rows than it declares. See [`Self::from_rows_in`].
    #[inline]
    #[must_use]
    pub(crate) fn from_rows<'row>(
        rows: impl ExactSizeIterator<Item = &'row AlignedVecN<N>>,
    ) -> Self {
        Self::from_rows_in(rows, Global)
    }
}

impl<const N: usize, A: Allocator> MatrixN<N, A> {
    /// Computes the row-major component layout with SIMD alignment.
    ///
    /// Raising alignment preserves the byte size of the `rows · N` components. Allocation and
    /// deallocation must use this same layout.
    ///
    /// # Panics
    ///
    /// Panics if the component count overflows [`usize`] or if the aligned layout exceeds the
    /// layout size limit.
    #[inline]
    fn layout(rows: usize) -> Layout {
        const {
            assert!(
                N != 0 && N.is_multiple_of(8),
                "the row width must be a nonzero multiple of 8 so the base alignment carries to \
                 every row",
            );
        }

        rows.checked_mul(N)
            .and_then(|components| Layout::array::<f32>(components).ok())
            .and_then(|layout| layout.align_to(align_of::<f32x8>()).ok())
            .expect(
                "the matrix's 4-byte components rounded up to the SIMD alignment must fit `isize`",
            )
    }

    /// Creates a zero-filled matrix with `rows` rows in `alloc`.
    ///
    /// Allocation failure is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the component count or aligned allocation layout cannot be represented.
    #[inline]
    #[must_use]
    pub(crate) fn zeroed_in(rows: usize, alloc: A) -> Self {
        let layout = Self::layout(rows);
        let Ok(allocation) = alloc.allocate_zeroed(layout) else {
            alloc::alloc::handle_alloc_error(layout)
        };

        // All-zero bits are the valid `f32` value 0.0 in every component.
        Self {
            ptr: allocation.cast::<f32>(),
            rows,
            alloc,
        }
    }

    /// Copies rows in iterator order into a matrix in `alloc`.
    ///
    /// The iterator's declared length sets the allocation size before copying. Allocation failure
    /// is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the declared row count's layout cannot be represented, or if the iterator yields
    /// fewer rows than it declares.
    #[inline]
    #[must_use]
    pub(crate) fn from_rows_in<'row>(
        rows: impl ExactSizeIterator<Item = &'row AlignedVecN<N>>,
        alloc: A,
    ) -> Self {
        let count = rows.len();
        let mut matrix = Self::zeroed_in(count, alloc);
        let mut consumed = 0_usize;
        for (slot, row) in matrix.rows_mut().iter_mut().zip(rows) {
            slot.copy_from(row);
            consumed += 1;
        }
        assert_eq!(consumed, count, "every allocated row must be filled");

        matrix
    }

    /// Returns the number of rows.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        self.rows
    }

    /// Returns whether the matrix has no rows.
    #[inline]
    #[must_use]
    pub(crate) const fn is_empty(&self) -> bool {
        self.rows == 0
    }

    /// Returns the components as one row-major slice.
    ///
    /// Row `i` occupies components `N · i` through `N · i + N - 1`.
    #[inline]
    #[must_use]
    pub(crate) const fn as_components(&self) -> &[f32] {
        // SAFETY: from_raw_parts requires one initialized, aligned allocation valid for the
        // borrowed range. layout checked rows * N and its byte size, and zeroed_in initialized and
        // retained that buffer, including an aligned non-null pointer for zero rows. The dimensions
        // never change and the shared borrow prevents deallocation or mutation. Therefore the slice
        // is valid for this borrow of self.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.rows * N) }
    }

    /// Returns the components as one mutable row-major slice.
    #[inline]
    #[must_use]
    pub(crate) const fn as_components_mut(&mut self) -> &mut [f32] {
        // SAFETY: from_raw_parts_mut requires one initialized, aligned allocation exclusively
        // accessible for the borrowed range. layout checked rows * N and its byte size, and
        // zeroed_in initialized and retained that buffer, including an aligned non-null pointer for
        // zero rows. The dimensions never change and the exclusive borrow prevents other access.
        // Therefore the mutable slice is valid for this borrow of self.
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.rows * N) }
    }

    /// Views the matrix as its aligned rows.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> &[AlignedVecN<N>] {
        AlignedVecN::from_slice(self.as_components())
            .expect("the allocation is SIMD-aligned and holds whole rows by construction")
    }

    /// Views the matrix as its aligned rows, mutably.
    #[inline]
    #[must_use]
    pub(crate) fn rows_mut(&mut self) -> &mut [AlignedVecN<N>] {
        AlignedVecN::from_slice_mut(self.as_components_mut())
            .expect("the allocation is SIMD-aligned and holds whole rows by construction")
    }

    /// Views the matrix as one flat slice of aligned 8-lane groups.
    ///
    /// Row `i` occupies the `N / 8` consecutive groups from `i · N / 8`. Whole-group row widths
    /// leave no group straddling two rows and no scalar remainder. The flat view supports
    /// whole-matrix elementwise operations without per-row dispatch.
    #[inline]
    #[must_use]
    pub(crate) fn lanes(&self) -> &[f32x8] {
        let (prefix, lanes, suffix) = self.as_components().as_simd();
        debug_assert!(
            prefix.is_empty() && suffix.is_empty(),
            "the allocation is SIMD-aligned and holds whole lanes by construction"
        );

        lanes
    }

    /// Views the matrix as one flat slice of aligned 8-lane groups, mutably.
    ///
    /// The grouping is the same as [`lanes`](Self::lanes). Writes through the slice update the
    /// matrix in place.
    #[inline]
    #[must_use]
    pub(crate) fn lanes_mut(&mut self) -> &mut [f32x8] {
        let (prefix, lanes, suffix) = self.as_components_mut().as_simd_mut();
        debug_assert!(
            prefix.is_empty() && suffix.is_empty(),
            "the allocation is SIMD-aligned and holds whole lanes by construction"
        );

        lanes
    }
}

impl<const N: usize, A: Allocator + Clone> Clone for MatrixN<N, A> {
    fn clone(&self) -> Self {
        let clone = Self::zeroed_in(self.rows, self.alloc.clone());

        // SAFETY: copy_nonoverlapping requires readable source components, a writable destination
        // and no overlap for a nonzero copy. Both layouts cover the same checked component count,
        // and zeroed_in supplies a separate allocation. Empty buffers still have non-null aligned
        // pointers. Therefore the copy preserves the source and initializes the independent clone.
        unsafe {
            ptr::copy_nonoverlapping(self.ptr.as_ptr(), clone.ptr.as_ptr(), self.rows * N);
        }

        clone
    }
}

impl<const N: usize, A: Allocator> Index<usize> for MatrixN<N, A> {
    type Output = AlignedVecN<N>;

    fn index(&self, index: usize) -> &Self::Output {
        &self.rows()[index]
    }
}

impl<const N: usize, A: Allocator> IndexMut<usize> for MatrixN<N, A> {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        &mut self.rows_mut()[index]
    }
}

impl<const N: usize, A: Allocator> PartialEq for MatrixN<N, A> {
    fn eq(&self, other: &Self) -> bool {
        self.as_components() == other.as_components()
    }
}

impl<const N: usize, A: Allocator> fmt::Debug for MatrixN<N, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.rows()).finish()
    }
}

impl<const N: usize, A: Allocator> Drop for MatrixN<N, A> {
    #[inline]
    fn drop(&mut self) {
        // SAFETY: deallocate requires a currently allocated pointer and a matching allocator
        // layout. zeroed_in retains the allocator and its buffer, and no operation transfers or
        // releases that buffer. The dimensions remain unchanged. Therefore Drop releases it exactly
        // once through the original allocator and layout.
        unsafe {
            self.alloc
                .deallocate(self.ptr.cast::<u8>(), Self::layout(self.rows));
        }
    }
}

// SAFETY: Send permits transferring ownership between threads. The matrix exclusively owns its f32
// buffer, whose components are Send, and A: Send permits moving the retained allocator. Therefore
// the buffer and its eventual deallocation can transfer with the matrix.
unsafe impl<const N: usize, A: Allocator + Send> Send for MatrixN<N, A> {}

// SAFETY: Sync requires shared access to avoid unsynchronized mutation. Shared matrix methods
// expose immutable f32 components, and A: Sync permits shared allocator access. Buffer mutation and
// deallocation require exclusive ownership. Therefore sharing the matrix introduces no mutable
// buffer aliases.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for MatrixN<N, A> {}
