//! 2D vectors and fixed-size batches of them for SIMD processing.
//!
//! The scalar type is [`Vec2`]. For vectorized code, four vectors can be packed into one of two
//! batch types, both 32 bytes and both aligned for [`Simd<f32, 8>`](Simd):
//!
//! - [`Vec2x4`] stores the vectors interleaved as `x0 y0 x1 y1 ...`, the natural memory order of
//!   `[Vec2; 4]`, so packing is shuffle-free and individual vectors can be indexed.
//! - [`Vec2x4T`] is the transposed layout: all four `x` components followed by all four `y`
//!   components. Use this when an operation treats the axes independently, such as distances,
//!   bounding boxes, or axis-wise clamping: [`Vec2x4T::xs`] and [`Vec2x4T::ys`] each yield a full
//!   [`Simd<f32, 4>`](Simd) lane group, so per-axis arithmetic runs without shuffles.
//!
//! Converting `[Vec2; 4]` into [`Vec2x4T`] performs the deinterleave at that boundary, which is the
//! usual tradeoff: pay the shuffle once on entry and keep the hot loop axis-parallel.
//!
//! A borrowed point slice splits in place into batches via [`Vec2x4::from_slice`]: the aligned
//! middle is processed four vectors at a time while the unaligned edges stay scalar, so bulk
//! passes over `&[Vec2]` vectorize without copying.
//!
//! Because both batch types match [`Simd<f32, 8>`](Simd) in size and meet its alignment,
//! [`to_simd`](Vec2x4T::to_simd) and the [`From`] conversions compile to a single full-width vector
//! load or store, with no intermediate copy and no split-load penalty.

use core::{
    ops::{Add, AddAssign, Div, DivAssign, Index, Mul, MulAssign, Neg, Sub, SubAssign},
    simd::{Simd, num::SimdFloat as _},
};
use std::simd::simd_swizzle;

use super::kernel::mul_add_f32x4;

#[cfg(test)]
mod tests;

/// A vector in 2D space with `f32` components.
///
/// A [`Vec2`] is guaranteed to have the same layout as `[f32; 2]`, with the `x` component first.
/// This makes `[Vec2; N]` bit-compatible with a flat component buffer in interleaved order, and the
/// zerocopy derives expose that reinterpretation safely.
///
/// Note that [`Hash`] is derived over the raw bytes while equality follows `f32` semantics, so
/// `-0.0` and `0.0` compare equal but hash differently.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::Vec2;
///
/// let vec = Vec2::new(1.0, 2.0);
/// assert_eq!(vec.x(), 1.0);
/// assert_eq!(vec.y(), 2.0);
/// assert_eq!(vec[0], vec.x());
/// assert_eq!(vec[1], vec.y());
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
#[repr(transparent)]
pub struct Vec2([f32; 2]);

impl Vec2 {
    /// The vector with both components zero.
    pub const ZERO: Self = Self::splat(0.0);

    /// Creates a vector from its `x` and `y` components.
    #[inline]
    #[must_use]
    pub const fn new(x: f32, y: f32) -> Self {
        Self([x, y])
    }

    /// Creates a vector with both components set to `value`.
    #[inline]
    #[must_use]
    pub const fn splat(value: f32) -> Self {
        Self([value, value])
    }

    /// Wraps a borrowed slice in place as consecutive vectors.
    ///
    /// Vector `i` of the returned slice occupies components `2 * i` and `2 * i + 1`, so a row-major
    /// `f32[T, 2]` matrix reads as its `T` points without copying.
    ///
    /// Returns [`None`] unless the length is a whole number of vectors.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::Vec2;
    ///
    /// let components = [1.0, 2.0, 3.0, 4.0];
    /// let points = Vec2::from_slice(&components).expect("two whole vectors");
    /// assert_eq!(points, [Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)]);
    /// assert!(Vec2::from_slice(&components[..3]).is_none());
    /// ```
    #[must_use]
    pub const fn from_slice(components: &[f32]) -> Option<&[Self]> {
        let (chunks, remainder) = components.as_chunks::<2>();
        if !remainder.is_empty() {
            return None;
        }

        let chunks_ptr = &raw const *chunks;
        let ptr = chunks_ptr as *const [Self];

        // SAFETY: `Self` is a transparent wrapper around `[f32; 2]`, so the chunk slice
        // reinterprets element-wise with identical layout and alignment.
        Some(unsafe { &*ptr })
    }

    /// Returns the `x` component.
    #[inline]
    #[must_use]
    pub const fn x(self) -> f32 {
        self.0[0]
    }

    /// Returns the `y` component.
    #[inline]
    #[must_use]
    pub const fn y(self) -> f32 {
        self.0[1]
    }

    /// Returns the dot product of the two vectors.
    #[inline]
    #[must_use]
    pub const fn dot(self, other: Self) -> f32 {
        self.x() * other.x() + self.y() * other.y()
    }

    /// Returns the perpendicular dot product, the `z` component of the 3D cross product.
    ///
    /// The sign tells which side of `self` the other vector lies on: positive when `other` is
    /// counterclockwise from `self`, negative when clockwise, zero when the vectors are parallel.
    #[inline]
    #[must_use]
    pub const fn perp_dot(self, other: Self) -> f32 {
        self.x() * other.y() - self.y() * other.x()
    }

    /// Returns the squared length of the vector.
    ///
    /// Prefer this over [`length`](Self::length) when comparing magnitudes or feeding a squared
    /// metric; it avoids the square root.
    #[inline]
    #[must_use]
    pub const fn length_squared(self) -> f32 {
        self.dot(self)
    }

    /// Returns the length of the vector.
    #[inline]
    #[must_use]
    pub fn length(self) -> f32 {
        self.length_squared().sqrt()
    }

    /// Returns the squared Euclidean distance to `other`.
    #[inline]
    #[must_use]
    pub const fn distance_squared(self, other: Self) -> f32 {
        let dx = self.x() - other.x();
        let dy = self.y() - other.y();

        dx * dx + dy * dy
    }

    /// Returns the Euclidean distance to `other`.
    #[inline]
    #[must_use]
    pub fn distance(self, other: Self) -> f32 {
        self.distance_squared(other).sqrt()
    }

    /// Linearly interpolates from `self` toward `other`.
    ///
    /// At `factor == 0.0` the result is `self`, at `factor == 1.0` it is `other`; values outside
    /// `[0, 1]` extrapolate along the same line.
    #[inline]
    #[must_use]
    pub const fn lerp(self, other: Self, factor: f32) -> Self {
        self + (other - self) * factor
    }

    /// Returns the component-wise minimum of the two vectors.
    ///
    /// NaN components lose: when exactly one operand is NaN in a component, the other operand's
    /// component is returned, following [`f32::min`].
    #[inline]
    #[must_use]
    pub const fn min(self, other: Self) -> Self {
        Self::new(self.x().min(other.x()), self.y().min(other.y()))
    }

    /// Returns the component-wise maximum of the two vectors.
    ///
    /// NaN components lose: when exactly one operand is NaN in a component, the other operand's
    /// component is returned, following [`f32::max`].
    #[inline]
    #[must_use]
    pub const fn max(self, other: Self) -> Self {
        Self::new(self.x().max(other.x()), self.y().max(other.y()))
    }

    /// Clamps each component into the range spanned by `low` and `high`.
    ///
    /// # Panics
    ///
    /// Panics in debug builds when a component of `low` exceeds the matching component of `high`,
    /// or when a bound is NaN, following [`f32::clamp`].
    #[inline]
    #[must_use]
    pub const fn clamp(self, low: Self, high: Self) -> Self {
        Self::new(
            self.x().clamp(low.x(), high.x()),
            self.y().clamp(low.y(), high.y()),
        )
    }

    /// Returns whether both components are finite.
    #[inline]
    #[must_use]
    pub const fn is_finite(self) -> bool {
        self.x().is_finite() && self.y().is_finite()
    }
}

const impl Add for Vec2 {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::new(self.x() + rhs.x(), self.y() + rhs.y())
    }
}

const impl AddAssign for Vec2 {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl Sub for Vec2 {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.x() - rhs.x(), self.y() - rhs.y())
    }
}

const impl SubAssign for Vec2 {
    #[inline]
    fn sub_assign(&mut self, rhs: Self) {
        *self = *self - rhs;
    }
}

const impl Neg for Vec2 {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self::new(-self.x(), -self.y())
    }
}

/// Component-wise (Hadamard) product; use [`Vec2::dot`] for the scalar product.
const impl Mul for Vec2 {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Self::new(self.x() * rhs.x(), self.y() * rhs.y())
    }
}

const impl Mul<f32> for Vec2 {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f32) -> Self {
        Self::new(self.x() * rhs, self.y() * rhs)
    }
}

const impl Mul<Vec2> for f32 {
    type Output = Vec2;

    #[inline]
    fn mul(self, rhs: Vec2) -> Vec2 {
        rhs * self
    }
}

const impl MulAssign<f32> for Vec2 {
    #[inline]
    fn mul_assign(&mut self, rhs: f32) {
        *self = *self * rhs;
    }
}

const impl Div<f32> for Vec2 {
    type Output = Self;

    #[inline]
    fn div(self, rhs: f32) -> Self {
        Self::new(self.x() / rhs, self.y() / rhs)
    }
}

const impl DivAssign<f32> for Vec2 {
    #[inline]
    fn div_assign(&mut self, rhs: f32) {
        *self = *self / rhs;
    }
}

const impl From<[f32; 2]> for Vec2 {
    #[inline]
    fn from(components: [f32; 2]) -> Self {
        Self(components)
    }
}

const impl From<Vec2> for [f32; 2] {
    #[inline]
    fn from(vec: Vec2) -> Self {
        vec.0
    }
}

const impl Index<usize> for Vec2 {
    type Output = f32;

    /// Returns the component at `index`, where `0` is `x` and `1` is `y`.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 2`.
    #[inline]
    fn index(&self, index: usize) -> &f32 {
        &self.0[index]
    }
}

/// Four 2D vectors packed in transposed (structure-of-arrays) order.
///
/// The eight components are stored as all four `x` values followed by all four `y` values: `x0 x1
/// x2 x3 y0 y1 y2 y3`. The value is aligned for [`Simd<f32, 8>`](Simd), and [`xs`](Self::xs) and
/// [`ys`](Self::ys) each return a full [`Simd<f32, 4>`](Simd) lane group, so axis-independent
/// arithmetic over the batch needs no shuffles.
///
/// Construct a batch from `[Vec2; 4]` via [`From`]; that conversion performs the deinterleave from
/// the vectors' natural memory order. After per-axis arithmetic, reassemble a batch with
/// [`from_lanes`](Self::from_lanes).
///
/// # Examples
///
/// ```
/// # #![feature(portable_simd)]
/// use hash_graph_atlas::math::{Vec2, Vec2x4T};
///
/// let batch = Vec2x4T::from([
///     Vec2::new(1.0, 5.0),
///     Vec2::new(2.0, 6.0),
///     Vec2::new(3.0, 7.0),
///     Vec2::new(4.0, 8.0),
/// ]);
///
/// assert_eq!(batch.xs().to_array(), [1.0, 2.0, 3.0, 4.0]);
/// assert_eq!(batch.ys().to_array(), [5.0, 6.0, 7.0, 8.0]);
///
/// // Scale both axes, then repack.
/// let scaled = Vec2x4T::from_lanes(batch.xs() * Simd::splat(2.0), batch.ys() * Simd::splat(2.0));
/// assert_eq!(scaled.get(0), Vec2::new(2.0, 10.0));
/// # use core::simd::Simd;
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
pub struct Vec2x4T([f32; 8]);

impl Vec2x4T {
    /// Returns the four `x` components as SIMD lanes.
    ///
    /// Lane `i` holds the `x` component of vector `i`.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 32-byte alignment, which satisfies \
                  `Simd<f32, 4>`'s 16-byte alignment at offset 0"
    )]
    pub const fn xs(&self) -> &Simd<f32, 4> {
        let this = &raw const *self;
        let this = this.cast::<f32>();

        // SAFETY: `Self` is `repr(C)` over `[f32; 8]` whose first four elements are the `x`
        // lane group, `Simd<f32, 4>` is layout-compatible with `[f32; 4]`, and `Self`'s
        // 32-byte alignment satisfies `Simd<f32, 4>`'s; the borrow covers bytes owned by
        // `self` and inherits its lifetime.
        unsafe { &*this.cast::<Simd<f32, 4>>() }
    }

    /// Returns the four `y` components as SIMD lanes.
    ///
    /// Lane `i` holds the `y` component of vector `i`.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 32-byte alignment, which satisfies \
                  `Simd<f32, 4>`'s 16-byte alignment at the 16-byte `y` group offset"
    )]
    pub const fn ys(&self) -> &Simd<f32, 4> {
        let this = &raw const *self;
        let this = this.cast::<f32>();

        // SAFETY: elements `4..8` of `Self`'s `repr(C)` `[f32; 8]` storage are the `y` lane
        // group; the 16-byte offset from the 32-byte-aligned base satisfies `Simd<f32, 4>`'s
        // alignment, and the borrow covers bytes owned by `self` and inherits its lifetime.
        unsafe { &*this.add(4).cast::<Simd<f32, 4>>() }
    }

    /// Splits the batch into one SIMD lane group per axis.
    ///
    /// The first group holds the `x` components, the second the `y` components; lane `i` of each
    /// corresponds to vector `i`. This is the inverse of [`from_lanes`](Self::from_lanes) and the
    /// by-value counterpart of [`xs`](Self::xs) and [`ys`](Self::ys).
    #[inline]
    #[must_use]
    #[expect(
        clippy::tuple_array_conversions,
        reason = "the suggested `From` conversion is not const-callable"
    )]
    pub const fn into_lanes(self) -> (Simd<f32, 4>, Simd<f32, 4>) {
        // SAFETY: `Self` is `repr(C)` over `[f32; 8]`, the `x` lane group followed by the `y`
        // lane group, exactly `[Simd<f32, 4>; 2]`'s memory order; sizes match and every bit
        // pattern is a valid `f32`.
        let [xs, ys] = unsafe { core::mem::transmute::<Self, [Simd<f32, 4>; 2]>(self) };

        (xs, ys)
    }

    /// Assembles a batch from one SIMD lane group per axis.
    ///
    /// Lane `i` of `xs` and `ys` becomes vector `i`. This is the natural way to store results back
    /// after per-axis arithmetic.
    #[inline]
    #[must_use]
    pub const fn from_lanes(xs: Simd<f32, 4>, ys: Simd<f32, 4>) -> Self {
        let this = [xs, ys];
        // SAFETY: `[Simd<f32, 4>; 2]` lays out the `x` lane group followed by the `y` lane
        // group, exactly `Self`'s `repr(C)` `[f32; 8]` memory order; sizes match and every
        // bit pattern is a valid `f32`.
        unsafe { core::mem::transmute::<[Simd<f32, 4>; 2], Self>(this) }
    }

    /// Returns the vector at `index`.
    ///
    /// This gathers the `x` and `y` components from their axis groups. If you index vectors more
    /// often than you operate per-axis, store [`Vec2x4`] instead.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 4`.
    #[inline]
    #[must_use]
    pub const fn get(self, index: usize) -> Vec2 {
        Vec2::new(self.0[index], self.0[index + 4])
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 x1 x2 x3 y0 y1 y2 y3`. This compiles to a single
    /// full-width vector load.
    #[inline]
    #[must_use]
    pub const fn to_simd(self) -> Simd<f32, 8> {
        // SAFETY: `Self` is `repr(C)` over `[f32; 8]`, which is layout-compatible with
        // `Simd<f32, 8>` (sizes const-asserted below); every bit pattern is a valid `f32`, so
        // the reinterpretation is total.
        unsafe { core::mem::transmute::<Self, Simd<f32, 8>>(self) }
    }

    /// Returns the four pairwise dot products as SIMD lanes.
    ///
    /// Lane `i` holds `self[i] . other[i]`. On targets with native FMA the multiply-add is fused,
    /// rounding once instead of twice.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> Simd<f32, 4> {
        mul_add_f32x4(*self.xs(), *other.xs(), self.ys() * other.ys())
    }

    /// Returns the four pairwise perpendicular dot products as SIMD lanes.
    ///
    /// Lane `i` holds `self[i].perp_dot(other[i])`, with the sign semantics of [`Vec2::perp_dot`]:
    /// positive when `other`'s vector is counterclockwise from this batch's, negative when
    /// clockwise, zero when the vectors are parallel. On targets with native FMA the multiply-add
    /// is fused, rounding once instead of twice.
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> Simd<f32, 4> {
        mul_add_f32x4(*self.xs(), *other.ys(), -(self.ys() * other.xs()))
    }

    /// Returns the four pairwise squared Euclidean distances as SIMD lanes.
    ///
    /// Lane `i` holds the squared distance between `self[i]` and `other[i]`. On targets with native
    /// FMA the multiply-add is fused, rounding once instead of twice.
    #[inline]
    #[must_use]
    pub fn distance_squared(self, other: Self) -> Simd<f32, 4> {
        let dx = self.xs() - other.xs();
        let dy = self.ys() - other.ys();

        mul_add_f32x4(dx, dx, dy * dy)
    }

    /// Returns the four squared lengths as SIMD lanes.
    #[inline]
    #[must_use]
    pub fn length_squared(self) -> Simd<f32, 4> {
        self.dot(self)
    }

    /// Interleaves the batch back into natural (array-of-structures) order.
    ///
    /// One shuffle pays the layout boundary cost; the result stores whole vectors again.
    #[inline]
    #[must_use]
    pub fn transpose(self) -> Vec2x4 {
        // `[x0, x1, x2, x3, y0, y1, y2, y3]` -> `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let this = self.to_simd();
        let interleaved = simd_swizzle!(this, [0, 4, 1, 5, 2, 6, 3, 7]);

        Vec2x4::from(interleaved)
    }
}

/// Adds the batches vector-wise: entry `i` of the result is `self[i] + other[i]`.
impl Add for Vec2x4T {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::from(self.to_simd() + rhs.to_simd())
    }
}

/// Subtracts the batches vector-wise: entry `i` of the result is `self[i] - other[i]`.
impl Sub for Vec2x4T {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::from(self.to_simd() - rhs.to_simd())
    }
}

/// Negates every vector in the batch.
impl Neg for Vec2x4T {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self::from(-self.to_simd())
    }
}

/// Scales every vector in the batch uniformly.
impl Mul<f32> for Vec2x4T {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f32) -> Self {
        Self::from(self.to_simd() * Simd::splat(rhs))
    }
}

impl From<[Vec2; 4]> for Vec2x4T {
    /// Deinterleaves four vectors into structure-of-arrays order.
    #[inline]
    fn from(vecs: [Vec2; 4]) -> Self {
        let this = Vec2x4::from(vecs);
        this.transpose()
    }
}

const impl From<Simd<f32, 8>> for Vec2x4T {
    /// Reinterprets eight lanes in `x0 x1 x2 x3 y0 y1 y2 y3` order.
    #[inline]
    fn from(lanes: Simd<f32, 8>) -> Self {
        // SAFETY: `Simd<f32, 8>` is layout-compatible with `[f32; 8]`, `Self`'s `repr(C)`
        // storage (sizes const-asserted below); every bit pattern is a valid `f32`, so the
        // reinterpretation is total.
        unsafe { core::mem::transmute::<Simd<f32, 8>, Vec2x4T>(lanes) }
    }
}

const impl From<Vec2x4T> for Simd<f32, 8> {
    #[inline]
    fn from(batch: Vec2x4T) -> Self {
        batch.to_simd()
    }
}

/// Four 2D vectors packed in natural (array-of-structures) order.
///
/// The vectors are stored whole and interleaved, matching the memory layout of `[Vec2; 4]`: `x0 y0
/// x1 y1 x2 y2 x3 y3`. Packing from `[Vec2; 4]` is therefore shuffle-free, individual vectors can
/// be indexed directly, and the value is aligned for [`Simd<f32, 8>`](Simd). Use this layout when
/// operations treat vectors as whole units; for axis-independent arithmetic, convert to
/// [`Vec2x4T`].
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Vec2, Vec2x4};
///
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
    /// The middle is a run of whole batches placed where the slice meets this type's alignment;
    /// the prefix and suffix hold the points before and after it. Concatenating the three parts
    /// in order yields the input exactly, so a bulk pass processes the middle four vectors at a
    /// time and the edges one by one.
    ///
    /// Where the split falls depends on the slice's address and length, and any part may be
    /// empty; only performance may depend on the middle's size, never correctness.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Vec2, Vec2x4};
    ///
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
    /// Lane `i` of `xs` and `ys` becomes vector `i`. One shuffle interleaves the axis groups
    /// into natural order; to keep results in axis groups, use [`Vec2x4T::from_lanes`].
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
    /// Panics if `index >= 4`.
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
    /// NaN components lose: when exactly one operand is NaN in a component, the other operand's
    /// component is returned, following [`f32::min`].
    #[inline]
    #[must_use]
    pub fn min(self, other: Self) -> Self {
        Self::from(self.to_simd().simd_min(other.to_simd()))
    }

    /// Returns the component-wise maximum of the two batches.
    ///
    /// NaN components lose: when exactly one operand is NaN in a component, the other operand's
    /// component is returned, following [`f32::max`].
    #[inline]
    #[must_use]
    pub fn max(self, other: Self) -> Self {
        Self::from(self.to_simd().simd_max(other.to_simd()))
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
    /// One shuffle pays the layout boundary cost; the result exposes the axis lane groups for
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

impl From<Vec2x4> for Vec2x4T {
    /// Deinterleaves an array-of-structures batch by axis.
    #[inline]
    fn from(batch: Vec2x4) -> Self {
        batch.transpose()
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
    /// Panics if `index >= 4`.
    #[inline]
    fn index(&self, index: usize) -> &Vec2 {
        &self.0[index]
    }
}

// Both batch layouts must be usable as backing storage for `Simd<f32, 8>`:
// identical size, and at least its alignment. `Simd`'s alignment is
// target-dependent (it can be below 32 on targets without 256-bit vectors),
// so the alignment check is a lower bound rather than an equality.
// The lane views borrow `Simd<f32, 4>` groups at offsets 0 and 16, so the half-width
// alignment must not exceed the offset.
const _: () = assert!(align_of::<Simd<f32, 4>>() <= 16);
const _: () = assert!(size_of::<Vec2x4T>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(size_of::<Vec2x4>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4T>() >= align_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4>() >= align_of::<Simd<f32, 8>>());
