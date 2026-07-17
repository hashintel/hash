//! Double-precision 2D vectors for accumulation.

use core::ops::{Add, AddAssign, Div, Mul, Sub};

use super::{scalar::narrow_f32, vec2::Vec2};

#[cfg(test)]
mod tests;

/// A 2D vector of `f64` components, for accumulating over [`Vec2`] data.
///
/// A [`DVec2`] is the double-precision accumulator twin of [`Vec2`]: sums
/// of weighted points, centroids, and moment corrections live here while
/// a reduction runs, then narrow back to the working precision once at
/// the end via [`narrow`](Self::narrow). Widening a [`Vec2`] through
/// [`From`] is exact for every value, so per-component products of
/// widened inputs carry no `f32` rounding.
///
/// The surface is deliberately the accumulator's: arithmetic, the two
/// products, and the exact widening and checked narrowing conversions.
/// Geometry (interpolation, clamping, bounds) belongs to [`Vec2`].
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{DVec2, Vec2};
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

    /// Returns the dot product of the two vectors.
    #[inline]
    #[must_use]
    pub fn dot(self, other: Self) -> f64 {
        self.x().mul_add(other.x(), self.y() * other.y())
    }

    /// Returns the perpendicular dot product, the `z` component of the 3D
    /// cross product; the sign semantics match [`Vec2::perp_dot`].
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

    /// Returns `self * factor + accumulator` with one rounding per
    /// component.
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
    /// Returns [`None`] when either component leaves the finite `f32`
    /// range, following [`narrow_f32`](super::narrow_f32).
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

/// Widens both components; exact for every [`Vec2`].
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
