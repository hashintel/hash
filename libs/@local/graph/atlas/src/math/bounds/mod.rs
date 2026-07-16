//! Axis-aligned bounding boxes over 2D point sets.

use core::simd::{Simd, num::SimdFloat as _};

use rayon::{iter::ParallelIterator as _, slice::ParallelSlice as _};

use super::{
    transform::Transform,
    translation::Translation,
    vec2::{Vec2, Vec2x4},
};

/// Points per rayon work item in [`Bounds2::from_slice_par`].
///
/// 4096 points are 32 KiB, comfortably inside L1 while large enough that
/// per-task overhead disappears against the fold.
const PARALLEL_CHUNK: usize = 4096;

/// An axis-aligned bounding box with finite, ordered corners.
///
/// A [`Bounds2`] is defined by its minimum and maximum corners. Every value
/// upholds two invariants: both corners are finite, and `min <= max` holds
/// per component. Constructors enforce this by returning [`None`] for
/// invalid input, so downstream code can rely on the box being usable
/// without re-validating.
///
/// The primary workflow is: gather the extent of a point set with
/// [`from_points`](Self::from_points), then map it onto a target region
/// with [`fit`](Self::fit), which yields a [`Transform`] to apply to the
/// points (in batches via [`Transform::apply_x4`]).
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Bounds2, Vec2};
///
/// let bounds = Bounds2::from_points([
///     Vec2::new(2.0, -1.0),
///     Vec2::new(6.0, 3.0),
///     Vec2::new(4.0, 1.0),
/// ])
/// .expect("points are finite and non-empty");
///
/// assert_eq!(bounds.min(), Vec2::new(2.0, -1.0));
/// assert_eq!(bounds.max(), Vec2::new(6.0, 3.0));
/// assert_eq!(bounds.size(), Vec2::new(4.0, 4.0));
/// assert_eq!(bounds.center(), Vec2::new(4.0, 1.0));
/// ```
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Bounds2 {
    min: Vec2,
    max: Vec2,
}

impl Bounds2 {
    /// Creates a bounding box from its corners.
    ///
    /// Returns [`None`] unless both corners are finite and `min <= max`
    /// holds per component. A degenerate box with `min == max` on an axis
    /// is allowed; widen it with
    /// [`with_minimum_extent`](Self::with_minimum_extent) if a positive
    /// extent is required.
    #[must_use]
    pub fn new(min: Vec2, max: Vec2) -> Option<Self> {
        if !min.is_finite() || !max.is_finite() || min.x() > max.x() || min.y() > max.y() {
            return None;
        }

        Some(Self { min, max })
    }

    /// Computes the tight bounding box of a point set.
    ///
    /// Returns [`None`] when the iterator is empty or any coordinate is
    /// not finite; a partial box over the finite prefix would silently
    /// misplace every later consumer.
    ///
    /// This is the flexible, scalar entry point. When the points are
    /// already in a slice, prefer [`from_slice`](Self::from_slice), which
    /// folds four points per step.
    #[must_use]
    pub fn from_points(points: impl IntoIterator<Item = Vec2>) -> Option<Self> {
        let mut points = points.into_iter();
        let first = points.next()?;

        let mut valid = first.is_finite();
        let (min, max) = points.fold((first, first), |(min, max), point| {
            valid &= point.is_finite();

            (min.min(point), max.max(point))
        });

        valid.then_some(Self { min, max })
    }

    /// Computes the tight bounding box of a point slice with SIMD folds.
    ///
    /// The contract is identical to [`from_points`](Self::from_points):
    /// [`None`] for an empty slice or any non-finite coordinate. Points
    /// are folded four at a time, with the trailing `len % 4` points
    /// handled scalar.
    #[must_use]
    pub fn from_slice(points: &[Vec2]) -> Option<Self> {
        if points.is_empty() {
            return None;
        }

        let (batches, remainder) = points.as_chunks::<4>();

        let mut valid = true;
        let mut min = Simd::splat(f32::INFINITY);
        let mut max = Simd::splat(f32::NEG_INFINITY);
        for batch in batches {
            let lanes = Vec2x4::from(*batch).to_simd();

            valid &= lanes.is_finite().all();
            min = min.simd_min(lanes);
            max = max.simd_max(lanes);
        }

        // The accumulators hold interleaved coordinates (the natural batch
        // order), so lanes 0, 2, 4, 6 fold into `x` and 1, 3, 5, 7 into
        // `y`. The infinite initial values are harmless: any real point
        // replaces them, and validity is tracked from the data alone.
        let (mut min, mut max) = (
            fold_interleaved(min, f32::min),
            fold_interleaved(max, f32::max),
        );

        for &point in remainder {
            valid &= point.is_finite();
            min = min.min(point);
            max = max.max(point);
        }

        valid.then_some(Self { min, max })
    }

    /// Computes the tight bounding box of a large point slice in parallel.
    ///
    /// The contract is identical to [`from_points`](Self::from_points):
    /// [`None`] for an empty slice or any non-finite coordinate. The slice
    /// is split into chunks folded with [`from_slice`](Self::from_slice)
    /// on rayon workers, then combined with [`union`](Self::union).
    ///
    /// The fold is memory-bound, so parallelism pays off from roughly a
    /// hundred thousand points; below that, [`from_slice`](Self::from_slice)
    /// is faster.
    #[must_use]
    pub fn from_slice_par(points: &[Vec2]) -> Option<Self> {
        points
            .par_chunks(PARALLEL_CHUNK)
            .map(Self::from_slice)
            .reduce_with(|left, right| Some(left?.union(right?)))
            .flatten()
    }

    /// Returns the minimum corner.
    #[must_use]
    #[inline]
    pub const fn min(self) -> Vec2 {
        self.min
    }

    /// Returns the maximum corner.
    #[must_use]
    #[inline]
    pub const fn max(self) -> Vec2 {
        self.max
    }

    /// Returns the per-axis extent, `max - min`.
    ///
    /// Both components are non-negative by the type's invariant.
    #[must_use]
    #[inline]
    pub fn size(self) -> Vec2 {
        self.max - self.min
    }

    /// Returns the center of the box.
    #[must_use]
    #[inline]
    pub fn center(self) -> Vec2 {
        (self.min + self.max) * 0.5
    }

    /// Returns whether the point lies inside the box, boundary included.
    ///
    /// NaN coordinates are never contained.
    #[must_use]
    #[inline]
    pub const fn contains(self, point: Vec2) -> bool {
        self.min.x() <= point.x()
            && point.x() <= self.max.x()
            && self.min.y() <= point.y()
            && point.y() <= self.max.y()
    }

    /// Returns the smallest box covering both operands.
    #[must_use]
    #[inline]
    pub const fn union(self, other: Self) -> Self {
        Self {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }

    /// Widens any axis narrower than `minimum` to exactly `minimum`,
    /// symmetrically around its center.
    ///
    /// This repairs degenerate boxes (all points on a line, or a single
    /// point) before operations that divide by the extent, such as
    /// [`fit`](Self::fit) or density rasterization.
    #[must_use]
    #[inline]
    pub fn with_minimum_extent(self, minimum: f32) -> Self {
        let size = self.size();
        let center = self.center();

        let half = Vec2::new((size.x().max(minimum)) * 0.5, (size.y().max(minimum)) * 0.5);

        Self {
            min: center - half,
            max: center + half,
        }
    }

    /// Returns the transform mapping this box onto `target`.
    ///
    /// Each axis is scaled and translated independently, so `self.min`
    /// lands on `target.min` and `self.max` on `target.max`. This is the
    /// normalize-into-viewport operation: fit a layout's extent, then map
    /// every point into `[0, size]` coordinates with one batched
    /// transform.
    ///
    /// Returns [`None`] when this box has an axis with zero, subnormal, or
    /// otherwise non-normal extent, where the scale factor degenerates;
    /// widen with [`with_minimum_extent`](Self::with_minimum_extent)
    /// first when the point set may be collinear.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Bounds2, Vec2};
    ///
    /// let layout = Bounds2::new(Vec2::new(-2.0, 0.0), Vec2::new(6.0, 4.0))
    ///     .expect("corners are finite and ordered");
    /// let viewport =
    ///     Bounds2::new(Vec2::ZERO, Vec2::splat(10.0)).expect("corners are finite and ordered");
    ///
    /// let transform = layout.fit(viewport).expect("layout has positive extent");
    /// assert_eq!(transform.apply(Vec2::new(-2.0, 0.0)), Vec2::ZERO);
    /// assert_eq!(transform.apply(Vec2::new(6.0, 4.0)), Vec2::splat(10.0));
    /// assert_eq!(transform.apply(Vec2::new(2.0, 2.0)), Vec2::new(5.0, 5.0));
    /// ```
    #[must_use]
    pub fn fit(self, target: Self) -> Option<Transform> {
        let size = self.size();

        if !size.x().is_normal() || !size.y().is_normal() {
            return None;
        }

        let scale = Vec2::new(target.size().x() / size.x(), target.size().y() / size.y());

        Some(
            Transform::from_translation(-self.min)
                .then(Transform::from_scale(scale))
                .then(Translation::from(target.min)),
        )
    }
}

/// Folds an interleaved `x y x y ...` lane group into a single vector,
/// combining the four values of each axis with `combine`.
#[inline]
fn fold_interleaved(lanes: Simd<f32, 8>, combine: fn(f32, f32) -> f32) -> Vec2 {
    let [x0, y0, x1, y1, x2, y2, x3, y3] = lanes.to_array();

    Vec2::new(
        combine(combine(x0, x1), combine(x2, x3)),
        combine(combine(y0, y1), combine(y2, y3)),
    )
}

#[cfg(test)]
mod tests;
