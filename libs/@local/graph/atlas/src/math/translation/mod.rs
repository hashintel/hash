//! Fixed offsets for moving points and composing translations.

use core::simd::Simd;

use super::vec2::{Vec2, Vec2x4T};

#[cfg(test)]
mod tests;

/// A translation of 2D space by a fixed offset.
///
/// With offset t, application computes p + t. [`then`](Self::then) adds offsets in application
/// order. Both operations round in `f32` and can overflow. [`inverse`](Self::inverse) negates
/// finite offsets without rounding, but cannot recover information lost during application.
/// Construction accepts arbitrary components, including non-finite ones.
///
/// # Example
///
/// This example is ignored because the math module is crate-private.
///
/// ```ignore
/// use crate::math::{Vec2, translation::Translation};
///
/// let right = Translation::new(10.0, 0.0);
/// let up = Translation::new(0.0, 2.0);
///
/// assert_eq!(
///     right.then(up).apply(Vec2::new(1.0, 1.0)),
///     Vec2::new(11.0, 3.0)
/// );
/// assert_eq!(
///     right.inverse().apply(Vec2::new(11.0, 1.0)),
///     Vec2::new(1.0, 1.0)
/// );
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
pub struct Translation(Vec2);

impl Translation {
    /// The zero offset.
    pub const IDENTITY: Self = Self(Vec2::new(0.0, 0.0));

    /// Creates a translation from its `x` and `y` offsets.
    #[inline]
    #[must_use]
    pub const fn new(x: f32, y: f32) -> Self {
        Self(Vec2::new(x, y))
    }

    /// Returns the offset as a vector.
    #[inline]
    #[must_use]
    pub const fn vector(self) -> Vec2 {
        self.0
    }

    /// Adds the offsets to compose `self` followed by `next`.
    ///
    /// Real-arithmetic translations commute. The composed offset rounds once per component, while
    /// sequential application rounds after each offset. Composed and sequential evaluations can
    /// differ.
    #[inline]
    #[must_use]
    pub const fn then(self, next: Self) -> Self {
        Self(Vec2::new(self.0.x() + next.0.x(), self.0.y() + next.0.y()))
    }

    /// Returns the translation by the negated offset.
    ///
    /// Negation of finite offsets is exact. For finite input and offset, an exactly representable
    /// intermediate sum allows the reverse addition to recover the numerical input value. This does
    /// not promise preservation of a zero's sign.
    #[inline]
    #[must_use]
    pub const fn inverse(self) -> Self {
        Self(Vec2::new(-self.0.x(), -self.0.y()))
    }

    /// Moves a single vector by the offset.
    #[inline]
    #[must_use]
    pub const fn apply(self, vec: Vec2) -> Vec2 {
        Vec2::new(vec.x() + self.0.x(), vec.y() + self.0.y())
    }

    /// Adds the offset to four vectors with lane-wise SIMD arithmetic.
    #[inline]
    #[must_use]
    pub fn apply_x4(self, batch: Vec2x4T) -> Vec2x4T {
        Vec2x4T::from_lanes(
            batch.xs() + Simd::splat(self.0.x()),
            batch.ys() + Simd::splat(self.0.y()),
        )
    }
}

const impl From<Vec2> for Translation {
    #[inline]
    fn from(offset: Vec2) -> Self {
        Self(offset)
    }
}

const impl From<Translation> for Vec2 {
    #[inline]
    fn from(translation: Translation) -> Self {
        translation.vector()
    }
}
