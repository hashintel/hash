//! The natural (array-of-structures) batch of four 2D vectors.
//!
//! This layout exists for work that treats vectors as whole units. It matches the memory order
//! of `[Vec2; 4]`, so packing from a borrowed point slice needs no shuffle and an individual
//! vector reads out directly.

use core::{
    ops::{Add, Index, Mul, Neg, Sub},
    simd::{Simd, num::SimdFloat as _},
};
use std::simd::simd_swizzle;

use super::{Vec2, Vec2x4T};

/// Four 2D vectors packed in natural (array-of-structures) order.
///
/// This layout keeps each vector whole and interleaves the components as `x0 y0 x1 y1 x2 y2 x3 y3`,
/// the memory order of a four-element `Vec2` array. Packing from `[Vec2; 4]` therefore needs no
/// shuffle, [`get`](Self::get) reads an individual vector directly, and the type's alignment
/// satisfies [`Simd<f32, 8>`](Simd). Use this layout when operations treat vectors as whole
/// units. For axis-independent arithmetic, convert to [`Vec2x4T`].
///
/// # Examples
///
/// ```ignore
/// let batch = Vec2x4::from([
///     Vec2::new(1.0, 5.0),
///     Vec2::new(2.0, 6.0),
///     Vec2::new(3.0, 7.0),
///     Vec2::new(4.0, 8.0),
/// ]);
///
/// assert_eq!(batch[2], Vec2::new(3.0, 7.0));
/// ```
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
#[repr(C, align(32))]
pub struct Vec2x4([Vec2; 4]);

impl Vec2x4 {
    /// Creates a batch holding four copies of `vec`.
    #[inline]
    #[must_use]
    pub const fn splat(vec: Vec2) -> Self {
        Self([vec; 4])
    }

    /// Splits a point slice into a batch-aligned middle and scalar edges.
    ///
    /// The middle is a run of whole batches placed where the slice meets this type's alignment. The
    /// prefix and suffix hold the points before and after it. Concatenating the three parts in
    /// order yields the input exactly, so a bulk pass processes the middle four vectors at a time
    /// and the edges one by one.
    ///
    /// The slice's address and length decide where the split falls. Any part may be empty. The
    /// middle's size affects performance only, never correctness.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let points: Vec<Vec2> = (0..11_u8).map(|i| Vec2::splat(f32::from(i))).collect();
    /// let (prefix, batches, suffix) = Vec2x4::from_slice(&points);
    ///
    /// assert_eq!(
    ///     prefix.len() + 4 * batches.len() + suffix.len(),
    ///     points.len()
    /// );
    ///
    /// let rejoined: Vec<Vec2> = prefix
    ///     .iter()
    ///     .copied()
    ///     .chain(batches.iter().flat_map(|batch| *batch.as_array()))
    ///     .chain(suffix.iter().copied())
    ///     .collect();
    /// assert_eq!(rejoined, points);
    /// ```
    #[must_use]
    pub fn from_slice(slice: &[Vec2]) -> (&[Vec2], &[Self], &[Vec2]) {
        // SAFETY: `Self` is `repr(C)` over `[Vec2; 4]` with no padding (const-asserted below to
        // match `Simd<f32, 8>` in size), every bit pattern of four vectors is a valid batch, and
        // `align_to` places the middle only at addresses meeting the raised 32-byte alignment.
        unsafe { slice.align_to::<Self>() }
    }

    /// Assembles a batch from one SIMD lane group per axis.
    ///
    /// Lane `i` of `xs` and `ys` becomes vector `i`. One shuffle interleaves the axis groups into
    /// natural order. To keep results in axis groups, use [`Vec2x4T::from_lanes`].
    #[inline]
    #[must_use]
    pub fn from_lanes(xs: Simd<f32, 4>, ys: Simd<f32, 4>) -> Self {
        // `[x0, x1, x2, x3]` + `[y0, y1, y2, y3]` -> `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let this = simd_swizzle!(xs, ys, [0, 4, 1, 5, 2, 6, 3, 7]);
        // SAFETY: `Simd<f32, 8>` is layout-compatible with `[f32; 8]`, and `Self` is `repr(C)`
        // over `[Vec2; 4]`, eight `f32`s in the same memory order; the sizes match and every
        // bit pattern is a valid `f32`.
        unsafe { core::mem::transmute::<Simd<f32, 8>, Self>(this) }
    }

    /// Borrows the batch as its four vectors.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[Vec2; 4] {
        &self.0
    }

    /// Returns the vector at `index`.
    ///
    /// # Panics
    ///
    /// This panics when `index ≥ 4`.
    #[inline]
    #[must_use]
    pub const fn get(self, index: usize) -> Vec2 {
        self.0[index]
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 y0 x1 y1 x2 y2 x3 y3`. This compiles to a single
    /// full-width vector load.
    #[inline]
    #[must_use]
    pub const fn to_simd(self) -> Simd<f32, 8> {
        // SAFETY: `Simd<f32, 8>` is layout-compatible with `[f32; 8]`, and `Self` is `repr(C)`
        // over `[Vec2; 4]`, eight `f32`s in the same memory order; the sizes match and `Self`
        // meets the SIMD alignment (both const-asserted below). Every bit pattern is a valid
        // `f32`, so the reinterpretation is total in both directions.
        unsafe { core::mem::transmute::<Self, Simd<f32, 8>>(self) }
    }

    /// Returns the component-wise minimum of the two batches.
    ///
    /// NaN components lose. When exactly one operand is NaN in a component, the result takes the
    /// other operand's component, following [`f32::min`].
    #[inline]
    #[must_use]
    pub fn min(self, other: Self) -> Self {
        Self::from(self.to_simd().simd_min(other.to_simd()))
    }

    /// Returns the component-wise maximum of the two batches.
    ///
    /// NaN components lose. When exactly one operand is NaN in a component, the result takes the
    /// other operand's component, following [`f32::max`].
    #[inline]
    #[must_use]
    pub fn max(self, other: Self) -> Self {
        Self::from(self.to_simd().simd_max(other.to_simd()))
    }

    /// Returns the component-wise absolute value across all four vectors.
    #[inline]
    #[must_use]
    pub fn abs(self) -> Self {
        Self::from(self.to_simd().abs())
    }

    /// Returns whether every component of every vector is finite.
    #[inline]
    #[must_use]
    pub fn is_finite(self) -> bool {
        self.to_simd().is_finite().all()
    }

    /// Folds the batch into the component-wise minimum of its four vectors.
    ///
    /// NaN components lose, following [`f32::min`].
    #[inline]
    #[must_use]
    pub fn reduce_min(self) -> Vec2 {
        // `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let acc = self.to_simd();
        // `min(acc, [x2, y2, x3, y3, 0, 0, 0, 0])`
        let acc = acc.simd_min(acc.shift_elements_left::<4>(0.0));
        // `[min(x0, x2), min(y0, y2), min(x1, x3), min(y1, y3), ..]`
        // `min(acc, [min(x1, x3), min(y1, y3), .., 0.0, 0.0])`
        let acc = acc.simd_min(acc.shift_elements_left::<2>(0.0));
        // `[min(x0, x2, x1, x3), min(y0, y2, y1, y3), ..]`
        let [x, y, ..] = acc.to_array();

        Vec2::new(x, y)
    }

    /// Folds the batch into the component-wise maximum of its four vectors.
    ///
    /// NaN components lose, following [`f32::max`].
    #[inline]
    #[must_use]
    pub fn reduce_max(self) -> Vec2 {
        // `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let acc = self.to_simd();
        // `max(acc, [x2, y2, x3, y3, 0, 0, 0, 0])`
        let acc = acc.simd_max(acc.shift_elements_left::<4>(0.0));
        // `[max(x0, x2), max(y0, y2), max(x1, x3), max(y1, y3), ..]`
        // `max(acc, [max(x1, x3), max(y1, y3), .., 0.0, 0.0])`
        let acc = acc.simd_max(acc.shift_elements_left::<2>(0.0));
        // `[max(x0, x2, x1, x3), max(y0, y2, y1, y3), ..]`
        let [x, y, ..] = acc.to_array();

        Vec2::new(x, y)
    }

    /// Deinterleaves the batch into transposed (structure-of-arrays) order.
    ///
    /// One shuffle pays the layout boundary cost. The result exposes the axis lane groups for
    /// per-axis arithmetic.
    #[inline]
    #[must_use]
    pub fn transpose(self) -> Vec2x4T {
        // `[x0, y0, x1, y1, x2, y2, x3, y3]` -> `[x0, x1, x2, x3, y0, y1, y2, y3]`
        let this = self.to_simd();
        let transposed = simd_swizzle!(this, [0, 2, 4, 6, 1, 3, 5, 7]);

        Vec2x4T::from(transposed)
    }
}

/// Adds the batches vector-wise: entry `i` of the result is `self[i] + other[i]`.
impl Add for Vec2x4 {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::from(self.to_simd() + rhs.to_simd())
    }
}

/// Subtracts the batches vector-wise: entry `i` of the result is `self[i] - other[i]`.
impl Sub for Vec2x4 {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::from(self.to_simd() - rhs.to_simd())
    }
}

/// Negates every vector in the batch.
impl Neg for Vec2x4 {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self::from(-self.to_simd())
    }
}

/// Scales every vector in the batch uniformly.
impl Mul<f32> for Vec2x4 {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f32) -> Self {
        Self::from(self.to_simd() * Simd::splat(rhs))
    }
}

const impl From<[Vec2; 4]> for Vec2x4 {
    /// Packs four vectors in their natural interleaved order.
    #[inline]
    fn from(vecs: [Vec2; 4]) -> Self {
        Self(vecs)
    }
}

const impl From<Vec2x4> for [Vec2; 4] {
    #[inline]
    fn from(batch: Vec2x4) -> Self {
        batch.0
    }
}

const impl From<Simd<f32, 8>> for Vec2x4 {
    /// Reinterprets eight lanes in `x0 y0 x1 y1 x2 y2 x3 y3` order.
    #[inline]
    fn from(lanes: Simd<f32, 8>) -> Self {
        // SAFETY: `Simd<f32, 8>` is layout-compatible with `[f32; 8]`, and `Self` is `repr(C)`
        // over `[Vec2; 4]`, eight `f32`s in the same memory order; the sizes match and `Self`
        // meets the SIMD alignment (both const-asserted below). Every bit pattern is a valid
        // `f32`, so the reinterpretation is total in both directions.
        unsafe { core::mem::transmute::<Simd<f32, 8>, Self>(lanes) }
    }
}

const impl From<Vec2x4> for Simd<f32, 8> {
    #[inline]
    fn from(batch: Vec2x4) -> Self {
        batch.to_simd()
    }
}

impl From<Vec2x4T> for Vec2x4 {
    /// Interleaves a structure-of-arrays batch back into whole vectors.
    #[inline]
    fn from(batch: Vec2x4T) -> Self {
        batch.transpose()
    }
}

impl Index<usize> for Vec2x4 {
    type Output = Vec2;

    /// Returns a reference to the vector at `index`.
    ///
    /// # Panics
    ///
    /// This panics when `index ≥ 4`.
    #[inline]
    fn index(&self, index: usize) -> &Vec2 {
        &self.0[index]
    }
}

// The batch must be usable as backing storage for `Simd<f32, 8>`, which requires identical size
// and at least its alignment. The `align(32)` supplies that alignment.
const _: () = assert!(size_of::<Vec2x4>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4>() >= align_of::<Simd<f32, 8>>());
