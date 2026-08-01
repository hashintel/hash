//! An owned row-major matrix with SIMD-aligned rows.

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

/// An owned `T x N` matrix of `f32` components in one heap allocation aligned for [`f32x8`].
///
/// The row width `N` is a nonzero multiple of 8, so one row's `N · 4` bytes are a multiple of
/// `align_of::<f32x8>()` and every row begins at an alignment boundary. [`rows`](Self::rows) views
/// the matrix as [`AlignedVecN`] rows that satisfy the alignment invariant by construction, and
/// [`BoxedVecN`](super::BoxedVecN) gives one vector the same guarantee. A width that is not a
/// multiple of 8 fails to compile.
///
/// The caller picks the row count at runtime. [`zeroed`](Self::zeroed) is the constructor, and rows
/// fill in place through [`rows_mut`](Self::rows_mut).
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::MatrixN;
///
/// let mut matrix = MatrixN::<32>::zeroed(2);
/// matrix.rows_mut()[1].as_array_mut()[0] = 1.0;
///
/// assert_eq!(matrix.len(), 2);
/// assert_eq!(matrix.rows()[0].as_array()[0], 0.0);
/// assert_eq!(matrix.rows()[1].as_array()[0], 1.0);
/// ```
pub struct MatrixN<const N: usize, A: Allocator = Global> {
    ptr: NonNull<f32>,
    rows: usize,
    alloc: A,
}

impl<const N: usize> MatrixN<N> {
    /// Creates the zero matrix of `rows` rows in a new aligned allocation in the global allocator.
    ///
    /// Every component is `0.0` and the buffer is valid for in-place filling through
    /// [`rows_mut`](Self::rows_mut).
    #[inline]
    #[must_use]
    pub fn zeroed(rows: usize) -> Self {
        Self::zeroed_in(rows, Global)
    }
}

impl<const N: usize, A: Allocator> MatrixN<N, A> {
    /// Create the layout of the allocation.
    ///
    /// The allocation layout: `rows · N` components, padded to the alignment of [`f32x8`].
    /// Allocation and deallocation must agree on this.
    ///
    /// # Panics
    ///
    /// This panics when the component count overflows the address space.
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

    /// Creates the zero matrix of `rows` rows in a new aligned allocation in `alloc`.
    ///
    /// This aborts the process through [`handle_alloc_error`](std::alloc::handle_alloc_error) when
    /// the allocator cannot provide the buffer.
    #[inline]
    #[must_use]
    pub fn zeroed_in(rows: usize, alloc: A) -> Self {
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

    /// Returns the number of rows.
    #[inline]
    #[must_use]
    pub const fn len(&self) -> usize {
        self.rows
    }

    /// Returns whether the matrix has no rows.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.rows == 0
    }

    /// Returns the components as one row-major slice.
    ///
    /// Row `i` occupies components `N · i` through `N · i + N - 1`.
    #[inline]
    #[must_use]
    pub const fn as_components(&self) -> &[f32] {
        // SAFETY: `ptr` owns an initialized buffer of `rows · N` components for as long as `self`
        // lives.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.rows * N) }
    }

    /// Returns the components as one mutable row-major slice.
    #[inline]
    #[must_use]
    pub const fn as_components_mut(&mut self) -> &mut [f32] {
        // SAFETY: `ptr` owns an initialized buffer of `rows · N` components for as long as `self`
        // lives. The exclusive borrow of `self` guards the exclusive reference.
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.rows * N) }
    }

    /// Views the matrix as its aligned rows.
    #[inline]
    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "construction establishes the alignment and whole-row invariants the expect \
                  re-checks"
    )]
    pub fn rows(&self) -> &[AlignedVecN<N>] {
        AlignedVecN::from_slice(self.as_components())
            .expect("the allocation is SIMD-aligned and holds whole rows by construction")
    }

    /// Views the matrix as its aligned rows, mutably.
    #[inline]
    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "construction establishes the alignment and whole-row invariants the expect \
                  re-checks"
    )]
    pub fn rows_mut(&mut self) -> &mut [AlignedVecN<N>] {
        AlignedVecN::from_slice_mut(self.as_components_mut())
            .expect("the allocation is SIMD-aligned and holds whole rows by construction")
    }

    /// Views the matrix as one flat slice of aligned 8-lane groups.
    ///
    /// The lanes run row-major over the whole storage. Row `i` occupies the `N / 8` consecutive
    /// lanes from `i · N / 8`, and no lane straddles two rows, so whole-matrix elementwise kernels
    /// iterate one slice without per-row dispatch. No scalar remainder exists, because the row
    /// width is a multiple of the lane width by construction.
    #[inline]
    #[must_use]
    pub fn lanes(&self) -> &[f32x8] {
        let (prefix, lanes, suffix) = self.as_components().as_simd();
        debug_assert!(
            prefix.is_empty() && suffix.is_empty(),
            "the allocation is SIMD-aligned and holds whole lanes by construction"
        );

        lanes
    }

    /// Views the matrix as one flat slice of aligned 8-lane groups, mutably.
    ///
    /// The split is the same as [`lanes`](Self::lanes); writes through the slice update the matrix
    /// in place.
    #[inline]
    #[must_use]
    pub fn lanes_mut(&mut self) -> &mut [f32x8] {
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

        // SAFETY: both pointers own initialized buffers of `rows · N` components, and a fresh
        // allocation cannot overlap its source.
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
        // SAFETY: `zeroed_in` allocated `ptr` from `alloc` with the same layout, and nothing has
        // deallocated it since.
        unsafe {
            self.alloc
                .deallocate(self.ptr.cast::<u8>(), Self::layout(self.rows));
        }
    }
}

// SAFETY: the matrix owns its buffer exclusively; sending it moves the unique owner, exactly as
// `Box<[f32]>` is `Send`.
unsafe impl<const N: usize, A: Allocator + Send> Send for MatrixN<N, A> {}

// SAFETY: shared access hands out only `&[f32]`-shaped views of the owned buffer; there is no
// interior mutability, exactly as `Box<[f32]>` is `Sync`.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for MatrixN<N, A> {}
