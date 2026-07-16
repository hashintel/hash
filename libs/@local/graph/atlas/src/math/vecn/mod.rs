//! High-dimensional vectors for embeddings, with SIMD-aligned heap storage.
//!
//! [`VecN`] wraps an `[f32; N]` without changing its layout, so borrowed
//! embedding data can be viewed as a vector for free. [`BoxedVecN`] copies a
//! vector into a heap allocation aligned for [`f32x8`] and hands out
//! [`AlignedVecN`] references to it: the alignment guarantees that
//! [`AlignedVecN::lanes`] loads every 8-lane group from an aligned address,
//! never splitting a cache line.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    ops::{Deref, DerefMut},
    ptr::{self, NonNull},
    simd::{f32x8, f64x8, num::SimdFloat as _},
};

use super::{dvecn::DVecN, kernel::mul_add_f64x8};

#[cfg(test)]
mod tests;

/// An `N`-dimensional vector of `f32` components.
///
/// A [`VecN`] is guaranteed to have the same layout as `[f32; N]`, so
/// borrowed arrays convert in place through [`from_ref`](Self::from_ref)
/// and [`from_mut`](Self::from_mut) without copying. This is the working
/// type for embedding vectors; move one into a [`BoxedVecN`] when SIMD
/// kernels need aligned storage.
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

    /// Wraps a borrowed array in place, without copying.
    #[inline]
    #[must_use]
    pub const fn from_ref(value: &[f32; N]) -> &Self {
        zerocopy::transmute_ref!(value)
    }

    /// Wraps a mutably borrowed array in place, without copying.
    #[inline]
    #[must_use]
    pub const fn from_mut(value: &mut [f32; N]) -> &mut Self {
        let ptr = (&raw mut *value).cast::<Self>();
        // SAFETY: `Self` is a transparent wrapper around `[f32; N]`, so the
        // cast preserves layout and validity; the mutable borrow is carried
        // through to the wrapper unchanged.
        unsafe { &mut *ptr }
    }

    /// Returns the components as an array reference.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[f32; N] {
        &self.0
    }

    /// Reinterprets the vector as SIMD-aligned, when its address allows.
    ///
    /// Returns [`None`] when the vector does not happen to sit at an
    /// address aligned to `align_of::<f32x8>()` bytes. For storage that is
    /// aligned by construction rather than by luck, use [`BoxedVecN`].
    #[inline]
    #[must_use]
    pub fn try_as_aligned(&self) -> Option<&AlignedVecN<N>> {
        AlignedVecN::from_ref(&self.0)
    }

    /// Reinterprets the vector as SIMD-aligned and mutable, when its
    /// address allows.
    ///
    /// Returns [`None`] when the vector does not happen to sit at an
    /// address aligned to `align_of::<f32x8>()` bytes. For storage that is
    /// aligned by construction rather than by luck, use [`BoxedVecN`].
    #[inline]
    #[must_use]
    pub fn try_as_aligned_mut(&mut self) -> Option<&mut AlignedVecN<N>> {
        AlignedVecN::from_mut(&mut self.0)
    }

    /// Returns the dot product of the two vectors, accumulated in double
    /// precision.
    ///
    /// The products are summed in `f64` and rounded to `f32` once at the
    /// end, so the result carries a single rounding regardless of the
    /// dimension; a naive single-precision sum accumulates error that
    /// grows with `N`.
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f32 {
        narrow_accumulated(self.dot_accumulated(other))
    }

    /// Returns the squared Euclidean length, accumulated in double
    /// precision.
    ///
    /// The result is non-negative and carries a single rounding to `f32`,
    /// like [`dot`](Self::dot).
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f32 {
        narrow_accumulated(self.dot_accumulated(self))
    }

    /// Returns the cosine distance `1 - cos(angle)` between the vectors,
    /// in `[0, 2]`.
    ///
    /// Zero at parallel vectors, one at orthogonal vectors, two at
    /// opposite vectors. The dot product and both squared norms are
    /// computed in one fused pass with double-precision accumulators.
    ///
    /// The zero vector has no direction: the distance between two zero
    /// vectors is zero, and the distance between a zero vector and any
    /// other vector is one.
    #[expect(
        clippy::float_cmp,
        reason = "a squared norm is exactly zero precisely for the zero vector; the degenerate \
                  contract keys on that exact value, not on a tolerance"
    )]
    #[inline]
    #[must_use]
    pub fn cosine_distance(&self, other: &Self) -> f32 {
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
            return if left_norm == right_norm { 0.0 } else { 1.0 };
        }

        narrow_accumulated((1.0 - dot / (left_norm * right_norm).sqrt()).clamp(0.0, 2.0))
    }

    /// Returns the dot product with a double-precision vector.
    ///
    /// This is the mixed-precision kernel for optimizers that keep their
    /// coefficients in `f64` while the data stays `f32`: each component is
    /// widened exactly, and the result is returned in full double
    /// precision.
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

    /// Sums the products of the two vectors' components in double
    /// precision.
    // Lane-width choice: `f64x8` is wider than 128-bit NEON registers, so
    // the compiler unrolls it fourfold; with the two independent
    // accumulators that keeps sixteen f64 FMA chains in flight, which
    // covers the latency-times-throughput product of current cores. On
    // AVX-2 the same shape is a two-register unroll.
    #[inline]
    fn dot_accumulated(&self, other: &Self) -> f64 {
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
}

/// Widens an 8-component chunk to double-precision lanes; exact for every
/// `f32`.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; inlining into the \
              surrounding kernel must be guaranteed, not hinted"
)]
#[inline(always)]
fn widen(chunk: [f32; 8]) -> f64x8 {
    f32x8::from_array(chunk).cast()
}

/// Rounds a double-precision accumulator to the working precision.
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
/// The alignment is a construction invariant: the type has the same layout
/// as `[f32; N]`, and every value originates from a [`BoxedVecN`] or from
/// a constructor that checks (or, for
/// [`from_ref_unchecked`](Self::from_ref_unchecked), demands) that the
/// address is a multiple of `align_of::<f32x8>()`. The transparent layout
/// means any array that happens to be aligned can be wrapped in place.
///
/// The payoff is [`lanes`](Self::lanes): every 8-lane load comes from an
/// aligned address, so iteration over the vector never splits a cache line.
// No `FromBytes`/`FromZeros`: a byte-level constructor would let
// `zerocopy::transmute_ref!` produce references to unaligned arrays,
// bypassing the alignment invariant.
#[derive(
    Debug, zerocopy::ByteHash, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct AlignedVecN<const N: usize>([f32; N]);

impl<const N: usize> AlignedVecN<N> {
    /// Wraps a borrowed array the caller promises is aligned.
    ///
    /// # Safety
    ///
    /// `value` must be aligned to `align_of::<f32x8>()` bytes. Consumers of
    /// the wrapper are allowed to rely on that alignment for aligned loads.
    #[inline]
    #[must_use]
    pub const unsafe fn from_ref_unchecked(value: &[f32; N]) -> &Self {
        // SAFETY: `Self` is a transparent wrapper around `[f32; N]`, and the
        // alignment invariant is the caller's contract.
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    /// Wraps a mutably borrowed array the caller promises is aligned.
    ///
    /// # Safety
    ///
    /// `value` must be aligned to `align_of::<f32x8>()` bytes. Consumers of
    /// the wrapper are allowed to rely on that alignment for aligned loads
    /// and stores.
    #[inline]
    #[must_use]
    pub const unsafe fn from_mut_unchecked(value: &mut [f32; N]) -> &mut Self {
        // SAFETY: `Self` is a transparent wrapper around `[f32; N]`, and the
        // alignment invariant is the caller's contract.
        unsafe { &mut *ptr::from_mut(value).cast::<Self>() }
    }

    /// Wraps a borrowed array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to
    /// `align_of::<f32x8>()` bytes. Stack arrays and plain boxes usually
    /// are not; obtain aligned storage from [`BoxedVecN`].
    #[must_use]
    pub fn from_ref(value: &[f32; N]) -> Option<&Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f32x8>()) {
            return None;
        }

        // SAFETY: the alignment was just checked.
        unsafe { Some(Self::from_ref_unchecked(value)) }
    }

    /// Wraps a mutable array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to
    /// `align_of::<f32x8>()` bytes. Stack arrays and plain boxes usually
    /// are not; obtain aligned storage from [`BoxedVecN`].
    #[must_use]
    pub fn from_mut(value: &mut [f32; N]) -> Option<&mut Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f32x8>()) {
            return None;
        }

        // SAFETY: the alignment was just checked.
        unsafe { Some(Self::from_mut_unchecked(value)) }
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

    /// Returns the components as aligned 8-lane SIMD groups plus a scalar
    /// remainder.
    ///
    /// The first slice reinterprets the storage in place as full
    /// [`f32x8`] groups, in order: group `i` holds components `8 * i`
    /// through `8 * i + 7`. The second slice holds the trailing `N % 8`
    /// components that do not fill a group; it is empty whenever the
    /// dimension is a multiple of 8, which embedding dimensions in
    /// practice are. The type's alignment invariant guarantees no
    /// misaligned prefix exists, so no components precede the groups.
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

    /// Returns the components as mutable aligned 8-lane SIMD groups plus a
    /// mutable scalar remainder.
    ///
    /// The split is the same as [`lanes`](Self::lanes); writes through
    /// either slice update the vector in place, so SIMD kernels can
    /// transform embeddings without a staging copy.
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

    /// Returns the dot product of the two vectors, accumulated in double
    /// precision; see [`VecN::dot`].
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f32 {
        VecN::from_ref(self.as_array()).dot(VecN::from_ref(other.as_array()))
    }

    /// Returns the squared Euclidean length; see [`VecN::norm_squared`].
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f32 {
        VecN::from_ref(self.as_array()).norm_squared()
    }

    /// Returns the cosine distance in `[0, 2]`; see
    /// [`VecN::cosine_distance`].
    #[inline]
    #[must_use]
    pub fn cosine_distance(&self, other: &Self) -> f32 {
        VecN::from_ref(self.as_array()).cosine_distance(VecN::from_ref(other.as_array()))
    }

    /// Returns the dot product with a double-precision vector; see
    /// [`VecN::dot_wide`].
    #[inline]
    #[must_use]
    pub fn dot_wide(&self, coefficients: &DVecN<N>) -> f64 {
        VecN::from_ref(self.as_array()).dot_wide(coefficients)
    }
}

const impl<const N: usize> PartialEq for AlignedVecN<N> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

/// An owned `N`-dimensional vector in a heap allocation aligned for
/// [`f32x8`].
///
/// The buffer is allocated with `align_of::<f32x8>()` alignment regardless
/// of `N`, so dereferencing always yields an [`AlignedVecN`]. This is the
/// intended long-term storage for embeddings: allocate once, then hand out
/// aligned references to SIMD kernels for the lifetime of the box.
///
/// # Examples
///
/// ```
/// # #![feature(portable_simd)]
/// # use std::simd::num::SimdFloat as _;
/// use hash_graph_atlas::math::{BoxedVecN, VecN};
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
    /// Copies the vector into a new aligned allocation in the global
    /// allocator.
    #[inline]
    #[must_use]
    pub fn new(value: &VecN<N>) -> Self {
        Self::new_in(value, Global)
    }
}

impl<const N: usize, A: Allocator> BoxedVecN<N, A> {
    /// The allocation layout: `N` components, padded to the alignment of
    /// [`f32x8`]. Allocation and deallocation must agree on this.
    #[inline]
    fn layout() -> Layout {
        Layout::array::<f32>(N)
            .and_then(|layout| layout.align_to(align_of::<f32x8>()))
            .expect("`N` 4-byte components rounded up to the SIMD alignment must fit `isize`")
    }

    /// Copies the vector into a new aligned allocation in `alloc`.
    ///
    /// The process is aborted through
    /// [`handle_alloc_error`](std::alloc::handle_alloc_error) when the
    /// allocator cannot provide the buffer.
    #[inline]
    #[must_use]
    pub fn new_in(value: &VecN<N>, alloc: A) -> Self {
        let Ok(this) = Self::try_new_in(value, alloc) else {
            alloc::alloc::handle_alloc_error(Self::layout())
        };

        this
    }

    /// Copies the vector into a new aligned allocation in `alloc`,
    /// surfacing allocation failure.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] when the allocator cannot provide the
    /// buffer. No memory is leaked in that case.
    #[inline]
    pub fn try_new_in(value: &VecN<N>, alloc: A) -> Result<Self, AllocError> {
        let layout = Self::layout();
        let allocation = alloc.allocate(layout)?;
        let ptr = allocation.cast::<f32>();

        // SAFETY: the buffer was just allocated for at least `N` components
        // and cannot overlap the borrowed source.
        unsafe {
            ptr::copy_nonoverlapping(value.as_array().as_ptr(), ptr.as_ptr(), N);
        }

        Ok(Self { ptr, alloc })
    }
}

const impl<const N: usize, A: Allocator> Deref for BoxedVecN<N, A> {
    type Target = AlignedVecN<N>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: `ptr` owns an initialized buffer of `N` components for as
        // long as `self` lives, allocated with the alignment of `f32x8` by
        // `layout`.
        unsafe { AlignedVecN::from_ref_unchecked(&*self.ptr.as_ptr().cast::<[f32; N]>()) }
    }
}

const impl<const N: usize, A: Allocator> DerefMut for BoxedVecN<N, A> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: `ptr` owns an initialized buffer of `N` components for as
        // long as `self` lives, allocated with the alignment of `f32x8` by
        // `layout`; the exclusive borrow of `self` guards the exclusive
        // reference.
        unsafe { AlignedVecN::from_mut_unchecked(&mut *self.ptr.as_ptr().cast::<[f32; N]>()) }
    }
}

impl<const N: usize, A: Allocator + Clone> Clone for BoxedVecN<N, A> {
    #[inline]
    fn clone(&self) -> Self {
        Self::new_in(VecN::from_ref(self.as_array()), self.alloc.clone())
    }

    fn clone_from(&mut self, source: &Self) {
        // Both buffers share the same layout for a given `N`, so the
        // existing allocation is reused instead of reallocating.
        //
        // SAFETY: both pointers own initialized buffers of `N` components,
        // and two live boxes cannot alias.
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

impl<const N: usize, A: Allocator> AsRef<AlignedVecN<N>> for BoxedVecN<N, A> {
    #[inline]
    fn as_ref(&self) -> &AlignedVecN<N> {
        self
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
        // SAFETY: `ptr` was allocated by `alloc` in `new_in` with the same
        // layout and has not been deallocated since.
        unsafe {
            self.alloc.deallocate(self.ptr.cast::<u8>(), Self::layout());
        }
    }
}

// SAFETY: the buffer is exclusively owned and its `f32` components are
// `Send` and `Sync`; the allocator's own thread-safety carries the bound.
unsafe impl<const N: usize, A: Allocator + Send> Send for BoxedVecN<N, A> {}

// SAFETY: shared access only exposes `&[f32; N]`, which is `Sync`; the
// allocator's own thread-safety carries the bound.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for BoxedVecN<N, A> {}
