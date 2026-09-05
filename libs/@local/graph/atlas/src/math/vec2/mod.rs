//! 2D vectors and fixed-size batches of them for SIMD processing.
//!
//! The scalar type is [`Vec2`]. Vectorized code packs four vectors into one of two batch types,
//! both 32 bytes and both aligned for [`Simd<f32, 8>`](core::simd::Simd):
//!
//! - [`Vec2x4`] stores the vectors interleaved as `x0 y0 x1 y1 ...`, the natural memory order of
//!   `[Vec2; 4]`, so packing needs no shuffle and [`Vec2x4::get`] reads an individual vector.
//! - [`Vec2x4T`] is the transposed layout: all four `x` components followed by all four `y`
//!   components. Use this when an operation treats the axes independently, such as distances,
//!   bounding boxes, or axis-wise clamping: [`Vec2x4T::xs`] and [`Vec2x4T::ys`] each yield a full
//!   [`Simd<f32, 4>`](core::simd::Simd) lane group, so per-axis arithmetic runs without shuffles.
//!
//! Converting `[Vec2; 4]` into [`Vec2x4T`] performs the deinterleave at that boundary, which is the
//! usual tradeoff: pay the shuffle once on entry and keep the hot loop axis-parallel.
//!
//! A borrowed point slice splits in place into batches via [`Vec2x4::from_slice`]: a bulk pass then
//! walks the aligned middle four vectors at a time and the unaligned edges one vector at a time, so
//! bulk passes over `&[Vec2]` vectorize without copying.
//!
//! Because both batch types match [`Simd<f32, 8>`](core::simd::Simd) in size and meet its
//! alignment, [`to_simd`](Vec2x4T::to_simd) and the [`From`] conversions compile to a single
//! full-width vector load or store, with no intermediate copy and no split-load penalty.

mod interleaved;
#[cfg(test)]
mod tests;
mod transposed;

use core::ops::{Add, AddAssign, Div, DivAssign, Index, Mul, MulAssign, Neg, Sub, SubAssign};

use zerocopy::{FromBytes as _, IntoBytes as _};

pub(crate) use self::{interleaved::Vec2x4, transposed::Vec2x4T};
use super::{DVec2x4T, NonNegative, dvec2::DVec2, scalar::DNonNegative};

/// A vector in 2D space with `f32` components.
///
/// A [`Vec2`] guarantees the same layout as `[f32; 2]`, with the `x` component first. This makes
/// `[Vec2; N]` bit-compatible with a flat component buffer in interleaved order, and the zerocopy
/// derives expose that reinterpretation without unsafe code.
///
/// Note that [`Hash`] hashes the raw bytes while equality follows `f32` semantics, so `-0.0` and
/// `0.0` compare equal but hash differently.
///
/// # Examples
///
/// ```ignore
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
    /// Vector `i` of the returned slice occupies components `2 · i` and `2 · i + 1`, so a row-major
    /// `f32[T, 2]` matrix reads as its `T` points without copying.
    ///
    /// Returns [`None`] unless the length is a whole number of vectors.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let components = [1.0, 2.0, 3.0, 4.0];
    /// let points = Vec2::from_slice(&components).expect("two whole vectors");
    /// assert_eq!(points, [Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)]);
    /// assert!(Vec2::from_slice(&components[..3]).is_none());
    /// ```
    #[must_use]
    pub fn from_slice(components: &[f32]) -> Option<&[Self]> {
        // The cast is checked: `Self` is `FromBytes`, `IntoBytes`, and `KnownLayout` over
        // `[f32; 2]`, so the byte view reinterprets element-wise with identical layout, and
        // an odd component count fails the conversion's size check.
        <[Self]>::ref_from_bytes(components.as_bytes()).ok()
    }

    /// Wraps a mutable borrowed slice in place as consecutive vectors.
    ///
    /// The mutable counterpart of [`Vec2::from_slice`], with the same component layout. A
    /// write through a returned vector rewrites its two components where they stand, so a
    /// row-major `f32[T, 2]` matrix mutates as its `T` points without copying.
    ///
    /// Returns [`None`] unless the length is a whole number of vectors.
    #[must_use]
    pub fn from_slice_mut(components: &mut [f32]) -> Option<&mut [Self]> {
        // The cast is checked: `Self` is `FromBytes`, `IntoBytes`, and `KnownLayout` over
        // `[f32; 2]`, so the byte view reinterprets element-wise with identical layout, and
        // the returned borrow inherits the input's exclusive lifetime.
        <[Self]>::mut_from_bytes(components.as_mut_bytes()).ok()
    }

    /// Returns the components as an array in `x`, `y` order.
    #[must_use]
    pub const fn as_array(&self) -> &[f32; 2] {
        &self.0
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
    /// The sign tells which side of `self` the other vector lies on. The result is positive when
    /// `other` is counterclockwise from `self`, negative when clockwise, and zero when the vectors
    /// are parallel.
    #[inline]
    #[must_use]
    pub const fn perp_dot(self, other: Self) -> f32 {
        self.x() * other.y() - self.y() * other.x()
    }

    /// Returns the squared length of the vector.
    ///
    /// Prefer this over [`length`](Self::length) when comparing magnitudes or feeding a squared
    /// metric. This avoids the square root.
    ///
    /// Overflow escapes to `+∞` and asserts in debug builds, mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) const fn length_squared(self) -> NonNegative {
        NonNegative::square(self.x()) + NonNegative::square(self.y())
    }

    /// Returns the length of the vector.
    #[inline]
    #[must_use]
    pub(crate) fn length(self) -> NonNegative {
        self.length_squared().sqrt()
    }

    /// Returns the squared Euclidean distance to `other`.
    ///
    /// Never NaN and never negative for finite points. Overflow escapes to `+∞` and asserts in
    /// debug builds, mirroring integer `+`.
    #[inline]
    #[must_use]
    pub(crate) const fn distance_squared(self, other: Self) -> NonNegative {
        let dx = self.x() - other.x();
        let dy = self.y() - other.y();

        NonNegative::square(dx) + NonNegative::square(dy)
    }

    /// Returns the Euclidean distance to `other`.
    ///
    /// The square root of [`distance_squared`](Self::distance_squared), and it carries the same
    /// escape contract: an escaped `+∞` survives the root.
    #[inline]
    #[must_use]
    pub(crate) fn distance(self, other: Self) -> NonNegative {
        self.distance_squared(other).sqrt()
    }

    /// Returns the squared Euclidean distance to `other`, accumulated in `f64`.
    ///
    /// Both points widen exactly before the subtraction, so the reading carries no `f32`
    /// arithmetic, and every operation rounds separately. This is the one metric of the
    /// k-nearest-neighbour readouts: a consumer that compares its own readings against a
    /// readout's computes them here, so tie sets never depend on the call site.
    ///
    /// A squared distance of finite points is finite and non-negative, so the reading returns
    /// as [`DNonNegative`]. Finite inputs are the caller's contract.
    #[inline]
    #[must_use]
    pub(crate) const fn distance_squared_wide(self, other: Self) -> DNonNegative {
        // In domain with no check: each widened coordinate difference of finite `f32` points
        // stays below 2¹³⁰ and the sum of their squares below 2²⁶¹, far from `f64` overflow. A
        // sum of squares is non-negative. The `new_unchecked` debug assert catches a non-finite
        // input.
        DNonNegative::new_unchecked(DVec2::from(self).distance_squared(DVec2::from(other)))
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
    /// NaN components lose. When exactly one operand is NaN in a component, the result takes the
    /// other operand's component, following [`f32::min`].
    #[inline]
    #[must_use]
    pub const fn min(self, other: Self) -> Self {
        Self::new(self.x().min(other.x()), self.y().min(other.y()))
    }

    /// Returns the component-wise maximum of the two vectors.
    ///
    /// NaN components lose. When exactly one operand is NaN in a component, the result takes the
    /// other operand's component, following [`f32::max`].
    #[inline]
    #[must_use]
    pub const fn max(self, other: Self) -> Self {
        Self::new(self.x().max(other.x()), self.y().max(other.y()))
    }

    /// Returns the component-wise absolute value.
    #[inline]
    #[must_use]
    pub const fn abs(self) -> Self {
        Self::new(self.x().abs(), self.y().abs())
    }

    /// Clamps each component into the range spanned by `low` and `high`.
    ///
    /// # Panics
    ///
    /// This panics when a component of `low` exceeds the matching component of `high`, or when a
    /// bound is NaN, following [`f32::clamp`]. The check runs in every build profile.
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

/// Component-wise (Hadamard) product.
///
/// For the scalar product, use [`Vec2::dot`].
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

const impl Div<NonNegative> for Vec2 {
    type Output = Self;

    #[inline]
    fn div(self, rhs: NonNegative) -> Self {
        Self::new(self.x() / rhs.get(), self.y() / rhs.get())
    }
}

const impl DivAssign<NonNegative> for Vec2 {
    #[inline]
    fn div_assign(&mut self, rhs: NonNegative) {
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
    /// This panics when `index ≥ 2`.
    #[inline]
    fn index(&self, index: usize) -> &f32 {
        &self.0[index]
    }
}

/// The SIMD views of a point slice, each splitting the batches from the scalar rest.
pub(crate) trait Vec2SliceExt {
    /// Views the slice as aligned interleaved batches between a prefix and a suffix.
    ///
    /// The batches reinterpret the slice's own bytes in place, and the prefix and suffix
    /// carry the misaligned ends.
    fn as_interleaved(&self) -> (&[Vec2], &[Vec2x4], &[Vec2]);

    /// Iterates transposed four-point batches, beside the scalar remainder.
    ///
    /// Each batch gathers four consecutive points into lane-major form, and the remainder
    /// carries the trailing points a batch cannot fill.
    fn iter_transposed(
        &self,
    ) -> (
        impl DoubleEndedIterator<Item = Vec2x4T> + ExactSizeIterator + Clone,
        &[Vec2],
    );

    /// Iterates transposed four-point batches widened to double precision, beside the widened
    /// scalar remainder.
    ///
    /// The widening is exact for every finite `f32` component, so a double-precision
    /// accumulation over the batches reads the same points the slice stores.
    fn iter_transposed_wide(
        &self,
    ) -> (
        impl DoubleEndedIterator<Item = DVec2x4T> + ExactSizeIterator + Clone,
        impl DoubleEndedIterator<Item = DVec2> + ExactSizeIterator + Clone,
    );
}

impl Vec2SliceExt for [Vec2] {
    #[inline]
    fn as_interleaved(&self) -> (&[Vec2], &[Vec2x4], &[Vec2]) {
        Vec2x4::from_slice(self)
    }

    #[inline]
    fn iter_transposed(
        &self,
    ) -> (
        impl DoubleEndedIterator<Item = Vec2x4T> + ExactSizeIterator + Clone,
        &[Vec2],
    ) {
        let (fit, remaining) = self.as_chunks::<4>();

        (fit.iter().copied().map(From::from), remaining)
    }

    #[inline]
    fn iter_transposed_wide(
        &self,
    ) -> (
        impl DoubleEndedIterator<Item = DVec2x4T> + ExactSizeIterator + Clone,
        impl DoubleEndedIterator<Item = DVec2> + ExactSizeIterator + Clone,
    ) {
        let (fit, remaining) = self.as_chunks::<4>();

        (
            fit.iter().copied().map(From::from),
            remaining.iter().copied().map(From::from),
        )
    }
}
