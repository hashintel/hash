//! The transposed (structure-of-arrays) batch of four 2D vectors.
//!
//! This layout exists for axis-independent arithmetic. Each axis's four components form one
//! lane group, so per-axis operations run without shuffles in the hot loop, and the
//! deinterleave from natural order is paid once at conversion.

use core::{
    ops::{Add, Mul, Neg, Sub},
    simd::Simd,
};
use std::simd::simd_swizzle;

use super::{Vec2, Vec2x4};
use crate::math::{dvec2::DVec2x4T, kernel::mul_add_f32x4, scalar::DNonNegative};

/// Four 2D vectors packed in transposed (structure-of-arrays) order.
///
/// Storage places all four `x` values before all four `y` values: `x0 x1 x2 x3 y0 y1 y2 y3`. The
/// value is aligned for [`Simd<f32, 8>`](Simd), and [`xs`](Self::xs) and [`ys`](Self::ys) each
/// return a full [`Simd<f32, 4>`](Simd) lane group, so axis-independent arithmetic over the batch
/// needs no shuffles.
///
/// Construct a batch from `[Vec2; 4]` via [`From`]; that conversion performs the deinterleave from
/// the vectors' natural memory order. After per-axis arithmetic, reassemble a batch with
/// [`from_lanes`](Self::from_lanes).
///
/// # Examples
///
/// ```ignore
/// # #![feature(portable_simd)]
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
    /// Replicates a `Vec2` value across all lanes of `Self`.
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
        // SAFETY: `[Simd<f32, 4>; 2]` lays out the `x` lane group followed by the `y` lane
        // group, exactly `Self`'s `repr(C)` `[f32; 8]` memory order; sizes match and every
        // bit pattern is a valid `f32`.
        unsafe { core::mem::transmute::<[Simd<f32, 4>; 2], Self>(this) }
    }

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
    /// The first group holds the `x` components, the second the `y` components. Lane `i` of each
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
    /// Lane `i` holds the dot product of the batches' `i`-th vectors. On targets with native FMA
    /// one instruction performs the multiply-add, rounding once instead of twice.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> Simd<f32, 4> {
        mul_add_f32x4(*self.xs(), *other.xs(), self.ys() * other.ys())
    }

    /// Returns the four pairwise perpendicular dot products as SIMD lanes.
    ///
    /// Lane `i` holds the perpendicular dot product of the batches' `i`-th vectors, with the sign
    /// semantics of [`Vec2::perp_dot`]: the lane is positive when `other`'s vector is
    /// counterclockwise from this batch's and negative when clockwise. Parallel vectors yield zero.
    /// On targets with native FMA one instruction performs the multiply-add, rounding once instead
    /// of twice.
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> Simd<f32, 4> {
        mul_add_f32x4(*self.xs(), *other.ys(), -(self.ys() * other.xs()))
    }

    /// Returns the four pairwise squared Euclidean distances as SIMD lanes.
    ///
    /// Lane `i` holds the squared distance between the batches' `i`-th vectors. On targets with
    /// native FMA one instruction performs the multiply-add, rounding once instead of twice.
    #[inline]
    #[must_use]
    pub fn distance_squared(self, other: Self) -> Simd<f32, 4> {
        let dx = self.xs() - other.xs();
        let dy = self.ys() - other.ys();

        mul_add_f32x4(dx, dx, dy * dy)
    }

    /// Returns the four pairwise squared Euclidean distances, accumulated in `f64`.
    ///
    /// Reading `i` equals `self[i].distance_squared_wide(other[i])` bit for bit: the widened
    /// lanes subtract, square, and sum with the scalar metric's separate roundings, so a lane
    /// readout and a scalar readout select the same rows under the same ties. Unlike
    /// [`distance_squared`](Self::distance_squared), nothing fuses. Finite inputs are the
    /// caller's contract, as for the scalar form.
    #[inline]
    #[must_use]
    pub(crate) fn distance_squared_wide(self, other: Self) -> [DNonNegative; 4] {
        let readings = DVec2x4T::from(self).distance_squared(DVec2x4T::from(other));

        <[f64; 4]>::from(readings).map(|reading| {
            // In domain with no check: the scalar metric's own bound applies per component, and
            // a sum of squares is non-negative.
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
    /// One shuffle pays the layout boundary cost. The result stores whole vectors again.
    #[inline]
    #[must_use]
    pub fn transpose(self) -> Vec2x4 {
        // `[x0, x1, x2, x3, y0, y1, y2, y3]` -> `[x0, y0, x1, y1, x2, y2, x3, y3]`
        let this = self.to_simd();
        let interleaved = simd_swizzle!(this, [0, 4, 1, 5, 2, 6, 3, 7]);

        Vec2x4::from(interleaved)
    }
}

/// Adds the batches vector-wise: the result's `i`-th vector is the sum of the operands' `i`-th
/// vectors.
impl Add for Vec2x4T {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::from(self.to_simd() + rhs.to_simd())
    }
}

/// Subtracts the batches vector-wise: the result's `i`-th vector is the difference of the operands'
/// `i`-th vectors.
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

impl From<Vec2x4> for Vec2x4T {
    /// Deinterleaves an array-of-structures batch by axis.
    #[inline]
    fn from(batch: Vec2x4) -> Self {
        batch.transpose()
    }
}

// The batch must be usable as backing storage for `Simd<f32, 8>`, which requires identical size
// and at least its alignment. The `align(32)` supplies that alignment. The lane views borrow
// `Simd<f32, 4>` groups at byte offsets 0 and 16, so the half-width alignment must not exceed 16.
const _: () = assert!(align_of::<Simd<f32, 4>>() <= 16);
const _: () = assert!(size_of::<Vec2x4T>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4T>() >= align_of::<Simd<f32, 8>>());
