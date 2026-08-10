//! Double-precision 2D vectors for accumulation.

use core::{
    ops::{Add, AddAssign, Div, Mul, Sub},
    simd::{Simd, num::SimdFloat as _},
};

use super::{
    dvecn::DVecN,
    kernel::mul_add_f64x4,
    scalar::narrow_f32,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// A 2D vector of `f64` components, for accumulating over [`Vec2`] data.
///
/// A [`DVec2`] is the double-precision accumulator twin of [`Vec2`]: sums of weighted points,
/// centroids, and moment corrections live here while a reduction runs, then narrow back to the
/// working precision once at the end via [`narrow`](Self::narrow). Widening a [`Vec2`] through
/// [`From`] is exact for every value, so per-component products of widened inputs carry no `f32`
/// rounding.
///
/// The surface is the accumulator's own: arithmetic, the two products, and the exact widening and
/// checked narrowing conversions. Geometry (interpolation, clamping, bounds) belongs to [`Vec2`].
///
/// # Examples
///
/// ```ignore
/// // Accumulate a weighted centroid in double precision.
/// let points = [Vec2::new(1.0, 2.0), Vec2::new(3.0, -2.0)];
/// let mut sum = DVec2::ZERO;
/// let mut weight = 0.0_f64;
/// for (point, w) in points.into_iter().zip([0.25_f64, 0.75]) {
///     sum += DVec2::from(point) * w;
///     weight += w;
/// }
///
/// let centroid = (sum / weight).narrow().expect("the centroid is finite");
/// assert_eq!(centroid, Vec2::new(2.5, -1.0));
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
pub struct DVec2([f64; 2]);

impl DVec2 {
    /// The vector with both components zero.
    pub const ZERO: Self = Self([0.0, 0.0]);

    /// Creates a vector from its `x` and `y` components.
    #[inline]
    #[must_use]
    pub const fn new(x: f64, y: f64) -> Self {
        Self([x, y])
    }

    /// Returns the `x` component.
    #[inline]
    #[must_use]
    pub const fn x(self) -> f64 {
        self.0[0]
    }

    /// Returns the `y` component.
    #[inline]
    #[must_use]
    pub const fn y(self) -> f64 {
        self.0[1]
    }

    /// Returns the dot product of the two vectors.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> f64 {
        self.x().mul_add(other.x(), self.y() * other.y())
    }

    /// Returns the perpendicular dot product, the `z` component of the 3D cross product.
    ///
    /// The sign semantics match [`Vec2::perp_dot`].
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> f64 {
        self.x().mul_add(other.y(), -(self.y() * other.x()))
    }

    /// Returns the squared Euclidean length of the vector.
    #[inline]
    #[must_use]
    pub fn norm_squared(self) -> f64 {
        self.dot(self)
    }

    /// Returns the squared Euclidean distance to `other`.
    #[inline]
    #[must_use]
    pub const fn distance_squared(self, other: Self) -> f64 {
        let dx = self.x() - other.x();
        let dy = self.y() - other.y();

        dx * dx + dy * dy
    }

    /// Returns `self * factor + accumulator` with one rounding per component.
    #[inline]
    #[must_use]
    pub const fn mul_add(self, factor: f64, accumulator: Self) -> Self {
        Self::new(
            self.x().mul_add(factor, accumulator.x()),
            self.y().mul_add(factor, accumulator.y()),
        )
    }

    /// Narrows both components to the working precision.
    ///
    /// Returns [`None`] when either component leaves the finite `f32` range, following
    /// [`narrow_f32`].
    #[inline]
    #[must_use]
    pub const fn narrow(self) -> Option<Vec2> {
        let Some(x) = narrow_f32(self.x()) else {
            return None;
        };
        let Some(y) = narrow_f32(self.y()) else {
            return None;
        };

        Some(Vec2::new(x, y))
    }
}

/// Widens both components.
///
/// The conversion is exact for every [`Vec2`].
const impl From<Vec2> for DVec2 {
    #[inline]
    fn from(vec: Vec2) -> Self {
        Self::new(f64::from(vec.x()), f64::from(vec.y()))
    }
}

const impl Add for DVec2 {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::new(self.x() + rhs.x(), self.y() + rhs.y())
    }
}

const impl AddAssign for DVec2 {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl Sub for DVec2 {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.x() - rhs.x(), self.y() - rhs.y())
    }
}

const impl Mul<f64> for DVec2 {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f64) -> Self {
        Self::new(self.x() * rhs, self.y() * rhs)
    }
}

const impl Div<f64> for DVec2 {
    type Output = Self;

    #[inline]
    fn div(self, rhs: f64) -> Self {
        Self::new(self.x() / rhs, self.y() / rhs)
    }
}

/// Four double-precision 2D vectors packed in transposed (structure-of-arrays) order.
///
/// The `f64` twin of [`Vec2x4T`]: all four `x` values followed by all four `y` values, aligned for
/// [`Simd<f64, 8>`](Simd). The surface is fold-shaped - widen a [`Vec2x4T`] batch through [`From`]
/// (exact for every component), form lane-wise products, accumulate with
/// [`mul_add`](Self::mul_add), and terminally [`reduce`](Self::reduce) to a [`DVec2`] - because the
/// type exists for double-precision moment accumulation over batches of working-precision points.
///
/// # Examples
///
/// ```ignore
/// # #![feature(portable_simd)]
/// # use core::simd::Simd;
///
/// let batch = DVec2x4T::from(Vec2x4T::from([
///     Vec2::new(1.0, 5.0),
///     Vec2::new(2.0, 6.0),
///     Vec2::new(3.0, 7.0),
///     Vec2::new(4.0, 8.0),
/// ]));
///
/// // Accumulate the weighted sum per lane, then reduce once.
/// let weighted = batch.mul_add(Simd::splat(0.5), DVec2x4T::ZERO);
/// assert_eq!(weighted.reduce(), DVec2::new(5.0, 13.0));
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
#[repr(C, align(64))]
pub struct DVec2x4T([f64; 8]);

impl DVec2x4T {
    /// The batch of four zero vectors: the accumulation identity.
    pub const ZERO: Self = Self([0.0; 8]);

    /// Creates a batch holding four copies of `vec`.
    ///
    /// Every lane of the `x` group holds `vec.x()` and every lane of the `y` group holds
    /// `vec.y()`, so one point compares against a whole batch lane-wise.
    #[inline]
    #[must_use]
    pub const fn splat(vec: DVec2) -> Self {
        let x = vec.x();
        let y = vec.y();

        Self([x, x, x, x, y, y, y, y])
    }

    /// Returns the four `x` components as SIMD lanes.
    ///
    /// Lane `i` holds the `x` component of vector `i`.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 64-byte alignment, which satisfies \
                  `Simd<f64, 4>`'s alignment at offset 0"
    )]
    pub const fn xs(&self) -> &Simd<f64, 4> {
        let this = &raw const *self;
        let this = this.cast::<f64>();

        // SAFETY: `Self` is `repr(C)` over `[f64; 8]` whose first four elements are the `x`
        // lane group, `Simd<f64, 4>` is layout-compatible with `[f64; 4]`, and `Self`'s
        // 64-byte alignment satisfies `Simd<f64, 4>`'s (const-asserted below); the borrow
        // covers bytes owned by `self` and inherits its lifetime.
        unsafe { &*this.cast::<Simd<f64, 4>>() }
    }

    /// Returns the four `y` components as SIMD lanes.
    ///
    /// Lane `i` holds the `y` component of vector `i`.
    #[inline]
    #[must_use]
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 64-byte alignment, which satisfies \
                  `Simd<f64, 4>`'s alignment at the 32-byte `y` group offset"
    )]
    pub const fn ys(&self) -> &Simd<f64, 4> {
        let this = &raw const *self;
        let this = this.cast::<f64>();

        // SAFETY: elements `4..8` of `Self`'s `repr(C)` `[f64; 8]` storage are the `y` lane
        // group; the 32-byte offset from the 64-byte-aligned base satisfies `Simd<f64, 4>`'s
        // alignment (const-asserted below), and the borrow covers bytes owned by `self` and
        // inherits its lifetime.
        unsafe { &*this.add(4).cast::<Simd<f64, 4>>() }
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
    pub const fn into_lanes(self) -> (Simd<f64, 4>, Simd<f64, 4>) {
        // SAFETY: `Self` is `repr(C)` over `[f64; 8]`, the `x` lane group followed by the `y`
        // lane group, exactly `[Simd<f64, 4>; 2]`'s memory order; sizes match and every bit
        // pattern is a valid `f64`.
        let [xs, ys] = unsafe { core::mem::transmute::<Self, [Simd<f64, 4>; 2]>(self) };

        (xs, ys)
    }

    /// Assembles a batch from one SIMD lane group per axis.
    ///
    /// Lane `i` of `xs` and `ys` becomes vector `i`.
    #[inline]
    #[must_use]
    pub const fn from_lanes(xs: Simd<f64, 4>, ys: Simd<f64, 4>) -> Self {
        let this = [xs, ys];
        // SAFETY: `[Simd<f64, 4>; 2]` lays out the `x` lane group followed by the `y` lane
        // group, exactly `Self`'s `repr(C)` `[f64; 8]` memory order; sizes match and every
        // bit pattern is a valid `f64`.
        unsafe { core::mem::transmute::<[Simd<f64, 4>; 2], Self>(this) }
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 x1 x2 x3 y0 y1 y2 y3`. This compiles to a single
    /// full-width vector load.
    #[inline]
    #[must_use]
    pub const fn to_simd(self) -> Simd<f64, 8> {
        // SAFETY: `Self` is `repr(C)` over `[f64; 8]`, which is layout-compatible with
        // `Simd<f64, 8>` (sizes const-asserted below); every bit pattern is a valid `f64`, so
        // the reinterpretation is total.
        unsafe { core::mem::transmute::<Self, Simd<f64, 8>>(self) }
    }

    /// Returns the four pairwise dot products as SIMD lanes.
    ///
    /// Lane `i` holds `self[i] . other[i]`. On targets with native FMA the multiply-add fuses. For
    /// components widened from `f32` both lane products are exact, so the fused and separate forms
    /// agree bit for bit and the result carries a single rounding either way.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> Simd<f64, 4> {
        mul_add_f64x4(*self.xs(), *other.xs(), self.ys() * other.ys())
    }

    /// Returns the four pairwise perpendicular dot products as SIMD lanes.
    ///
    /// Lane `i` holds `self[i].perp_dot(other[i])`, with the sign semantics of [`Vec2::perp_dot`].
    /// The rounding behaviour is [`dot`](Self::dot)'s.
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> Simd<f64, 4> {
        mul_add_f64x4(*self.xs(), *other.ys(), -(self.ys() * other.xs()))
    }

    /// Returns the four squared lengths as SIMD lanes.
    #[inline]
    #[must_use]
    pub fn length_squared(self) -> Simd<f64, 4> {
        self.dot(self)
    }

    /// Returns the four pairwise squared Euclidean distances.
    ///
    /// Component `i` holds `self[i].distance_squared(other[i])`. The subtraction and squaring run
    /// at full batch width, and only the final add combines the axis halves. Every operation
    /// rounds separately, exactly as the scalar form does, so each component agrees with
    /// [`DVec2::distance_squared`] bit for bit on every input. Fusing the multiply-add would
    /// change roundings and break that equality, so this kernel deliberately stays unfused,
    /// unlike [`dot`](Self::dot).
    #[inline]
    #[must_use]
    pub fn distance_squared(self, other: Self) -> DVecN<4> {
        let difference = self.to_simd() - other.to_simd();
        let squared = Self::from(difference * difference);

        DVecN::new((*squared.xs() + *squared.ys()).to_array())
    }

    /// Returns `self * factor + accumulator`.
    ///
    /// With lane `i` of `factor` scaling both components of vector `i`.
    ///
    /// This is the weighted-moment accumulation step. On targets with native FMA each component
    /// fuses, and for components widened from `f32` scaled by a widened weight the products are
    /// exact, so the fused and separate forms agree bit for bit.
    #[inline]
    #[must_use]
    #[expect(
        clippy::similar_names,
        reason = "the lane groups pair by axis: each `xs` binding has its `ys` sibling"
    )]
    pub fn mul_add(self, factor: Simd<f64, 4>, accumulator: Self) -> Self {
        let (xs, ys) = self.into_lanes();
        let (acc_xs, acc_ys) = accumulator.into_lanes();

        Self::from_lanes(
            mul_add_f64x4(xs, factor, acc_xs),
            mul_add_f64x4(ys, factor, acc_ys),
        )
    }

    /// Sums the four vectors into one [`DVec2`]: the terminal reduction of an accumulation.
    #[inline]
    #[must_use]
    pub fn reduce(self) -> DVec2 {
        DVec2::new(self.xs().reduce_sum(), self.ys().reduce_sum())
    }
}

/// Widens every component.
///
/// The conversion is exact for every [`Vec2x4T`].
impl From<Vec2x4T> for DVec2x4T {
    #[inline]
    fn from(batch: Vec2x4T) -> Self {
        Self::from_lanes(batch.xs().cast(), batch.ys().cast())
    }
}

/// Adds the batches vector by vector: the unweighted accumulation step.
impl Add for DVec2x4T {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::from(self.to_simd() + rhs.to_simd())
    }
}

impl AddAssign for DVec2x4T {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

const impl From<Simd<f64, 8>> for DVec2x4T {
    /// Reinterprets eight lanes in `x0 x1 x2 x3 y0 y1 y2 y3` order.
    #[inline]
    fn from(lanes: Simd<f64, 8>) -> Self {
        // SAFETY: `Simd<f64, 8>` is layout-compatible with `[f64; 8]`, `Self`'s `repr(C)`
        // storage (sizes const-asserted below); every bit pattern is a valid `f64`, so the
        // reinterpretation is total.
        unsafe { core::mem::transmute::<Simd<f64, 8>, DVec2x4T>(lanes) }
    }
}

const impl From<DVec2x4T> for Simd<f64, 8> {
    #[inline]
    fn from(batch: DVec2x4T) -> Self {
        batch.to_simd()
    }
}

// The batch must back `Simd<f64, 8>` (identical size, at least its alignment), and the lane
// views borrow `Simd<f64, 4>` groups at offsets 0 and 32, so the half-width alignment must
// not exceed the offset.
const _: () = assert!(size_of::<DVec2x4T>() == size_of::<Simd<f64, 8>>());
const _: () = assert!(align_of::<DVec2x4T>() >= align_of::<Simd<f64, 8>>());
const _: () = assert!(align_of::<Simd<f64, 4>>() <= 32);
