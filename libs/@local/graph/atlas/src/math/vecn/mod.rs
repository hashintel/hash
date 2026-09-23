//! High-dimensional vectors for embeddings, with SIMD-aligned heap storage.
//!
//! [`VecN`] views borrowed embedding arrays without copying. [`BoxedVecN`] provides owned storage
//! aligned for [`f32x8`], and [`AlignedVecN::lanes`] borrows that storage as SIMD groups with a
//! scalar remainder. Alignment constrains addresses without guaranteeing a cache-line size or
//! particular generated load instructions.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    borrow::{Borrow, BorrowMut},
    ops::{Deref, DerefMut},
    ptr::{self, NonNull},
    simd::{f32x8, f64x8, num::SimdFloat as _},
};
use std::simd::Simd;

use super::{AlignedDVecN, NonNegative, dvecn::DVecN, kernel::mul_add_f64x8, non_negative};

#[cfg(test)]
mod tests;

/// An `N`-dimensional vector of `f32` components.
///
/// A [`VecN`] is guaranteed to have the same layout as an array of `N` `f32` components. Borrow
/// arrays in place through [`from_ref`](Self::from_ref) and [`from_mut`](Self::from_mut), without
/// copying. Use [`BoxedVecN`] when SIMD kernels need owned aligned storage.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct VecN<const N: usize>([f32; N]);

impl<const N: usize> VecN<N> {
    /// Creates a vector that owns its components.
    #[inline]
    #[must_use]
    pub const fn new(components: [f32; N]) -> Self {
        Self(components)
    }

    /// Views a borrowed component array without copying.
    #[inline]
    #[must_use]
    pub const fn from_ref(value: &[f32; N]) -> &Self {
        zerocopy::transmute_ref!(value)
    }

    /// Mutably views a borrowed component array without copying.
    #[inline]
    #[must_use]
    pub const fn from_mut(value: &mut [f32; N]) -> &mut Self {
        let ptr = (&raw mut *value).cast::<Self>();
        // SAFETY: repr(transparent) gives Self the array's size, alignment and validity. The
        // pointer derives from an initialized, exclusively borrowed array and retains its
        // provenance and lifetime. Therefore the returned mutable reference is valid for that
        // borrow.
        unsafe { &mut *ptr }
    }

    /// Views a slice of component arrays as vectors without copying.
    #[inline]
    #[must_use]
    pub const fn wrap_slice(values: &[[f32; N]]) -> &[Self] {
        let data = values.as_ptr().cast::<Self>();
        // SAFETY: repr(transparent) gives Self the array element's size, alignment and validity.
        // The source slice supplies one valid initialized range, including a non-null aligned
        // pointer for empty slices or zero-sized elements. The cast preserves its count, provenance
        // and shared lifetime. Therefore the returned slice is valid for the source borrow.
        unsafe { core::slice::from_raw_parts(data, values.len()) }
    }

    /// Mutably views a slice of component arrays as vectors without copying.
    #[inline]
    #[must_use]
    pub const fn wrap_slice_mut(values: &mut [[f32; N]]) -> &mut [Self] {
        let data = values.as_mut_ptr().cast::<Self>();
        // SAFETY: repr(transparent) gives Self the array element's size, alignment and validity.
        // The source slice supplies one valid initialized range, including a non-null aligned
        // pointer for empty slices or zero-sized elements. The cast preserves its count, provenance
        // and exclusive lifetime. Therefore the returned slice is valid for the source borrow.
        unsafe { core::slice::from_raw_parts_mut(data, values.len()) }
    }

    /// Returns the components as an array reference.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[f32; N] {
        &self.0
    }

    /// Reinterprets the vector as SIMD-aligned, when its address allows.
    ///
    /// Returns [`None`] when the vector does not happen to sit at an address aligned to
    /// `align_of::<f32x8>()` bytes. For storage whose alignment comes from construction rather than
    /// luck, use [`BoxedVecN`].
    #[inline]
    #[must_use]
    pub fn try_as_aligned(&self) -> Option<&AlignedVecN<N>> {
        AlignedVecN::from_ref(&self.0)
    }

    /// Reinterprets the vector as SIMD-aligned and mutable, when its address allows.
    ///
    /// Returns [`None`] unless the address is aligned to `align_of::<f32x8>()` bytes. [`BoxedVecN`]
    /// provides that alignment at construction.
    #[inline]
    #[must_use]
    pub fn try_as_aligned_mut(&mut self) -> Option<&mut AlignedVecN<N>> {
        AlignedVecN::from_mut(&mut self.0)
    }

    /// Returns the dot product of the two vectors, accumulated in double precision.
    ///
    /// Finite components widen exactly and their products fit exactly in `f64`. Summation still
    /// rounds in double precision before one final narrowing to `f32`. The result can overflow
    /// during that narrowing. A zero-dimensional vector gives zero.
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f32 {
        narrow_accumulated(self.dot_accumulated(other))
    }

    /// Returns the squared Euclidean length, accumulated in double precision.
    ///
    /// For finite components the result is non-negative, possibly infinity after narrowing, with
    /// the rounding behavior of [`Self::dot`]. A zero-dimensional vector gives zero.
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f32 {
        narrow_accumulated(self.dot_accumulated(self))
    }

    /// Approximates the cosine distance between finite vectors, clamped to `[0, 2]`.
    ///
    /// Both vectors must have finite components. The model is 1 − ⟨x, y⟩/(‖x‖‖y‖), with zero at
    /// parallel nonzero vectors, one at orthogonal vectors and two at opposite vectors. Dot
    /// products and norms accumulate in double precision, but rounding can lose distinctions
    /// between nearly parallel vectors.
    ///
    /// The zero vector has no direction. The distance between two zero vectors is defined as zero,
    /// and the distance between a zero vector and any other vector as one. The empty pair follows
    /// the two-zero-vectors case.
    #[expect(
        clippy::float_cmp,
        reason = "a squared norm is exactly zero precisely for the zero vector; the degenerate \
                  contract keys on that exact value, not on a tolerance"
    )]
    #[inline]
    #[must_use]
    pub(crate) fn cosine_distance(&self, other: &Self) -> NonNegative {
        let (chunks_left, remainder_left) = self.0.as_chunks::<8>();
        let (chunks_right, remainder_right) = other.0.as_chunks::<8>();

        let zero = f64x8::splat(0.0);
        let mut dot = [zero; 2];
        let mut left_norm = [zero; 2];
        let mut right_norm = [zero; 2];
        for (index, (left, right)) in chunks_left.iter().zip(chunks_right).enumerate() {
            let left = widen(*left);
            let right = widen(*right);
            let lane = index & 1;

            dot[lane] = mul_add_f64x8(left, right, dot[lane]);
            left_norm[lane] = mul_add_f64x8(left, left, left_norm[lane]);
            right_norm[lane] = mul_add_f64x8(right, right, right_norm[lane]);
        }

        let mut dot = (dot[0] + dot[1]).reduce_sum();
        let mut left_norm = (left_norm[0] + left_norm[1]).reduce_sum();
        let mut right_norm = (right_norm[0] + right_norm[1]).reduce_sum();
        for (&left, &right) in remainder_left.iter().zip(remainder_right) {
            let left = f64::from(left);
            let right = f64::from(right);

            dot = left.mul_add(right, dot);
            left_norm = left.mul_add(left, left_norm);
            right_norm = right.mul_add(right, right_norm);
        }

        if left_norm == 0.0 || right_norm == 0.0 {
            return if left_norm == right_norm {
                non_negative!(0.0)
            } else {
                non_negative!(1.0)
            };
        }

        let result =
            narrow_accumulated((1.0 - dot / (left_norm * right_norm).sqrt()).clamp(0.0, 2.0));
        NonNegative::new_unchecked(result)
    }

    /// Returns the dot product with a double-precision vector.
    ///
    /// Finite `f32` components widen exactly. Products with the double-precision coefficients and
    /// their sum round in `f64`, with no final narrowing. Finite inputs can still overflow the
    /// double-precision calculation.
    #[inline]
    #[must_use]
    pub fn dot_wide(&self, coefficients: &DVecN<N>) -> f64 {
        let (chunks, remainder) = self.0.as_chunks::<8>();
        let (chunks_wide, remainder_wide) = coefficients.as_array().as_chunks::<8>();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (narrow, wide)) in chunks.iter().zip(chunks_wide).enumerate() {
            let lane = index & 1;
            accumulators[lane] =
                mul_add_f64x8(widen(*narrow), f64x8::from_array(*wide), accumulators[lane]);
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&narrow, &wide) in remainder.iter().zip(remainder_wide) {
            sum = f64::from(narrow).mul_add(wide, sum);
        }

        sum
    }

    /// Sums the products of the two vectors' components in double precision.
    ///
    /// Two finite `f32` significands multiply within 48 bits, and their exponent range fits inside
    /// `f64`. Widening before multiplication therefore gives exact products. Accumulating and
    /// reducing those products still rounds, and the returned sum carries no final narrowing. The
    /// empty sum is zero.
    ///
    /// The result depends on the summation grouping, including the SIMD horizontal reduction. It is
    /// not a cross-target bitwise reproducibility contract.
    // two interleaved eight-lane accumulators expose independent multiply-add chains. The target
    // and compiler decide how the groups map to machine registers.
    #[inline]
    pub(crate) fn dot_accumulated(&self, other: &Self) -> f64 {
        let (chunks_left, remainder_left) = self.0.as_chunks::<8>();
        let (chunks_right, remainder_right) = other.0.as_chunks::<8>();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (left, right)) in chunks_left.iter().zip(chunks_right).enumerate() {
            let lane = index & 1;
            accumulators[lane] = mul_add_f64x8(widen(*left), widen(*right), accumulators[lane]);
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&left, &right) in remainder_left.iter().zip(remainder_right) {
            sum = f64::from(left).mul_add(f64::from(right), sum);
        }

        sum
    }

    /// Returns whether every component is finite.
    ///
    /// A single NaN or infinity anywhere in the vector makes it false.
    #[inline]
    #[must_use]
    pub fn is_finite(&self) -> bool {
        let (chunks, remainder) = self.0.as_chunks::<8>();

        chunks
            .iter()
            .all(|lane| Simd::from_array(*lane).is_finite().all())
            && remainder.iter().all(|x| x.is_finite())
    }
}

const impl<const N: usize> AsRef<Self> for VecN<N> {
    #[inline]
    fn as_ref(&self) -> &Self {
        self
    }
}

/// Widens eight components to double-precision lanes.
///
/// Every finite `f32` component is represented exactly.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; inlining into the \
              surrounding kernel must be guaranteed, not hinted"
)]
#[inline(always)]
fn widen(chunk: [f32; 8]) -> f64x8 {
    f32x8::from_array(chunk).cast()
}

/// Rounds a double-precision accumulator to `f32`.
///
/// Values beyond the finite rounding range become signed infinity, and NaN remains NaN.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the narrowing is the operation: the single rounding from the f64 accumulator to the \
              f32 working precision is the documented contract"
)]
#[inline]
const fn narrow_accumulated(value: f64) -> f32 {
    value as f32
}

/// An `N`-dimensional vector whose storage is aligned for [`f32x8`].
///
/// The alignment is a construction invariant: the type has the same layout as `[f32; N]`, and every
/// value originates from a [`BoxedVecN`] or from a constructor that checks (or, for
/// [`from_ref_unchecked`](Self::from_ref_unchecked), demands) that the address is a multiple of
/// `align_of::<f32x8>()`. The transparent layout means any array that happens to be aligned can be
/// wrapped in place.
///
/// [`Self::lanes`] borrows complete SIMD groups from the aligned base and returns any trailing
/// components separately.
// No `FromBytes`/`FromZeros`: a byte-level constructor would let
// `zerocopy::transmute_ref!` produce references to unaligned arrays,
// bypassing the alignment invariant.
#[derive(
    Debug, zerocopy::ByteHash, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct AlignedVecN<const N: usize>([f32; N]);

impl<const N: usize> AlignedVecN<N> {
    /// Wraps a borrowed array whose alignment the caller promises.
    ///
    /// # Safety
    ///
    /// The address of `value` must be a multiple of `align_of::<f32x8>()` bytes. Consumers of the
    /// wrapper may rely on that alignment for aligned loads.
    #[inline]
    #[must_use]
    pub const unsafe fn from_ref_unchecked(value: &[f32; N]) -> &Self {
        // SAFETY: repr(transparent) preserves the initialized array's layout and validity. The
        // caller supplies the additional SIMD address alignment, and the cast retains the source
        // provenance and shared lifetime. Therefore the reference meets both Rust's validity rules
        // and Self's alignment invariant.
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    /// Wraps a mutably borrowed array whose alignment the caller promises.
    ///
    /// # Safety
    ///
    /// The address of `value` must be a multiple of `align_of::<f32x8>()` bytes. Consumers of the
    /// wrapper may rely on that alignment for aligned loads and stores.
    #[inline]
    #[must_use]
    pub const unsafe fn from_mut_unchecked(value: &mut [f32; N]) -> &mut Self {
        // SAFETY: repr(transparent) preserves the initialized array's layout and validity. The
        // caller supplies the additional SIMD address alignment, and the cast retains the source
        // provenance and exclusive lifetime. Therefore the reference meets both Rust's validity
        // rules and Self's alignment invariant.
        unsafe { &mut *ptr::from_mut(value).cast::<Self>() }
    }

    /// Wraps a borrowed array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f32x8>()` bytes. Obtain storage
    /// with that alignment from [`BoxedVecN`].
    #[must_use]
    pub fn from_ref(value: &[f32; N]) -> Option<&Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f32x8>()) {
            return None;
        }

        // SAFETY: the check above rejects every unaligned `value`.
        unsafe { Some(Self::from_ref_unchecked(value)) }
    }

    /// Wraps a mutable array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f32x8>()` bytes. Obtain storage
    /// with that alignment from [`BoxedVecN`].
    #[must_use]
    pub fn from_mut(value: &mut [f32; N]) -> Option<&mut Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f32x8>()) {
            return None;
        }

        // SAFETY: the check above rejects every unaligned `value`.
        unsafe { Some(Self::from_mut_unchecked(value)) }
    }

    /// Wraps a borrowed slice in place as consecutive aligned vectors.
    ///
    /// A row-major `f32[T, N]` matrix becomes a view of its `T` rows, with every SIMD kernel
    /// available on each. Vector `i` occupies components `N · i` through `N · i + N - 1`.
    ///
    /// Returns [`None`] unless every vector satisfies the alignment invariant: `components` starts
    /// at an address aligned to `align_of::<f32x8>()` bytes, one vector's `N · 4` bytes are a
    /// multiple of that alignment, and the length is a whole number of vectors. These conditions
    /// carry the base alignment to every row. Instantiating this method with `N == 0` fails its
    /// compile-time assertion.
    #[must_use]
    pub fn from_slice(components: &[f32]) -> Option<&[Self]> {
        const { assert!(N != 0) };

        // The zero-dimension guard must precede `as_chunks`, whose own non-zero check panics.
        if !components.as_ptr().is_aligned_to(align_of::<f32x8>())
            || !(N * size_of::<f32>()).is_multiple_of(align_of::<f32x8>())
        {
            return None;
        }

        let (chunks, remainder) = components.as_chunks::<N>();
        if !remainder.is_empty() {
            return None;
        }

        let chunks_ptr = &raw const *chunks;
        let ptr = chunks_ptr as *const [Self];

        // SAFETY: repr(transparent) preserves each chunk's layout and validity. The checks
        // establish an aligned base and an alignment-preserving row stride. The cast retains the
        // initialized slice's element count, provenance and shared lifetime. Therefore every
        // returned row satisfies Self's alignment invariant throughout the borrow.
        Some(unsafe { &*ptr })
    }

    /// Wraps a mutably borrowed slice in place as consecutive aligned vectors.
    ///
    /// The layout and the conditions are [`from_slice`](Self::from_slice)'s. The exclusive borrow
    /// carries through to the vectors.
    #[must_use]
    pub fn from_slice_mut(components: &mut [f32]) -> Option<&mut [Self]> {
        const { assert!(N != 0) };

        // The zero-dimension guard must precede `as_chunks_mut`, whose
        // own non-zero check panics.
        if !components.as_ptr().is_aligned_to(align_of::<f32x8>())
            || !(N * size_of::<f32>()).is_multiple_of(align_of::<f32x8>())
        {
            return None;
        }

        let (chunks, remainder) = components.as_chunks_mut::<N>();
        if !remainder.is_empty() {
            return None;
        }

        let chunks_ptr = &raw mut *chunks;
        let ptr = chunks_ptr as *mut [Self];

        // SAFETY: repr(transparent) preserves each chunk's layout and validity. The checks
        // establish an aligned base and an alignment-preserving row stride. The cast retains the
        // initialized slice's element count, provenance and exclusive lifetime. Therefore every
        // returned row satisfies Self's alignment invariant throughout the borrow.
        Some(unsafe { &mut *ptr })
    }

    /// Returns the components as an array reference.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[f32; N] {
        &self.0
    }

    /// Returns the components as a mutable array reference.
    #[inline]
    #[must_use]
    pub const fn as_array_mut(&mut self) -> &mut [f32; N] {
        &mut self.0
    }

    /// Copies the source's components into this vector.
    #[inline]
    pub const fn copy_from(&mut self, source: &Self) {
        self.0 = source.0;
    }

    /// Returns the components as aligned 8-lane SIMD groups plus a scalar remainder.
    ///
    /// The first slice reinterprets the storage in place as full [`f32x8`] groups, in order: group
    /// `i` holds components `8 · i` through `8 · i + 7`. The second slice holds the trailing `N %
    /// 8` components that do not fill a group. The type's alignment invariant excludes a misaligned
    /// prefix.
    #[inline]
    #[must_use]
    pub fn lanes(&self) -> (&[f32x8], &[f32]) {
        let (prefix, lanes, suffix) = self.0.as_simd();
        debug_assert_eq!(
            prefix.len(),
            0,
            "Per contract, everything is aligned to at least f32x8's alignment"
        );

        (lanes, suffix)
    }

    /// Returns the components as mutable aligned 8-lane groups plus a mutable scalar remainder.
    ///
    /// The split is the same as [`lanes`](Self::lanes). Writes through either slice update the
    /// vector in place.
    #[inline]
    #[must_use]
    pub fn lanes_mut(&mut self) -> (&mut [f32x8], &mut [f32]) {
        let (prefix, lanes, suffix) = self.0.as_simd_mut();
        debug_assert_eq!(
            prefix.len(),
            0,
            "Per contract, everything is aligned to at least f32x8's alignment"
        );

        (lanes, suffix)
    }

    /// Returns the dot product of the two vectors, accumulated in double precision.
    ///
    /// See [`VecN::dot`].
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f32 {
        VecN::from_ref(self.as_array()).dot(VecN::from_ref(other.as_array()))
    }

    /// Returns the squared Euclidean length.
    ///
    /// See [`VecN::norm_squared`].
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f32 {
        VecN::from_ref(self.as_array()).norm_squared()
    }

    /// Returns the cosine distance in `[0, 2]`.
    ///
    /// See [`VecN::cosine_distance`].
    #[inline]
    #[must_use]
    pub(crate) fn cosine_distance(&self, other: &Self) -> NonNegative {
        VecN::from_ref(self.as_array()).cosine_distance(VecN::from_ref(other.as_array()))
    }

    /// Returns the dot product with a double-precision vector.
    ///
    /// See [`VecN::dot_wide`].
    #[inline]
    #[must_use]
    pub fn dot_wide(&self, coefficients: &AlignedDVecN<N>) -> f64 {
        VecN::from_ref(self.as_array()).dot_wide(DVecN::from_ref(coefficients.as_array()))
    }

    /// Sums the component products in double precision.
    ///
    /// See [`VecN::dot_accumulated`].
    #[inline]
    #[must_use]
    pub(crate) fn dot_accumulated(&self, other: &Self) -> f64 {
        VecN::from_ref(self.as_array()).dot_accumulated(VecN::from_ref(other.as_array()))
    }

    /// Returns whether every component is finite.
    ///
    /// See [`VecN::is_finite`].
    #[inline]
    #[must_use]
    pub fn is_finite(&self) -> bool {
        let (lanes, rest) = self.lanes();

        lanes.iter().all(|lane| lane.is_finite().all()) && rest.iter().all(|x| x.is_finite())
    }
}

const impl<const N: usize> PartialEq for AlignedVecN<N> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

const impl<const N: usize> AsRef<Self> for AlignedVecN<N> {
    #[inline]
    fn as_ref(&self) -> &Self {
        self
    }
}

impl<const N: usize> ToOwned for AlignedVecN<N> {
    type Owned = BoxedVecN<N>;

    fn to_owned(&self) -> Self::Owned {
        BoxedVecN::new(VecN::from_ref(&self.0))
    }
}

/// An owned `N`-dimensional vector in a heap allocation aligned for [`f32x8`].
///
/// The buffer provides `align_of::<f32x8>()` alignment regardless of `N`, including zero. It can be
/// borrowed as an [`AlignedVecN`] throughout the box's lifetime. Cloning creates a separate buffer,
/// while cloning into an existing box reuses its allocation. The allocator is retained until that
/// buffer is released.
///
/// Allocation failure in the infallible constructors and trait conversions is handled by
/// [`handle_alloc_error`](alloc::alloc::handle_alloc_error). They panic if the required layout
/// cannot be represented.
///
/// # Example
///
/// This in-crate example is ignored because the module is private and uses nightly portable SIMD.
///
/// ```ignore
/// # #![feature(portable_simd)]
/// use std::simd::num::SimdFloat as _;
///
/// use crate::math::{BoxedVecN, VecN};
///
/// let embedding = BoxedVecN::new(&VecN::new([0.5_f32; 32]));
///
/// let (lanes, remainder) = embedding.lanes();
/// assert!(remainder.is_empty());
///
/// let total: f32 = lanes.iter().map(|lane| lane.reduce_sum()).sum();
/// assert_eq!(total, 16.0);
/// ```
pub struct BoxedVecN<const N: usize, A: Allocator = Global> {
    ptr: NonNull<f32>,
    alloc: A,
}

impl<const N: usize> BoxedVecN<N> {
    /// Copies the vector into a new aligned allocation in the global allocator.
    ///
    /// Allocation failure is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the required layout cannot be represented. See [`Self::new_in`].
    #[inline]
    #[must_use]
    pub(crate) fn new(value: &VecN<N>) -> Self {
        Self::new_in(value, Global)
    }

    /// Creates the zero vector in a new aligned allocation in the global allocator.
    ///
    /// Every component is `0.0` and the buffer is valid for in-place filling through
    /// [`as_array_mut`](AlignedVecN::as_array_mut). Allocation failure is handled by
    /// [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the required layout cannot be represented. See [`Self::zero_in`].
    #[inline]
    #[must_use]
    pub(crate) fn zero() -> Self {
        Self::zero_in(Global)
    }
}

impl<const N: usize, A: Allocator> BoxedVecN<N, A> {
    /// Computes the allocation layout for `N` components with SIMD alignment.
    ///
    /// Raising alignment preserves the byte size, without adding trailing padding. Allocation and
    /// deallocation must use this same layout.
    ///
    /// # Panics
    ///
    /// Panics if the component array or its required alignment exceeds the layout size limit.
    #[inline]
    fn layout() -> Layout {
        Layout::array::<f32>(N)
            .and_then(|layout| layout.align_to(align_of::<f32x8>()))
            .expect("`N` 4-byte components rounded up to the SIMD alignment must fit `isize`")
    }

    /// Creates the zero vector in a new aligned allocation in `alloc`.
    ///
    /// Allocation failure is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    ///
    /// # Panics
    ///
    /// Panics if the required layout cannot be represented.
    #[inline]
    #[must_use]
    pub(crate) fn zero_in(alloc: A) -> Self {
        let layout = Self::layout();
        let Ok(allocation) = alloc.allocate_zeroed(layout) else {
            alloc::alloc::handle_alloc_error(layout)
        };

        // All-zero bits are the valid `f32` value 0.0 in every component.
        Self {
            ptr: allocation.cast::<f32>(),
            alloc,
        }
    }

    /// Copies the vector into a new aligned allocation in `alloc`.
    ///
    /// Allocation failure is handled by [`handle_alloc_error`](alloc::alloc::handle_alloc_error).
    /// Use [`Self::try_new_in`] to receive an allocation error.
    ///
    /// # Panics
    ///
    /// Panics if the required layout cannot be represented.
    #[inline]
    #[must_use]
    pub(crate) fn new_in(value: &VecN<N>, alloc: A) -> Self {
        let Ok(this) = Self::try_new_in(value, alloc) else {
            alloc::alloc::handle_alloc_error(Self::layout())
        };

        this
    }

    /// Tries to copy the vector into a new aligned allocation in `alloc`.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] when the allocator cannot provide the buffer.
    ///
    /// # Panics
    ///
    /// Panics if the required layout cannot be represented.
    #[inline]
    pub(crate) fn try_new_in(value: &VecN<N>, alloc: A) -> Result<Self, AllocError> {
        let layout = Self::layout();
        let allocation = alloc.allocate(layout)?;
        let ptr = allocation.cast::<f32>();

        // SAFETY: copy_nonoverlapping is an untyped copy that preserves initialization state. It
        // requires aligned source and destination pointers valid for N-component read and write
        // ranges, with no overlap for a nonzero copy. The source array reference supplies N
        // initialized f32 values. allocate supplies a separate buffer with the requested size and
        // alignment, including a non-null aligned pointer when N is zero. Therefore the copy
        // initializes the destination without aliasing the source.
        unsafe {
            ptr::copy_nonoverlapping(value.as_array().as_ptr(), ptr.as_ptr(), N);
        }

        Ok(Self { ptr, alloc })
    }
}

const impl<const N: usize, A: Allocator> Deref for BoxedVecN<N, A> {
    type Target = AlignedVecN<N>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: the array reference requires initialized aligned storage valid for the borrow.
        // Constructors initialize all N components by zeroing or copying, retain the allocator, and
        // request f32x8 alignment even for N = 0. No shared method deallocates or mutates the
        // buffer. Therefore the array reference and its AlignedVecN view remain valid for the
        // shared borrow of self.
        unsafe { AlignedVecN::from_ref_unchecked(&*self.ptr.as_ptr().cast::<[f32; N]>()) }
    }
}

const impl<const N: usize, A: Allocator> DerefMut for BoxedVecN<N, A> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: the array reference requires initialized, aligned and exclusively accessible
        // storage. Constructors initialize all N components and retain a buffer with f32x8
        // alignment, including when N = 0. The exclusive borrow of its owning box excludes other
        // buffer access for the returned lifetime. Therefore both the mutable array reference and
        // its AlignedVecN view are valid.
        unsafe { AlignedVecN::from_mut_unchecked(&mut *self.ptr.as_ptr().cast::<[f32; N]>()) }
    }
}

const impl<const N: usize, A: Allocator> Borrow<AlignedVecN<N>> for BoxedVecN<N, A> {
    fn borrow(&self) -> &AlignedVecN<N> {
        self
    }
}

const impl<const N: usize, A: Allocator> BorrowMut<AlignedVecN<N>> for BoxedVecN<N, A> {
    fn borrow_mut(&mut self) -> &mut AlignedVecN<N> {
        &mut *self
    }
}

impl<const N: usize, A: Allocator + Clone> Clone for BoxedVecN<N, A> {
    #[inline]
    fn clone(&self) -> Self {
        Self::new_in(VecN::from_ref(self.as_array()), self.alloc.clone())
    }

    fn clone_from(&mut self, source: &Self) {
        // SAFETY: copy_nonoverlapping is an untyped copy that preserves initialization state. It
        // requires aligned pointers valid for N-component read and write ranges, with no overlap
        // for a nonzero copy. Both boxes retain separately owned buffers of N aligned f32 values,
        // and the source array reference supplies initialized components. The mutable destination
        // borrow excludes aliasing with source. For N = 0 both pointers remain non-null and
        // aligned. Therefore the copy reuses the destination allocation while preserving its
        // initialized components.
        unsafe {
            ptr::copy_nonoverlapping(source.as_array().as_ptr(), self.ptr.as_ptr(), N);
        }
    }
}

impl<const N: usize> From<&VecN<N>> for BoxedVecN<N> {
    #[inline]
    fn from(value: &VecN<N>) -> Self {
        Self::new(value)
    }
}

impl<const N: usize> From<[f32; N]> for BoxedVecN<N> {
    #[inline]
    fn from(components: [f32; N]) -> Self {
        Self::new(VecN::from_ref(&components))
    }
}

const impl<const N: usize, A: Allocator> AsRef<AlignedVecN<N>> for BoxedVecN<N, A> {
    #[inline]
    fn as_ref(&self) -> &AlignedVecN<N> {
        self
    }
}

const impl<const N: usize, A: Allocator> AsRef<VecN<N>> for BoxedVecN<N, A> {
    #[inline]
    fn as_ref(&self) -> &VecN<N> {
        VecN::from_ref(self.as_array())
    }
}

impl<const N: usize, A: Allocator> core::hash::Hash for BoxedVecN<N, A> {
    #[inline]
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        (**self).hash(state);
    }
}

impl<const N: usize, A: Allocator> core::fmt::Debug for BoxedVecN<N, A> {
    #[inline]
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        core::fmt::Debug::fmt(&**self, fmt)
    }
}

const impl<const N: usize, A: Allocator> PartialEq for BoxedVecN<N, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl<const N: usize, A: Allocator> Drop for BoxedVecN<N, A> {
    #[inline]
    fn drop(&mut self) {
        // SAFETY: deallocate requires a currently allocated pointer and a matching allocator
        // layout. Constructors retain the allocating allocator and its buffer, which no other
        // operation deallocates or transfers. Self::layout is unchanged for N. Therefore Drop
        // releases the buffer exactly once with its original allocator and layout.
        unsafe {
            self.alloc.deallocate(self.ptr.cast::<u8>(), Self::layout());
        }
    }
}

// SAFETY: Send permits transferring ownership between threads. The box exclusively owns its f32
// buffer, whose components are Send, and A: Send permits moving the retained allocator with it.
// Therefore the buffer and its eventual deallocation can transfer with the box.
unsafe impl<const N: usize, A: Allocator + Send> Send for BoxedVecN<N, A> {}

// SAFETY: Sync requires shared access to avoid unsynchronized mutation. Shared box methods expose
// immutable f32 components and access the retained allocator only through shared methods, with A:
// Sync. Mutation and deallocation require exclusive ownership. Therefore sharing the box introduces
// no mutable buffer aliases.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for BoxedVecN<N, A> {}
