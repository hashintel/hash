//! Runtime-order square `f64` matrices and their Cholesky factorization.
//!
//! [`DSquareMatrix`] holds an order × order matrix chosen at runtime in one SIMD-aligned
//! allocation. Entries fill in place through [`row_mut`](DSquareMatrix::row_mut).
//! [`DSquareMatrix::cholesky`] consumes the matrix and factors its lower triangle in place into the
//! lower-triangular [`DCholeskyFactor`] `L` with `A = L·Lᵀ`, and
//! [`solve_in_place`](DCholeskyFactor::solve_in_place) then answers `A·x = b` by forward and back
//! substitution. A matrix whose lower triangle is not positive-definite fails the factorization at
//! its first bad pivot with a [`DCholeskyError`].
//!
//! # Determinism
//!
//! Every reduction folds in a fixed order that depends only on the operand lengths. Prefix dots
//! fold eight fused lanes at a time into two interleaved accumulators and finish with a scalar
//! tail. Factoring the same bytes therefore yields bit-identical factors. Solving with the same
//! factor and right-hand side yields bit-identical solutions. The kernels are single-threaded by
//! construction.
//!
//! # Layout
//!
//! The constructor pads rows to a stride of whole [`f64x8`] lanes and aligns the allocation for
//! [`f64x8`], so every row starts at an aligned address. Row views carry that alignment as a type
//! invariant, so the kernels load whole aligned lanes. Padding components are `0.0` from
//! construction on and are never read as data: the triangular prefixes the factorization reduces
//! end mid-lane, so their tails fold scalarly instead of reading into the padding.

use alloc::alloc::Global;
use core::{
    alloc::{Allocator, Layout},
    fmt,
    mem::ManuallyDrop,
    num::NonZero,
    ptr::{self, NonNull},
    simd::{f64x8, num::SimdFloat as _},
    slice,
};

use super::kernel::mul_add_f64x8;

#[cfg(test)]
mod tests;

/// The row stride in components, the order rounded up to whole [`f64x8`] lanes.
const fn stride_for(order: usize) -> usize {
    order.next_multiple_of(8)
}

/// A lane-aligned view of a row, or row prefix, of the factorization's storage.
///
/// Every row of a [`DSquareMatrix`] or [`DCholeskyFactor`] starts a whole number of [`f64x8`] lanes
/// into an allocation aligned for [`f64x8`], and a prefix shares its row's start;
/// [`from_slice`](Self::from_slice) admits exactly such slices. [`lanes`](Self::lanes) therefore
/// splits into aligned lane loads plus a scalar tail, with nothing in front.
// No byte-level constructors (zerocopy `FromBytes`): `transmute_ref!` could then mint views of
// unaligned slices, bypassing the alignment invariant `from_slice` checks.
#[repr(transparent)]
struct DSquareRowBlock([f64]);

impl DSquareRowBlock {
    /// Wraps a slice starting at an address aligned for [`f64x8`].
    ///
    /// Views come from rows of the aligned allocation and their prefixes; debug builds check the
    /// address.
    // This is a safe fn because the alignment invariant guards which lane split `lanes` sees, a
    // correctness property rather than memory safety.
    #[inline]
    fn from_slice(value: &[f64]) -> &Self {
        debug_assert!(
            value.as_ptr().is_aligned_to(align_of::<f64x8>()),
            "a row view must start at an address aligned for f64x8"
        );

        // SAFETY: `Self` is a transparent wrapper around `[f64]`; the cast preserves the slice
        // metadata.
        unsafe { &*(ptr::from_ref(value) as *const Self) }
    }

    /// The number of components in the view.
    #[inline]
    const fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns the components as aligned 8-lane groups plus a scalar remainder.
    ///
    /// Group `i` holds components `8 · i` through `8 · i + 7`; the remainder holds the trailing
    /// `len % 8` components. The alignment invariant means no components precede the groups.
    #[inline]
    fn lanes(&self) -> (&[f64x8], &[f64]) {
        let (prefix, chunks, remainder) = self.0.as_simd::<8>();
        debug_assert!(
            prefix.is_empty(),
            "per the alignment invariant, the components start on a lane boundary"
        );

        (chunks, remainder)
    }

    /// Returns the dot product of two equal-length views in a fixed fold order.
    ///
    /// Fused products accumulate eight lanes at a time into two interleaved accumulators, and
    /// the trailing `len % 8` components fold scalarly, so the summation order depends only on
    /// the length.
    #[inline]
    fn dot(&self, other: &Self) -> f64 {
        debug_assert_eq!(self.len(), other.len());

        let (chunks_left, remainder_left) = self.lanes();
        let (chunks_right, remainder_right) = other.lanes();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (&lhs, &rhs)) in chunks_left.iter().zip(chunks_right).enumerate() {
            let lane = index & 1;
            accumulators[lane] = mul_add_f64x8(lhs, rhs, accumulators[lane]);
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&lhs, &rhs) in remainder_left.iter().zip(remainder_right) {
            sum = lhs.mul_add(rhs, sum);
        }

        sum
    }

    /// Returns the dot product with a plain slice, in the fold order of [`dot`](Self::dot).
    ///
    /// `vector` may have any alignment: its lanes load component-wise while the view's load
    /// aligned, and equal inputs reduce to identical bits through either dot.
    #[inline]
    fn dot_vector(&self, vector: &[f64]) -> f64 {
        debug_assert_eq!(self.len(), vector.len());

        let (chunks_left, remainder_left) = self.lanes();
        let (chunks_right, remainder_right) = vector.as_chunks::<8>();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (&lhs, rhs)) in chunks_left.iter().zip(chunks_right).enumerate() {
            let lane = index & 1;
            accumulators[lane] = mul_add_f64x8(lhs, f64x8::from_array(*rhs), accumulators[lane]);
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&lhs, &rhs) in remainder_left.iter().zip(remainder_right) {
            sum = lhs.mul_add(rhs, sum);
        }

        sum
    }

    /// Subtracts `factor` times this view from `destination`, component-wise.
    ///
    /// One fused multiply-add per component, eight lanes at a time with a scalar tail; the update
    /// is elementwise, so no summation order exists. `destination` may have any alignment.
    #[inline]
    fn subtract_scaled(&self, destination: &mut [f64], factor: f64) {
        debug_assert_eq!(self.len(), destination.len());

        let scale = f64x8::splat(-factor);
        let (source_chunks, source_remainder) = self.lanes();
        let (chunks, remainder) = destination.as_chunks_mut::<8>();

        for (chunk, &along) in chunks.iter_mut().zip(source_chunks) {
            *chunk = mul_add_f64x8(along, scale, f64x8::from_array(*chunk)).to_array();
        }

        for (component, &along) in remainder.iter_mut().zip(source_remainder) {
            *component = along.mul_add(-factor, *component);
        }
    }
}

/// The Cholesky factorization rejected the matrix at a pivot.
///
/// The pivot at `index` is `A[i][i] − Σ_{p<i} L[i][p]²`, the value whose square root would become
/// the factor's diagonal component `L[i][i]`. The factorization stops at the first bad pivot and
/// attempts no perturbation or recovery.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum DCholeskyError {
    /// The pivot is NaN or infinite: the fate of any non-finite component in the lower triangle's
    /// rows up to and including `index`.
    NonFinitePivot {
        /// The diagonal position of the first non-finite pivot.
        index: usize,
    },
    /// The pivot is finite but zero or negative: the lower triangle is not positive-definite.
    NonPositivePivot {
        /// The diagonal position of the first non-positive pivot.
        index: usize,
        /// The pivot's value.
        value: f64,
    },
}

/// The active-block working set a panel pass keeps cache-resident, in bytes.
// Mid-plateau: at orders 1024-4096 every budget from 128 KiB to 1 MiB factors within
// measurement noise of the best, while 64 KiB collapses the larger orders to two-to-three-row
// blocks and loses the streamed-traffic reduction. A quarter MiB also sits inside any modern
// per-core private cache.
const BLOCK_BUDGET_BYTES: usize = 256 * 1024;

/// The block height for `stride`: the tallest block whose rows fit the working-set budget.
///
/// Each settled row streams once per block, so the streamed traffic of the settled triangle falls
/// by the block height while the block's own rows stay cache-resident. A stride past the whole
/// budget degrades to single-row blocks: the unblocked row-wise algorithm.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the block height is the floor of the budget over the row bytes"
)]
const fn block_rows_for(stride: usize) -> NonZero<usize> {
    let rows = BLOCK_BUDGET_BYTES / (stride * size_of::<f64>()).max(1);
    match NonZero::new(rows) {
        Some(rows) => rows,
        None => NonZero::<usize>::MIN,
    }
}

/// An owned order × order matrix of `f64` components in one SIMD-aligned heap allocation.
///
/// The caller chooses the order at runtime. [`zeroed`](Self::zeroed) is the constructor and entries
/// fill in place through [`row_mut`](Self::row_mut). The constructor pads rows to whole [`f64x8`]
/// lanes and every row starts at an address aligned for [`f64x8`]. The padding stays `0.0` and
/// nothing reads it as data.
///
/// [`cholesky`](Self::cholesky) consumes the matrix and factors it. Only the lower triangle is
/// authoritative for the factorization, which ignores entries above the diagonal.
///
/// # Examples
///
/// ```ignore
/// // A = [[4, 2], [2, 5]], written as its lower triangle.
/// let mut matrix = DSquareMatrix::zeroed(2);
/// matrix.row_mut(0)[0] = 4.0;
/// matrix.row_mut(1)[0] = 2.0;
/// matrix.row_mut(1)[1] = 5.0;
///
/// let factor = matrix.cholesky().expect("the matrix is positive-definite");
///
/// let mut solution = [8.0, 8.0];
/// factor.solve_in_place(&mut solution);
/// assert_eq!(solution, [1.5, 1.0]);
/// ```
pub(crate) struct DSquareMatrix<A: Allocator = Global> {
    ptr: NonNull<f64>,
    order: usize,
    alloc: A,
}

impl DSquareMatrix {
    /// Creates the zero matrix of the given order in a new aligned allocation in the global
    /// allocator.
    ///
    /// # Panics
    ///
    /// This panics when the padded component count overflows the address space.
    #[inline]
    #[must_use]
    pub(crate) fn zeroed(order: usize) -> Self {
        Self::zeroed_in(order, Global)
    }
}

impl<A: Allocator> DSquareMatrix<A> {
    /// The allocation layout shared by the matrix and its factor.
    ///
    /// `order · stride` components, padded to the alignment of [`f64x8`]. Allocation and
    /// deallocation must agree on this.
    ///
    /// # Panics
    ///
    /// This panics when the component count overflows the address space.
    fn layout_for(order: usize) -> Layout {
        order
            .checked_mul(stride_for(order))
            .and_then(|components| Layout::array::<f64>(components).ok())
            .and_then(|layout| layout.align_to(align_of::<f64x8>()).ok())
            .expect(
                "the matrix's 8-byte components rounded up to the SIMD alignment must fit `isize`",
            )
    }

    /// Creates the zero matrix of the given order in a new aligned allocation in `alloc`.
    ///
    /// Every component is `0.0` and the buffer fills in place through [`row_mut`](Self::row_mut).
    /// [`handle_alloc_error`](alloc::alloc::handle_alloc_error) aborts the process when the
    /// allocator cannot provide the buffer.
    ///
    /// # Panics
    ///
    /// This panics when the padded component count overflows the address space.
    #[inline]
    #[must_use]
    pub(crate) fn zeroed_in(order: usize, alloc: A) -> Self {
        let layout = Self::layout_for(order);
        let Ok(allocation) = alloc.allocate_zeroed(layout) else {
            alloc::alloc::handle_alloc_error(layout)
        };

        // All-zero bits are the valid `f64` value 0.0 in every component.
        Self {
            ptr: allocation.cast::<f64>(),
            order,
            alloc,
        }
    }

    /// Returns the order: the number of rows and columns.
    #[inline]
    #[must_use]
    pub(crate) const fn order(&self) -> usize {
        self.order
    }

    /// The row stride in components.
    const fn stride(&self) -> usize {
        stride_for(self.order)
    }

    /// The components as one row-major slice of `order · stride` components.
    const fn components(&self) -> &[f64] {
        // SAFETY: `ptr` owns an initialized buffer of `order · stride` components for as long as
        // `self` lives.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.order * self.stride()) }
    }

    /// The components as one mutable row-major slice of `order · stride` components.
    const fn components_mut(&mut self) -> &mut [f64] {
        // SAFETY: `ptr` owns an initialized buffer of `order · stride` components for as long as
        // `self` lives. The exclusive borrow of `self` guards the exclusive reference.
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.order * self.stride()) }
    }

    /// Returns row `index` as its `order` components.
    ///
    /// # Panics
    ///
    /// This panics when `index` is not below the order.
    #[inline]
    #[must_use]
    pub(crate) fn row(&self, index: usize) -> &[f64] {
        assert!(
            index < self.order,
            "row index {index} is out of bounds for order {order}",
            order = self.order,
        );

        &self.components()[index * self.stride()..][..self.order]
    }

    /// Returns row `index` as its `order` mutable components.
    ///
    /// # Panics
    ///
    /// This panics when `index` is not below the order.
    #[inline]
    #[must_use]
    pub(crate) fn row_mut(&mut self, index: usize) -> &mut [f64] {
        assert!(
            index < self.order,
            "row index {index} is out of bounds for order {order}",
            order = self.order,
        );

        let stride = self.stride();
        let order = self.order;
        &mut self.components_mut()[index * stride..][..order]
    }

    /// Factors the matrix in place into its lower-triangular Cholesky factor.
    ///
    /// The factorization reads only the lower triangle: entry `(i, j)` with `j ≤ i` is `A[i][j]`,
    /// and it ignores the strict upper triangle. The returned factor owns the same allocation and
    /// holds `L` with `A = L·Lᵀ`, zeros above the diagonal, and the padding untouched.
    ///
    /// # Errors
    ///
    /// [`DCholeskyError::NonFinitePivot`] when a pivot is NaN or infinite, the fate of any
    /// non-finite value in the lower triangle; [`DCholeskyError::NonPositivePivot`] when a finite
    /// pivot is zero or negative, meaning the lower triangle is not positive-definite. The
    /// factorization stops at the first bad pivot.
    #[inline]
    pub(crate) fn cholesky(self) -> Result<DCholeskyFactor<A>, DCholeskyError> {
        let block_height = block_rows_for(stride_for(self.order));
        self.cholesky_blocked(block_height)
    }

    /// Factors like [`cholesky`](Self::cholesky) with an explicit block height.
    ///
    /// The factor's bytes are identical at every block height, because every entry is the same
    /// prefix-dot expression regardless of the blocking; the height chooses only how much of the
    /// active triangle stays cache-resident per pass. [`cholesky`](Self::cholesky) derives the
    /// height that fits the working-set budget, and this form takes the height directly, so a
    /// caller can cross block boundaries at any order.
    ///
    /// # Errors
    ///
    /// Exactly [`cholesky`](Self::cholesky)'s.
    fn cholesky_blocked(
        mut self,
        block_height: NonZero<usize>,
    ) -> Result<DCholeskyFactor<A>, DCholeskyError> {
        self.factorize(block_height)?;

        // The factor takes over the allocation; skipping the matrix's drop keeps ownership
        // unique.
        let matrix = ManuallyDrop::new(self);
        // SAFETY: `ManuallyDrop` skips the matrix's drop, so the allocator moves out exactly once.
        let alloc = unsafe { ptr::read(&raw const matrix.alloc) };
        Ok(DCholeskyFactor {
            ptr: matrix.ptr,
            order: matrix.order,
            alloc,
        })
    }

    /// Factors the lower triangle in place into `L` with `A = L·Lᵀ`.
    ///
    /// Row-wise Cholesky: `L[i][j] = (A[i][j] − Σ_{p<j} L[i][p]·L[j][p]) / L[j][j]` below the
    /// diagonal and `L[i][i] = √(A[i][i] − Σ_{p<i} L[i][p]²)` on it. Rows settle in blocks of
    /// `block_height` rows. The panel pass streams each settled row once through the whole
    /// block, then the diagonal pass settles the block's rows against each other in row order,
    /// checking every pivot before anything divides by it. Every entry is the same prefix-dot
    /// expression at every block height, so the factor's bytes depend only on the input bytes.
    ///
    /// The diagonal pass zeroes each settled row's tail beyond its diagonal, leaving the strict
    /// upper triangle of the factor all-zero regardless of the input's.
    fn factorize(&mut self, block_height: NonZero<usize>) -> Result<(), DCholeskyError> {
        let order = self.order;
        let stride = self.stride();
        let block_height = block_height.get();
        let components = self.components_mut();

        let mut start = 0;
        while start < order {
            let end = usize::min(start + block_height, order);

            let (settled, active) = components.split_at_mut(start * stride);
            let active = &mut active[..(end - start) * stride];

            // Panel pass: entries (i, j) with j below the block. Looping j outermost streams each
            // settled row once for the whole block.
            for column in 0..start {
                let settled_row = &settled[column * stride..][..stride];
                let pivot = settled_row[column];
                let settled_prefix = DSquareRowBlock::from_slice(&settled_row[..column]);
                for active_row in active.chunks_exact_mut(stride) {
                    let sum =
                        DSquareRowBlock::from_slice(&active_row[..column]).dot(settled_prefix);
                    active_row[column] = (active_row[column] - sum) / pivot;
                }
            }

            // Diagonal pass: the block's rows against each other, in row order.
            for row in start..end {
                let (settled_in_block, tail) = active.split_at_mut((row - start) * stride);
                let active_row = &mut tail[..stride];

                for column in start..row {
                    let settled_row = &settled_in_block[(column - start) * stride..][..stride];
                    let sum = DSquareRowBlock::from_slice(&active_row[..column])
                        .dot(DSquareRowBlock::from_slice(&settled_row[..column]));
                    active_row[column] = (active_row[column] - sum) / settled_row[column];
                }

                let prefix = DSquareRowBlock::from_slice(&active_row[..row]);
                let pivot = active_row[row] - prefix.dot(prefix);
                if !pivot.is_finite() {
                    return Err(DCholeskyError::NonFinitePivot { index: row });
                }

                if pivot <= 0.0 {
                    return Err(DCholeskyError::NonPositivePivot {
                        index: row,
                        value: pivot,
                    });
                }
                active_row[row] = pivot.sqrt();

                // The input's strict upper triangle ends here; the factor's rows end at the
                // diagonal, and the padding beyond the order stays zero.
                active_row[row + 1..].fill(0.0);
            }

            start = end;
        }

        Ok(())
    }
}

impl<A: Allocator> fmt::Debug for DSquareMatrix<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_list()
            .entries((0..self.order).map(|index| self.row(index)))
            .finish()
    }
}

impl<A: Allocator> Drop for DSquareMatrix<A> {
    #[inline]
    fn drop(&mut self) {
        // SAFETY: `alloc` allocated `ptr` in `zeroed_in` with the same order-derived layout and
        // nothing has deallocated it since.
        unsafe {
            self.alloc
                .deallocate(self.ptr.cast::<u8>(), Self::layout_for(self.order));
        }
    }
}

// SAFETY: the matrix owns its buffer exclusively and its `f64` components are `Send`. The
// allocator's own thread-safety carries the bound.
unsafe impl<A: Allocator + Send> Send for DSquareMatrix<A> {}

// SAFETY: shared access hands out only `&[f64]`-shaped views of the owned buffer with no interior
// mutability. The allocator's own thread-safety carries the bound.
unsafe impl<A: Allocator + Sync> Sync for DSquareMatrix<A> {}

/// The lower-triangular Cholesky factor `L` of a factored [`DSquareMatrix`].
///
/// The factor owns the allocation of the matrix that produced it: row `i` holds `L[i][0..=i]`
/// followed by zeros, and `L·Lᵀ` recovers the factored matrix's lower triangle.
/// [`solve_in_place`](Self::solve_in_place) answers `A·x = b` for the factored `A`.
pub(crate) struct DCholeskyFactor<A: Allocator = Global> {
    ptr: NonNull<f64>,
    order: usize,
    alloc: A,
}

impl<A: Allocator> DCholeskyFactor<A> {
    /// Returns the order: the number of rows and columns.
    #[inline]
    #[must_use]
    pub(crate) const fn order(&self) -> usize {
        self.order
    }

    /// The row stride in components.
    const fn stride(&self) -> usize {
        stride_for(self.order)
    }

    /// The components as one row-major slice of `order · stride` components.
    const fn components(&self) -> &[f64] {
        // SAFETY: `ptr` owns an initialized buffer of `order · stride` components for as long as
        // `self` lives.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.order * self.stride()) }
    }

    /// Row `index` of the factor as its `order` components.
    const fn row(&self, index: usize) -> &[f64] {
        &self.components()[index * self.stride()..][..self.order]
    }

    /// Solves `A·x = b` in place, where `A = L·Lᵀ` is the factored matrix.
    ///
    /// `vector` enters as the right-hand side `b` and leaves as the solution `x`. Forward
    /// substitution solves `L·y = b` top-down, each component a prefix dot of the factor row with
    /// the settled solution prefix; back substitution solves `Lᵀ·x = y` bottom-up, each settled
    /// component removing its column's contribution from the equations above it - a column of `Lᵀ`
    /// is a row of `L`, so both passes read the factor along its rows. The factor's rows load as
    /// aligned lanes. `vector` may have any alignment. The solution's bytes depend only on the
    /// factor's and right-hand side's bytes.
    ///
    /// # Panics
    ///
    /// This panics when the length of `vector` differs from the order.
    #[inline]
    pub(crate) fn solve_in_place(&self, vector: &mut [f64]) {
        assert_eq!(
            vector.len(),
            self.order,
            "the right-hand side's length must equal the factor's order",
        );

        let stride = self.stride();
        let components = self.components();

        // Forward substitution: y[i] = (b[i] − Σ_{j<i} L[i][j]·y[j]) / L[i][i].
        for row in 0..self.order {
            let factor_row = &components[row * stride..][..stride];
            let sum = DSquareRowBlock::from_slice(&factor_row[..row]).dot_vector(&vector[..row]);
            vector[row] = (vector[row] - sum) / factor_row[row];
        }

        // Back substitution: x[j] = y[j] / L[j][j], then the equations above lose their
        // column-j term: y[..j] −= x[j] · L[j][..j].
        for row in (0..self.order).rev() {
            let factor_row = &components[row * stride..][..stride];
            let solution = vector[row] / factor_row[row];
            vector[row] = solution;
            DSquareRowBlock::from_slice(&factor_row[..row])
                .subtract_scaled(&mut vector[..row], solution);
        }
    }
}

impl<A: Allocator> fmt::Debug for DCholeskyFactor<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_list()
            .entries((0..self.order).map(|index| &self.row(index)[..=index]))
            .finish()
    }
}

impl<A: Allocator> Drop for DCholeskyFactor<A> {
    #[inline]
    fn drop(&mut self) {
        // SAFETY: `alloc` allocated `ptr` in `DSquareMatrix::zeroed_in` with the same order-derived
        // layout. `cholesky` moved ownership of both here and skipped the matrix's drop, so
        // no other deallocation happens.
        unsafe {
            self.alloc.deallocate(
                self.ptr.cast::<u8>(),
                DSquareMatrix::<A>::layout_for(self.order),
            );
        }
    }
}

// SAFETY: the factor owns its buffer exclusively and its `f64` components are `Send`. The
// allocator's own thread-safety carries the bound.
unsafe impl<A: Allocator + Send> Send for DCholeskyFactor<A> {}

// SAFETY: shared access hands out only `&[f64]`-shaped views of the owned buffer with no interior
// mutability. The allocator's own thread-safety carries the bound.
unsafe impl<A: Allocator + Sync> Sync for DCholeskyFactor<A> {}
