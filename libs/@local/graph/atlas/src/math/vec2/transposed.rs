//! The transposed (structure-of-arrays) batch of four 2D vectors.
//!
//! Each axis's four-component lane group supports per-axis arithmetic without shuffles. Conversion
//! from natural order performs the deinterleave once.

use core::{
    ops::{Add, Mul, Neg, Sub},
    simd::Simd,
};
use std::simd::simd_swizzle;

use super::{Vec2, Vec2x4};
use crate::math::{
    dvec2::DVec2x4T,
    kernel::{mul_add_f32x4, mul_add_f64x4},
    scalar::DNonNegative,
};

/// Four 2D vectors packed in transposed (structure-of-arrays) order.
///
/// Storage places all four `x` values before all four `y` values: `x0 x1 x2 x3 y0 y1 y2 y3`. The
/// value is aligned for [`Simd<f32, 8>`](Simd). [`xs`](Self::xs) and [`ys`](Self::ys) each return a
/// full [`Simd<f32, 4>`](Simd) lane group for axis-independent arithmetic without shuffles.
///
/// Construct a batch from `[Vec2; 4]` via [`From`] to deinterleave the vectors' natural memory
/// order. After per-axis arithmetic, reassemble a batch with [`from_lanes`](Self::from_lanes).
/// Arithmetic operators act component-wise, with scalar multiplication scaling every component.
///
/// # Example
///
/// This in-crate example is ignored because the module is private and uses nightly portable SIMD.
///
/// ```ignore
/// # #![feature(portable_simd)]
/// use core::simd::Simd;
///
/// use crate::math::{Vec2, Vec2x4T};
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
    /// Creates a batch holding four copies of `value`.
    pub const fn splat(value: Vec2) -> Self {
        Self([
            value.x(),
            value.x(),
            value.x(),
            value.x(),
            value.y(),
            value.y(),
            value.y(),
            value.y(),
        ])
    }

    /// Assembles a batch from one SIMD lane group per axis.
    ///
    /// Lane `i` of `xs` and `ys` becomes vector `i`. This is the natural way to store results back
    /// after per-axis arithmetic.
    #[inline]
    #[must_use]
    pub const fn from_lanes(xs: Simd<f32, 4>, ys: Simd<f32, 4>) -> Self {
        let this = [xs, ys];
        // SAFETY: the cast relies on each four-lane Simd having its array element layout. The
        // source array places the initialized x group before the y group, matching Self's f32
        // array. The transmute checks equal sizes and Self has no additional validity constraints.
        // Under that SIMD layout contract, the resulting batch is valid.
        unsafe { core::mem::transmute::<[Simd<f32, 4>; 2], Self>(this) }
    }

    /// Returns the four `x` components as SIMD lanes.
    ///
    /// Lane `i` holds the `x` component of vector `i`.
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 32-byte alignment, which satisfies \
                  `Simd<f32, 4>`'s 16-byte alignment at offset 0"
    )]
    #[inline]
    #[must_use]
    pub const fn xs(&self) -> &Simd<f32, 4> {
        let this = &raw const *self;
        let this = this.cast::<f32>();

        // SAFETY: the reference relies on Simd's array element layout. Self's first four f32
        // elements are initialized, and its 32-byte alignment meets the half-width alignment bound
        // checked below. The pointer retains self's provenance and shared borrow lifetime. Under
        // that SIMD layout contract, the x group is valid for the returned shared reference.
        unsafe { &*this.cast::<Simd<f32, 4>>() }
    }

    /// Returns the four `y` components as SIMD lanes.
    ///
    /// Lane `i` holds the `y` component of vector `i`.
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 32-byte alignment, which satisfies \
                  `Simd<f32, 4>`'s 16-byte alignment at the 16-byte `y` group offset"
    )]
    #[inline]
    #[must_use]
    pub const fn ys(&self) -> &Simd<f32, 4> {
        let this = &raw const *self;
        let this = this.cast::<f32>();

        // SAFETY: the reference relies on Simd's array element layout. Adding four f32 elements
        // stays within self's allocation and selects its initialized y group. The 16-byte offset
        // from a 32-byte-aligned base meets the half-width alignment bound checked below. The
        // pointer retains self's provenance and shared borrow lifetime. Under that SIMD layout
        // contract, the y group is valid for the returned shared reference.
        unsafe { &*this.add(4).cast::<Simd<f32, 4>>() }
    }

    /// Splits the batch into one SIMD lane group per axis.
    ///
    /// The first group holds the `x` components, the second the `y` components. Lane `i` of each
    /// corresponds to vector `i`. This is the inverse of [`from_lanes`](Self::from_lanes) and the
    /// by-value counterpart of [`xs`](Self::xs) and [`ys`](Self::ys).
    #[expect(
        clippy::tuple_array_conversions,
        reason = "the suggested `From` conversion is not const-callable"
    )]
    #[inline]
    #[must_use]
    pub const fn into_lanes(self) -> (Simd<f32, 4>, Simd<f32, 4>) {
        // SAFETY: the cast relies on each four-lane Simd having its array element layout. Self
        // contains the initialized x group followed by the y group, without padding. The transmute
        // checks equal sizes. Under that SIMD layout contract, both groups are valid as the
        // returned SIMD values.
        let [xs, ys] = unsafe { core::mem::transmute::<Self, [Simd<f32, 4>; 2]>(self) };

        (xs, ys)
    }

    /// Returns the vector at `index`.
    ///
    /// This gathers the `x` and `y` components from their axis groups. If you index vectors more
    /// often than you operate per-axis, store [`Vec2x4`] instead.
    ///
    /// # Panics
    ///
    /// This panics when `index ≥ 4`.
    #[inline]
    #[must_use]
    pub const fn get(self, index: usize) -> Vec2 {
        Vec2::new(self.0[index], self.0[index + 4])
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 x1 x2 x3 y0 y1 y2 y3`.
    #[inline]
    #[must_use]
    pub const fn to_simd(self) -> Simd<f32, 8> {
        // SAFETY: the cast relies on Simd's contiguous array element layout. Self contains eight
        // initialized f32 lanes without padding, and equal sizes are checked below. Under that SIMD
        // layout contract, these bytes are valid as the returned SIMD value.
        unsafe { core::mem::transmute::<Self, Simd<f32, 8>>(self) }
    }

    /// Returns the four pairwise dot products as SIMD lanes.
    ///
    /// Lane `i` approximates the dot product of the batches' `i`-th vectors. The y product rounds
    /// first, then the x product and addition are fused with one rounding, including on targets
    /// without native FMA. This can differ from [`Vec2::dot`]'s separate roundings.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> Simd<f32, 4> {
        mul_add_f32x4(*self.xs(), *other.xs(), self.ys() * other.ys())
    }

    /// Returns the four pairwise perpendicular dot products as SIMD lanes.
    ///
    /// # Numerical guarantees
    ///
    /// Each lane follows [`Vec2::perp_dot`]'s numerical contract.
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> Simd<f32, 4> {
        self.xs() * other.ys() - self.ys() * other.xs()
    }

    /// Returns the four pairwise perpendicular dot products rounded to `f64`.
    ///
    /// # Numerical guarantees
    ///
    /// Each lane follows [`Vec2::perp_dot_wide`]'s numerical contract.
    #[inline]
    #[must_use]
    pub fn perp_dot_wide(self, other: Self) -> Simd<f64, 4> {
        let this = DVec2x4T::from(self);
        let other = DVec2x4T::from(other);

        mul_add_f64x4(*this.xs(), *other.ys(), -(this.ys() * other.xs()))
    }

    /// Returns the four pairwise squared Euclidean distances as SIMD lanes.
    ///
    /// Lane `i` approximates the squared distance between the batches' `i`-th vectors. Coordinate
    /// differences and the squared y difference round first, then the squared x difference and
    /// addition are fused with one rounding. Finite coordinates can still overflow during the
    /// calculation.
    #[inline]
    #[must_use]
    pub fn distance_squared(self, other: Self) -> Simd<f32, 4> {
        let dx = self.xs() - other.xs();
        let dy = self.ys() - other.ys();

        mul_add_f32x4(dx, dx, dy * dy)
    }

    /// Returns the four pairwise squared Euclidean distances, accumulated in `f64`.
    ///
    /// # Numerical guarantees
    ///
    /// Both batches must contain finite points. Each lane matches [`Vec2::distance_squared_wide`]
    /// for the corresponding pair.
    #[inline]
    #[must_use]
    pub(crate) fn distance_squared_wide(self, other: Self) -> [DNonNegative; 4] {
        let readings = DVec2x4T::from(self).distance_squared(DVec2x4T::from(other));

        <[f64; 4]>::from(readings).map(|reading| {
            // Finite f32 coordinates give f64 differences of magnitude at most 2¹²⁹. The squared
            // sum is non-negative and at most 2²⁵⁹, within f64's range. Therefore each reading
            // satisfies DNonNegative's domain.
            DNonNegative::new_unchecked(reading)
        })
    }

    /// Returns the four squared lengths as SIMD lanes.
    #[inline]
    #[must_use]
    pub fn length_squared(self) -> Simd<f32, 4> {
        self.dot(self)
    }

    /// Interleaves the batch back into natural (array-of-structures) order.
    ///
    /// The result stores each vector's x and y components consecutively.
    #[inline]
    #[must_use]
    pub fn transpose(self) -> Vec2x4 {
        // `[x0, x1, x2, x3, y0, y1, y2, y3]` -> `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let this = self.to_simd();
        let interleaved = simd_swizzle!(this, [0, 4, 1, 5, 2, 6, 3, 7]);

        Vec2x4::from(interleaved)
    }
}

impl Add for Vec2x4T {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::from(self.to_simd() + rhs.to_simd())
    }
}

impl Sub for Vec2x4T {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::from(self.to_simd() - rhs.to_simd())
    }
}

impl Neg for Vec2x4T {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self::from(-self.to_simd())
    }
}

impl Mul<f32> for Vec2x4T {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f32) -> Self {
        Self::from(self.to_simd() * Simd::splat(rhs))
    }
}

impl From<[Vec2; 4]> for Vec2x4T {
    #[inline]
    fn from(vecs: [Vec2; 4]) -> Self {
        let this = Vec2x4::from(vecs);
        this.transpose()
    }
}

const impl From<Simd<f32, 8>> for Vec2x4T {
    #[inline]
    fn from(lanes: Simd<f32, 8>) -> Self {
        // SAFETY: the cast relies on Simd's contiguous array element layout. Self contains eight
        // f32 components in lane order, with no additional validity constraints, and equal sizes
        // are checked below. Under that SIMD layout contract, the initialized lanes are valid as a
        // batch.
        unsafe { core::mem::transmute::<Simd<f32, 8>, Vec2x4T>(lanes) }
    }
}

const impl From<Vec2x4T> for Simd<f32, 8> {
    #[inline]
    fn from(batch: Vec2x4T) -> Self {
        batch.to_simd()
    }
}

impl From<Vec2x4> for Vec2x4T {
    #[inline]
    fn from(batch: Vec2x4) -> Self {
        batch.transpose()
    }
}

// The batch must match `Simd<f32, 8>`'s size and meet its alignment, supplied by `align(32)`.
// Borrowed `Simd<f32, 4>` groups begin at byte offsets 0 and 16. Their alignment must not exceed 16
// bytes to keep both group addresses aligned.
const _: () = assert!(align_of::<Simd<f32, 4>>() <= 16);
const _: () = assert!(size_of::<Vec2x4T>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4T>() >= align_of::<Simd<f32, 8>>());
