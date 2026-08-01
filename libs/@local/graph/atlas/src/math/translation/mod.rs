//! Translations of 2D space.

use core::simd::Simd;

use super::vec2::{Vec2, Vec2x4T};

#[cfg(test)]
mod tests;

/// A translation of 2D space by a fixed offset.
///
/// A `translation: Translation` in a signature promises that the value moves points and composes by
/// adding offsets. Composition via [`then`](Self::then) adds the offsets, and
/// [`inverse`](Self::inverse) negates them, which is exact: no rounding occurs at all.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Translation, Vec2};
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
    /// The translation that moves nothing.
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

    /// Returns the translation equivalent to applying `self` first, then `next`.
    ///
    /// Translations commute, so the order only matters for consistency with the other transform
    /// types. This adds the two offsets.
    #[inline]
    #[must_use]
    pub const fn then(self, next: Self) -> Self {
        Self(Vec2::new(self.0.x() + next.0.x(), self.0.y() + next.0.y()))
    }

    /// Returns the translation by the negated offset.
    ///
    /// Negation is exact, so a translation followed by its inverse reproduces the input bit for bit
    /// whenever the intermediate sum is exactly representable.
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

    /// Moves four vectors at once, entirely in SIMD registers.
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
