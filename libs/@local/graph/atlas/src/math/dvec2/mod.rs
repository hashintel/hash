//! Double-precision 2D vectors for accumulation.

use core::{
    ops::{Add, AddAssign, Div, Mul, Neg, Sub},
    simd::{Simd, num::SimdFloat as _},
};

use super::{
    derivation::Derivation,
    dvecn::DVecN,
    kernel::mul_add_f64x4,
    scalar::{DFinite, DNonNegative, narrow_f32},
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// A 2D vector of `f64` components, for accumulating over [`Vec2`] data.
///
/// Accumulate weighted points and moment corrections in double precision, then convert to [`Vec2`]
/// through [`Self::narrow`]. Widening finite `f32` components is exact. The accumulation still
/// rounds in `f64`, but it avoids rounding each update to `f32`.
///
/// Components may be non-finite. The product methods return a [`Derivation`] whose final value can
/// be validated before use.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DVec2, Vec2};
///
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

    /// Computes the dot product with one rounded product and one fused multiply-add.
    #[inline]
    fn dot_impl(self, other: Self) -> f64 {
        self.x().mul_add(other.x(), self.y() * other.y())
    }

    /// Returns the dot product of the two vectors.
    ///
    /// Returns an unvalidated [`Derivation`]. Products and sums of arbitrary `f64` components can
    /// be non-finite.
    #[inline]
    pub(crate) fn dot(self, other: Self) -> Derivation<DFinite> {
        Derivation::raw(self.dot_impl(other))
    }

    /// Returns the determinant x₁y₂ − y₁x₂ as an unvalidated [`Derivation`].
    ///
    /// # Numerical guarantees
    ///
    /// Rounding can erase a nonzero determinant, and finite components can produce infinity or NaN.
    ///
    /// For every pair producing a non-NaN result, swapping operands negates the result under
    /// floating-point equality. Positive and negative zero compare equal.
    #[expect(
        clippy::suboptimal_flops,
        reason = "fusing rounds a different product in each operand order, which breaks the \
                  antisymmetry that orientation predicates rely on"
    )]
    #[inline]
    pub(crate) fn perp_dot(self, other: Self) -> Derivation<DFinite> {
        Derivation::raw(self.x() * other.y() - self.y() * other.x())
    }

    /// Returns the squared Euclidean length of the vector.
    #[inline]
    pub(crate) fn norm_squared(self) -> Derivation<DNonNegative> {
        Derivation::raw(self.dot_impl(self))
    }

    /// Returns the squared Euclidean distance to `other`.
    ///
    /// # Numerical guarantees
    ///
    /// Finite coordinates can still produce an infinite result.
    #[inline]
    #[must_use]
    pub const fn distance_squared(self, other: Self) -> f64 {
        let dx = self.x() - other.x();
        let dy = self.y() - other.y();

        dy.mul_add(dy, dx * dx)
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
    /// Returns [`None`] when either component is NaN or rounds to an infinity, following
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

    /// Narrows both components with round-to-nearest, allowing non-finite results.
    ///
    /// # Warning
    ///
    /// Precision is lost when a component is not exactly representable in `f32`. Finite components
    /// may round to infinity, and NaN remains NaN. Use [`Self::narrow`] to reject non-finite
    /// outputs.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the rounding cast is the operation itself"
    )]
    #[inline]
    #[must_use]
    pub const fn narrow_lossy(self) -> Vec2 {
        Vec2::new(self.x() as f32, self.y() as f32)
    }
}

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

const impl Mul<DNonNegative> for DVec2 {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: DNonNegative) -> Self {
        self * rhs.get()
    }
}

const impl Div<f64> for DVec2 {
    type Output = Self;

    #[inline]
    fn div(self, rhs: f64) -> Self {
        Self::new(self.x() / rhs, self.y() / rhs)
    }
}

const impl Div<DNonNegative> for DVec2 {
    type Output = Self;

    #[inline]
    fn div(self, rhs: DNonNegative) -> Self {
        self / rhs.get()
    }
}

const impl Neg for DVec2 {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self::new(-self.x(), -self.y())
    }
}

/// Four double-precision 2D vectors packed in transposed (structure-of-arrays) order.
///
/// All four x values precede all four y values, in storage aligned for [`Simd<f64, 8>`](Simd).
/// Widen a [`Vec2x4T`] batch, accumulate weighted moments through [`Self::mul_add`], then combine
/// the lanes through [`Self::reduce_sum`]. Widening finite `f32` components is exact.
///
/// # Example
///
/// This in-crate example is ignored because the module is private and uses nightly portable SIMD.
///
/// ```ignore
/// # #![feature(portable_simd)]
/// use crate::math::{DVec2, DVec2x4T, Vec2, Vec2x4T};
///
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
/// assert_eq!(weighted.reduce_sum(), DVec2::new(5.0, 13.0));
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
    /// Repeating the point supports lane-wise comparison against four distinct points.
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
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 64-byte alignment, which satisfies \
                  `Simd<f64, 4>`'s alignment at offset 0"
    )]
    #[inline]
    #[must_use]
    pub const fn xs(&self) -> &Simd<f64, 4> {
        let this = &raw const *self;
        let this = this.cast::<f64>();

        // SAFETY: The cast relies on Simd's contiguous array-element layout. Self's repr(C) storage
        // has four initialized x components at offset zero. Its 64-byte alignment and the
        // assertions below cover SIMD alignment, and the pointer retains the shared borrow's
        // provenance and lifetime. Under that layout contract, this group may be borrowed as
        // Simd<f64, 4>.
        unsafe { &*this.cast::<Simd<f64, 4>>() }
    }

    /// Returns the four `y` components as SIMD lanes.
    ///
    /// Lane `i` holds the `y` component of vector `i`.
    #[expect(
        clippy::cast_ptr_alignment,
        reason = "the pointer derives from `&Self` with 64-byte alignment, which satisfies \
                  `Simd<f64, 4>`'s alignment at the 32-byte `y` group offset"
    )]
    #[inline]
    #[must_use]
    pub const fn ys(&self) -> &Simd<f64, 4> {
        let this = &raw const *self;
        let this = this.cast::<f64>();

        // SAFETY: The cast relies on Simd's contiguous array-element layout. Self's repr(C) storage
        // has four initialized y components at byte offset 32. The asserted SIMD alignment divides
        // that offset and the 64-byte base alignment. Pointer addition remains within Self,
        // preserving the shared borrow's provenance and lifetime. Under that layout contract, this
        // group may be borrowed as Simd<f64, 4>.
        unsafe { &*this.add(4).cast::<Simd<f64, 4>>() }
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
    pub const fn into_lanes(self) -> (Simd<f64, 4>, Simd<f64, 4>) {
        // SAFETY: This transmute relies on each SIMD vector having its array's element layout
        // without padding. Self contains initialized x then y groups in repr(C) storage, and
        // transmute checks equality of the complete sizes. Every component bit pattern is valid as
        // f64. Under that SIMD layout contract, both destination groups are initialized and valid.
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
        // SAFETY: This transmute relies on each SIMD vector having its array's element layout
        // without padding. The source array places the initialized x group before y, matching
        // Self's repr(C) component order, and transmute checks equal sizes. Under that layout
        // contract, all destination components are initialized and valid.
        unsafe { core::mem::transmute::<[Simd<f64, 4>; 2], Self>(this) }
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is `x0 x1 x2 x3 y0 y1 y2 y3`.
    #[inline]
    #[must_use]
    pub const fn to_simd(self) -> Simd<f64, 8> {
        // SAFETY: This transmute relies on Simd's contiguous array-element layout. Self has eight
        // initialized f64 components in lane order, and the assertion below checks equal size.
        // Under that layout contract, those components form a valid SIMD value.
        unsafe { core::mem::transmute::<Self, Simd<f64, 8>>(self) }
    }

    /// Returns the four pairwise dot products as SIMD lanes.
    ///
    /// Lane i computes aₓbₓ + aᵧbᵧ for the corresponding pair of vectors. The y product rounds
    /// first, followed by a fused multiply-add for the x product and sum.
    ///
    /// Products of finite `f32` values need at most 48 significand bits and remain within the `f64`
    /// exponent range. When both vectors are widened from finite `f32` components, both products
    /// are therefore exact and only the final addition rounds.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> Simd<f64, 4> {
        mul_add_f64x4(*self.xs(), *other.xs(), self.ys() * other.ys())
    }

    /// Returns the four pairwise perpendicular dot products as SIMD lanes.
    ///
    /// # Numerical guarantees
    ///
    /// Each lane follows [`DVec2::perp_dot`]'s numerical contract.
    #[inline]
    #[must_use]
    pub fn perp_dot(self, other: Self) -> Simd<f64, 4> {
        self.xs() * other.ys() - self.ys() * other.xs()
    }

    /// Returns the four squared lengths as SIMD lanes.
    #[inline]
    #[must_use]
    pub fn length_squared(self) -> Simd<f64, 4> {
        self.dot(self)
    }

    /// Returns the four pairwise squared Euclidean distances.
    ///
    /// # Numerical guarantees
    ///
    /// Each component matches [`DVec2::distance_squared`] for the corresponding pair. NaN payload
    /// equality is not guaranteed.
    #[inline]
    #[must_use]
    pub fn distance_squared(self, other: Self) -> DVecN<4> {
        let dxy = self - other;

        let dy = dxy.ys();
        let dx = dxy.xs();

        DVecN::new(mul_add_f64x4(*dy, *dy, dx * dx).to_array())
    }

    /// Returns `self * factor + accumulator`.
    ///
    /// With lane `i` of `factor` scaling both components of vector `i`.
    ///
    /// Each component uses a fused multiply-add with one rounding. When the component and factor
    /// are widened finite `f32` values, their product is exact in `f64`, leaving only the addition
    /// to the accumulator to round.
    #[expect(
        clippy::similar_names,
        reason = "the lane groups pair by axis: each `xs` binding has its `ys` sibling"
    )]
    #[inline]
    #[must_use]
    pub fn mul_add(self, factor: Simd<f64, 4>, accumulator: Self) -> Self {
        let (xs, ys) = self.into_lanes();
        let (acc_xs, acc_ys) = accumulator.into_lanes();

        Self::from_lanes(
            mul_add_f64x4(xs, factor, acc_xs),
            mul_add_f64x4(ys, factor, acc_ys),
        )
    }

    /// Sums the four vectors into one [`DVec2`].
    ///
    /// The final bits can depend on the SIMD reduction's summation order.
    #[inline]
    #[must_use]
    pub fn reduce_sum(self) -> DVec2 {
        DVec2::new(self.xs().reduce_sum(), self.ys().reduce_sum())
    }
}

impl From<Vec2x4T> for DVec2x4T {
    #[inline]
    fn from(batch: Vec2x4T) -> Self {
        Self::from_lanes(batch.xs().cast(), batch.ys().cast())
    }
}

impl From<[Vec2; 4]> for DVec2x4T {
    #[inline]
    fn from(vecs: [Vec2; 4]) -> Self {
        Self::from(Vec2x4T::from(Vec2x4::from(vecs)))
    }
}

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

impl Sub for DVec2x4T {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::from(self.to_simd() - rhs.to_simd())
    }
}

const impl From<Simd<f64, 8>> for DVec2x4T {
    #[inline]
    fn from(lanes: Simd<f64, 8>) -> Self {
        // SAFETY: This transmute relies on Simd's contiguous array-element layout without padding.
        // Self stores eight f64 components in the same order, with no additional validity
        // conditions, and equal sizes are asserted below. Under that layout contract, the
        // initialized lanes form a valid batch.
        unsafe { core::mem::transmute::<Simd<f64, 8>, DVec2x4T>(lanes) }
    }
}

const impl From<DVec2x4T> for Simd<f64, 8> {
    #[inline]
    fn from(batch: DVec2x4T) -> Self {
        batch.to_simd()
    }
}

// The batch must match `Simd<f64, 8>`'s size and meet its alignment. Borrowed `Simd<f64, 4>` groups
// begin at byte offsets 0 and 32. Their alignment must not exceed 32 bytes to keep both group
// addresses aligned.
const _: () = assert!(size_of::<DVec2x4T>() == size_of::<Simd<f64, 8>>());
const _: () = assert!(align_of::<DVec2x4T>() >= align_of::<Simd<f64, 8>>());
const _: () = assert!(align_of::<Simd<f64, 4>>() <= 32);
