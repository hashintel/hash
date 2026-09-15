//! Runtime-order square `f64` matrices and their Cholesky factorization.
//!
//! [`DSquareMatrix`] holds an order × order matrix chosen at runtime in one SIMD-aligned
//! allocation. Entries fill in place through [`row_mut`](DSquareMatrix::row_mut).
//! [`DSquareMatrix::cholesky`] consumes the matrix and factors its lower triangle in place into the
//! lower-triangular [`DCholeskyFactor`] L approximating A = L·Lᵀ.
//! [`solve_in_place`](DCholeskyFactor::solve_in_place) then solves A·x = b by forward and back
//! substitution, with floating-point rounding. Factorization returns [`DCholeskyError`] at its
//! first non-finite or nonpositive computed pivot. Rounding can cause even a positive-definite
//! input to be rejected.
//!
//! # Determinism
//!
//! Prefix dots fold eight fused lanes at a time into two interleaved accumulators, reduce their
//! lane-wise sum, then finish with a scalar tail. The kernels are single-threaded. Block height
//! changes which entries are computed together, not the arithmetic within each entry. The final
//! lane-reduction order follows portable SIMD, and byte identity across targets or builds is not
//! guaranteed.
//!
//! # Layout
//!
//! A stride of whole [`f64x8`] lanes preserves alignment from an aligned allocation base. The
//! constructor pads rows to that stride and aligns the allocation for `f64x8`. Every row starts at
//! an aligned address, which row views require as a type invariant for aligned lane loads.
//!
//! Padding components are `0.0` from construction on and are never read as data. The triangular
//! prefixes reduced during factorization can end mid-lane. Their tails fold scalarly over the
//! remaining data components, without reading the padding.

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

/// Rounds the row order up to a multiple of eight components.
///
/// `order` must not exceed `usize::MAX - 7`.
///
/// # Panics
///
/// Panics when `order > usize::MAX - 7` and integer overflow checking is enabled.
const fn stride_for(order: usize) -> usize {
    order.next_multiple_of(8)
}

/// A lane-aligned view of a row, or row prefix, of the factorization's storage.
///
/// Every row of a [`DSquareMatrix`] or [`DCholeskyFactor`] starts a whole number of [`f64x8`] lanes
/// into an allocation aligned for [`f64x8`], and a prefix shares its row's start.
/// [`from_slice`](Self::from_slice) admits exactly such slices. [`lanes`](Self::lanes) therefore
/// splits into aligned lane loads plus a scalar tail, with nothing in front.
// No byte-level constructors (zerocopy `FromBytes`): `transmute_ref!` could then create views of
// unaligned slices, bypassing the alignment invariant `from_slice` checks.
#[repr(transparent)]
struct DSquareRowBlock([f64]);

impl DSquareRowBlock {
    /// Borrows a slice whose start is aligned for [`f64x8`].
    ///
    /// The caller must establish the alignment.
    // This is a safe fn because the alignment invariant guards which lane split `lanes` sees, a
    // correctness property rather than memory safety.
    #[inline]
    fn from_slice(value: &[f64]) -> &Self {
        debug_assert!(
            value.as_ptr().is_aligned_to(align_of::<f64x8>()),
            "a row view must start at an address aligned for f64x8"
        );

        // SAFETY: repr(transparent) preserves the slice's layout and validity. The cast retains its
        // pointer, length and shared-borrow lifetime, and adds no mutation. Therefore the same
        // initialized range may be borrowed as Self.
        unsafe { &*(ptr::from_ref(value) as *const Self) }
    }

    /// The number of components in the view.
    #[inline]
    const fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns the components as aligned 8-lane groups plus a scalar remainder.
    ///
    /// Group `i` holds components `8 · i` through `8 · i + 7`. The remainder holds the trailing
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

    /// Returns the dot product of two equal-length views.
    ///
    /// Fused products accumulate into two interleaved eight-lane accumulators, followed by a lane
    /// reduction and a fused scalar tail. The view lengths must match.
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
    /// `vector` must match the view's length and may have any alignment. It uses the same grouping
    /// and fused operations as [`Self::dot`].
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
    /// Uses one fused multiply-add per component. `destination` must match the view's length and
    /// may have any alignment.
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
    /// The computed pivot is NaN or infinite, from non-finite input or intermediate arithmetic.
    NonFinitePivot {
        /// The diagonal position of the first non-finite pivot.
        index: usize,
    },
    /// The computed pivot is finite but zero or negative.
    ///
    /// This can reflect a non-positive-definite input or rounding in the factorization.
    NonPositivePivot {
        /// The diagonal position of the first non-positive pivot.
        index: usize,
        /// The pivot's value.
        value: f64,
    },
}

/// The target active-block working-set size for choosing a panel height, in bytes.
// A recorded sweep over orders 1024-4096 found budgets from 128 KiB to 1 MiB within measurement
// noise of the best. A 64 KiB budget reduced the larger orders to two- or three-row blocks and lost
// the streamed-traffic reduction. The selected 256 KiB is inside that measured interval, not a
// guarantee of cache residency on every processor.
const BLOCK_BUDGET_BYTES: usize = 256 * 1024;

/// The block height for `stride`: the tallest block whose rows fit the working-set budget.
///
/// The panel pass reuses each settled row across the active block. The budget targets locality of
/// the active rows. A row larger than the budget selects a single-row block.
///
/// `stride · size_of::<f64>()` must fit `usize`.
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
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DSquareMatrix};
///
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
    /// Allocates a zero matrix in the global allocator.
    ///
    /// See [`Self::zeroed_in`] for the order and allocation conditions.
    ///
    /// # Panics
    ///
    /// Panics under the same conditions as [`Self::zeroed_in`].
    #[inline]
    #[must_use]
    pub(crate) fn zeroed(order: usize) -> Self {
        Self::zeroed_in(order, Global)
    }
}

impl<A: Allocator> DSquareMatrix<A> {
    /// Computes the allocation layout shared by the matrix and its factor.
    ///
    /// Row padding must fit `usize`. Allocation and deallocation use the same layout, which covers
    /// `order · stride` components with [`f64x8`] alignment without adding bytes to the component
    /// count when raising the alignment.
    ///
    /// # Panics
    ///
    /// Panics if `order > usize::MAX - 7` with integer overflow checking enabled. Also panics if
    /// the checked component-count multiplication or aligned layout construction fails.
    fn layout_for(order: usize) -> Layout {
        order
            .checked_mul(stride_for(order))
            .and_then(|components| Layout::array::<f64>(components).ok())
            .and_then(|layout| layout.align_to(align_of::<f64x8>()).ok())
            .expect(
                "the matrix's 8-byte components rounded up to the SIMD alignment must fit `isize`",
            )
    }

    /// Allocates a zero matrix with SIMD-aligned rows in `alloc`.
    ///
    /// Rounding `order` up to a multiple of eight must fit `usize`. Every component is `0.0`, and
    /// [`Self::row_mut`] provides mutable row access. Allocation failure invokes
    /// [`alloc::alloc::handle_alloc_error`].
    ///
    /// # Panics
    ///
    /// Panics if `order > usize::MAX - 7` with integer overflow checking enabled. Also panics if
    /// the checked padded component-count multiplication or aligned layout construction fails.
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

    /// Borrows the row-major buffer, including padding.
    const fn components(&self) -> &[f64] {
        // SAFETY: A raw slice requires an aligned non-null pointer to one initialized allocation
        // with a representable byte length. layout_for checks this component count, and
        // allocate_zeroed initializes every f64, including padding. The allocator supplies
        // alignment even for zero length. The buffer remains owned and immutable through this
        // shared borrow. Therefore the slice is valid for the borrow's lifetime.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.order * self.stride()) }
    }

    /// Mutably borrows the row-major buffer, including padding.
    const fn components_mut(&mut self) -> &mut [f64] {
        // SAFETY: A mutable raw slice additionally requires exclusive access. The constructor
        // supplies an aligned non-null pointer and initializes the complete layout-checked
        // component range, including the zero-length case. This exclusive Self borrow excludes
        // other buffer access and bounds the slice's lifetime. Therefore the mutable slice is
        // valid.
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
    /// holds a rounded factor L approximating A = L·Lᵀ, with zeros above the diagonal and the
    /// padding untouched. The zero-order matrix returns an empty factor.
    ///
    /// # Errors
    ///
    /// Returns [`DCholeskyError`] at the first non-finite or nonpositive computed pivot. A
    /// positive-definite input can fail when rounding removes a small positive pivot.
    ///
    /// # Complexity
    ///
    /// Takes O(n³) arithmetic operations for order n and constant additional storage beyond the
    /// owned matrix.
    #[inline]
    pub(crate) fn cholesky(self) -> Result<DCholeskyFactor<A>, DCholeskyError> {
        let block_height = block_rows_for(stride_for(self.order));
        self.cholesky_blocked(block_height)
    }

    /// Factors like [`cholesky`](Self::cholesky) with an explicit block height.
    ///
    /// Every entry uses the same prefix-dot expression regardless of blocking. The height controls
    /// row reuse and the active working-set size. It does not change the within-entry grouping of
    /// floating-point operations.
    ///
    /// # Errors
    ///
    /// Exactly [`cholesky`](Self::cholesky)'s.
    fn cholesky_blocked(
        mut self,
        block_height: NonZero<usize>,
    ) -> Result<DCholeskyFactor<A>, DCholeskyError> {
        self.factorize(block_height)?;

        // transfer allocation ownership to the factor without running the matrix's destructor.
        let matrix = ManuallyDrop::new(self);
        // SAFETY: ptr::read requires an aligned initialized value, and ownership of a non-Copy
        // result must not be duplicated. matrix.alloc is initialized and addressable, while
        // ManuallyDrop suppresses its original destruction. No panicking operation follows before
        // the factor takes the pointer, order and allocator. Therefore the read transfers the
        // allocator's ownership exactly once.
        let alloc = unsafe { ptr::read(&raw const matrix.alloc) };
        Ok(DCholeskyFactor {
            ptr: matrix.ptr,
            order: matrix.order,
            alloc,
        })
    }

    /// Computes the rounded Cholesky factor in the lower triangle.
    ///
    /// Row-wise Cholesky: `L[i][j] = (A[i][j] − Σ_{p<j} L[i][p]·L[j][p]) / L[j][j]` below the
    /// diagonal and `L[i][i] = √(A[i][i] − Σ_{p<i} L[i][p]²)` on it. Rows settle in blocks of
    /// `block_height` rows. The panel pass streams each settled row once through the whole
    /// block, then the diagonal pass settles the block's rows against each other in row order,
    /// checking every pivot before anything divides by it. Blocking preserves the prefix-dot
    /// expression for each entry.
    ///
    /// The diagonal pass zeroes each settled row's tail beyond its diagonal, leaving the strict
    /// upper triangle of the factor all-zero regardless of the input's.
    ///
    /// # Errors
    ///
    /// Returns [`DCholeskyError`] at the first non-finite or nonpositive computed pivot. Earlier
    /// rows have already been modified.
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
        // SAFETY: Deallocation requires the allocator and layout of a live allocation. zeroed_in
        // stores both the allocating instance and the pointer, and order never changes. This owner
        // has not transferred its buffer to a factor or deallocated it. Therefore this destructor
        // may release the allocation with the original layout.
        unsafe {
            self.alloc
                .deallocate(self.ptr.cast::<u8>(), Self::layout_for(self.order));
        }
    }
}

// SAFETY: Send permits transferring ownership between threads. The matrix exclusively owns its f64
// buffer, whose contents have no thread affinity, and A: Send permits moving the allocating
// instance with it. Borrowed views prevent moving the owner while in use. Therefore transferring
// the matrix preserves exclusive ownership and its deallocation capability.
unsafe impl<A: Allocator + Send> Send for DSquareMatrix<A> {}

// SAFETY: Sync requires shared access to avoid data races. Shared matrix methods expose immutable
// f64 views without interior mutation, and A: Sync covers sharing the allocator. Writes and
// deallocation require exclusive ownership. Therefore shared matrix references are safe across
// threads.
unsafe impl<A: Allocator + Sync> Sync for DSquareMatrix<A> {}

/// The lower-triangular Cholesky factor `L` of a factored [`DSquareMatrix`].
///
/// The factor owns the allocation of the matrix that produced it: row `i` holds `L[i][0..=i]`
/// followed by zeros. The product L·Lᵀ approximates the matrix represented by the input's lower
/// triangle. [`Self::solve_in_place`] uses this rounded factor to solve a linear system.
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

    /// Borrows the factor's row-major buffer, including padding.
    const fn components(&self) -> &[f64] {
        // SAFETY: A raw slice requires an aligned non-null pointer and an initialized range within
        // one allocation. The factor inherits the matrix's layout-checked buffer and unchanged
        // order. Factorization writes valid f64 values without changing its extent, and the
        // allocator supplied alignment even for zero length. This shared borrow retains ownership
        // and forbids mutation. Therefore the slice is valid for its lifetime.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.order * self.stride()) }
    }

    /// Returns row `index` of the factor as its `order` components.
    ///
    /// `index` must be less than the factor's order.
    ///
    /// # Panics
    ///
    /// Panics if the computed row offset exceeds the buffer length or leaves fewer than `order`
    /// components. With integer overflow checking enabled, also panics if the row-offset
    /// multiplication overflows.
    const fn row(&self, index: usize) -> &[f64] {
        &self.components()[index * self.stride()..][..self.order]
    }

    /// Solves `A·x = b` in place, where `A = L·Lᵀ` is the factored matrix.
    ///
    /// `vector` enters as the right-hand side `b` and leaves as the solution `x`. Forward
    /// substitution solves `L·y = b` top-down, each component a prefix dot of the factor row with
    /// the settled solution prefix. Back substitution solves `Lᵀ·x = y` bottom-up, each settled
    /// component removing its column's contribution from the equations above it. Reading columns of
    /// `Lᵀ` as rows of `L` gives both passes row-wise access to the factor. `vector` may have any
    /// alignment. Arithmetic rounds in `f64`, and a non-finite right-hand side or intermediate can
    /// produce a non-finite solution.
    ///
    /// # Complexity
    ///
    /// Takes O(n²) arithmetic operations for order n and constant additional storage.
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
        // SAFETY: Deallocation requires a live allocation with the original allocator and layout.
        // cholesky transfers the pointer, unchanged order and allocator from the matrix while
        // suppressing its destructor. This factor has neither transferred nor released that
        // ownership. Therefore it may deallocate the buffer exactly once with the matrix's original
        // layout.
        unsafe {
            self.alloc.deallocate(
                self.ptr.cast::<u8>(),
                DSquareMatrix::<A>::layout_for(self.order),
            );
        }
    }
}

// SAFETY: Send permits transferring ownership between threads. The factor exclusively owns its f64
// buffer, and A: Send permits moving the allocating instance with it. Borrowed views prevent moving
// the owner while in use. Therefore the factor and its deallocation capability may be transferred
// together.
unsafe impl<A: Allocator + Send> Send for DCholeskyFactor<A> {}

// SAFETY: Sync requires shared access to avoid data races. The factor is immutable after
// construction, and solving writes only to the separately borrowed right-hand side. A: Sync covers
// sharing the allocator. Therefore shared factor references are safe across threads.
unsafe impl<A: Allocator + Sync> Sync for DCholeskyFactor<A> {}
