//! Axis-aligned bounding boxes over 2D point sets.

use core::{
    num::NonZero,
    simd::{Simd, num::SimdFloat as _},
};

use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};

use super::{
    kernel::mul_add_f64x4,
    scalar::Positive,
    transform::Transform,
    translation::Translation,
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// An axis-aligned bounding box with finite, ordered corners.
///
/// The minimum and maximum corners define a [`Bounds2`]. Every value upholds two invariants: both
/// corners are finite, and `min ≤ max` holds per component. Constructors enforce this by returning
/// [`None`] for invalid input, so downstream code can rely on the box being usable without
/// re-validating.
///
/// The primary workflow is: gather the extent of a point set with
/// [`from_points`](Self::from_points), then map it onto a target region with [`fit`](Self::fit),
/// which yields a [`Transform`] to apply to the points (in batches via [`Transform::apply_x4`]).
///
/// # Examples
///
/// ```ignore
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
/// assert_eq!(bounds.centre(), Vec2::new(4.0, 1.0));
/// ```
// No `FromBytes`: it would mint boxes with NaN or inverted corners in
// safe code, bypassing the validating constructors. `FromZeros` is fine
// (the zeroed box is the valid degenerate box at the origin).
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromZeros,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
pub(crate) struct Bounds2 {
    min: Vec2,
    max: Vec2,
}

impl Bounds2 {
    /// Points per rayon work item in [`from_slice_par`](Self::from_slice_par).
    ///
    /// 4096 points are 32 KiB, comfortably inside L1 while large enough that per-task overhead
    /// disappears against the fold.
    pub(crate) const PARALLEL_CHUNK: NonZero<usize> = NonZero::new(4096).expect("4096 is not zero");

    /// Creates a bounding box from its corners.
    ///
    /// Returns [`None`] unless both corners are finite and `min ≤ max` holds per component. This
    /// constructor accepts a degenerate box with `min == max` on an axis. Widen it with
    /// [`with_minimum_extent`](Self::with_minimum_extent) when an axis needs a positive extent.
    #[must_use]
    pub(crate) const fn new(min: Vec2, max: Vec2) -> Option<Self> {
        if !min.is_finite() || !max.is_finite() || min.x() > max.x() || min.y() > max.y() {
            return None;
        }

        Some(Self { min, max })
    }

    /// Computes the tight bounding box of a point set.
    ///
    /// Returns [`None`] when the iterator is empty or any coordinate is not finite; the returned
    /// box always reflects every input point.
    ///
    /// This is the flexible, scalar entry point. When the points are already in a slice, prefer
    /// [`from_slice`](Self::from_slice), which folds four points per step.
    #[must_use]
    pub(crate) fn from_points(points: impl IntoIterator<Item = Vec2>) -> Option<Self> {
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
    /// The contract is identical to [`from_points`](Self::from_points): [`None`] for an empty slice
    /// or any non-finite coordinate. The batch-aligned middle of the slice folds four points per
    /// step. The unaligned edges fold scalar.
    #[must_use]
    pub(crate) fn from_slice(points: &[Vec2]) -> Option<Self> {
        if points.is_empty() {
            return None;
        }

        let (prefix, batches, suffix) = Vec2x4::from_slice(points);

        let mut valid = true;
        let mut min = Vec2x4::splat(Vec2::splat(f32::INFINITY));
        let mut max = Vec2x4::splat(Vec2::splat(f32::NEG_INFINITY));
        for &batch in batches {
            valid &= batch.is_finite();
            min = min.min(batch);
            max = max.max(batch);
        }

        // The infinite accumulator values are harmless: any real point
        // replaces them, and the fold tracks validity from the data
        // alone.
        let (mut min, mut max) = (min.reduce_min(), max.reduce_max());

        for &point in prefix.iter().chain(suffix) {
            valid &= point.is_finite();
            min = min.min(point);
            max = max.max(point);
        }

        valid.then_some(Self { min, max })
    }

    /// Computes the tight bounding box of a large point slice in parallel.
    ///
    /// The contract is identical to [`from_points`](Self::from_points): [`None`] for an empty slice
    /// or any non-finite coordinate. Rayon workers fold chunks of the slice with
    /// [`from_slice`](Self::from_slice), and [`union`](Self::union) combines the results.
    ///
    /// The fold is memory-bound. A single core already streams near the machine's bandwidth, so the
    /// parallel gain is real but modest (measured around a third at a million points) and does not
    /// grow with core count. Below about a hundred thousand points,
    /// [`from_slice`](Self::from_slice) is faster outright.
    ///
    /// Work splits into chunks of [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) points. Use
    /// [`from_slice_par_with`](Self::from_slice_par_with) to choose a different chunk size.
    #[inline]
    #[must_use]
    pub(crate) fn from_slice_par(points: &[Vec2]) -> Option<Self> {
        Self::from_slice_par_with(points, Self::PARALLEL_CHUNK)
    }

    /// Computes the tight bounding box in parallel with a caller-chosen chunk size.
    ///
    /// The contract is identical to [`from_slice`](Self::from_slice). Each rayon work item folds
    /// `chunk` points; smaller chunks balance better across uneven core loads, larger chunks
    /// amortize task overhead. [`from_slice_par`](Self::from_slice_par) uses
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK).
    #[must_use]
    pub(crate) fn from_slice_par_with(points: &[Vec2], chunk: NonZero<usize>) -> Option<Self> {
        points
            .par_chunks(chunk.get())
            .map(Self::from_slice)
            .reduce_with(|left, right| Some(left?.union(right?)))
            .flatten()
    }

    /// Returns the minimum corner.
    #[inline]
    #[must_use]
    pub(crate) const fn min(self) -> Vec2 {
        self.min
    }

    /// Returns the maximum corner.
    #[inline]
    #[must_use]
    pub(crate) const fn max(self) -> Vec2 {
        self.max
    }

    /// Returns the per-axis extent, `max - min`.
    ///
    /// Both components are non-negative by the type's invariant.
    #[inline]
    #[must_use]
    pub(crate) const fn size(self) -> Vec2 {
        self.max - self.min
    }

    /// Returns the centre of the box.
    #[inline]
    #[must_use]
    pub(crate) const fn centre(self) -> Vec2 {
        (self.min + self.max) * 0.5
    }

    /// Returns whether the point lies inside the box, boundary included.
    ///
    /// NaN coordinates are never contained.
    #[inline]
    #[must_use]
    pub(crate) const fn contains(self, point: Vec2) -> bool {
        self.min.x() <= point.x()
            && point.x() <= self.max.x()
            && self.min.y() <= point.y()
            && point.y() <= self.max.y()
    }

    /// Returns the smallest box covering both operands.
    #[inline]
    #[must_use]
    pub(crate) const fn union(self, other: Self) -> Self {
        Self {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }

    /// Widens any axis narrower than `minimum` to exactly `minimum`.
    ///
    /// Symmetrically around its centre.
    ///
    /// This repairs degenerate boxes (all points on a line, or a single point) before operations
    /// that divide by the extent, such as [`fit`](Self::fit) or density rasterization.
    #[inline]
    #[must_use]
    pub(crate) fn with_minimum_extent(self, minimum: f32) -> Self {
        let size = self.size();
        let centre = self.centre();

        let half = Vec2::new((size.x().max(minimum)) * 0.5, (size.y().max(minimum)) * 0.5);

        Self {
            min: centre - half,
            max: centre + half,
        }
    }

    /// Grows the box about its centre until its extent has the given width-to-height ratio.
    ///
    /// The result is the smallest box of ratio `ratio` containing this one: the axis already long
    /// enough keeps its extent, the other grows about the shared centre, and `size().x() /
    /// size().y() = ratio` holds to within one rounding of the ratio itself.
    ///
    /// This is the viewport operation for a grid of square cells. A point set drawn on `across` by
    /// `down` cells keeps its own shape when this method grows its extent to `across / down` first,
    /// because equal extent per cell on both axes is what one square cell means; fitting the grown
    /// box with [`fit`](Self::fit) then scales both axes by the same factor.
    ///
    /// An axis with no extent grows out of the other one, so a point set collapsed onto a line
    /// still yields a viewport. A box degenerate on both axes has no extent to take a ratio of and
    /// stays degenerate. [`with_minimum_extent`](Self::with_minimum_extent) gives it one.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let bounds = Bounds2::new(Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0))
    ///     .expect("corners are finite and ordered");
    /// let ratio = Positive::new(4.0).expect("4 is positive");
    ///
    /// // The box is 16 by 2, wider than 4:1, so the height grows to 4 and the width stays.
    /// let viewport = bounds.with_aspect_ratio(ratio);
    /// assert_eq!(viewport.size(), Vec2::new(16.0, 4.0));
    /// assert_eq!(viewport.centre(), bounds.centre());
    /// ```
    #[inline]
    #[must_use]
    pub(crate) fn with_aspect_ratio(self, ratio: Positive) -> Self {
        let size = self.size();
        let centre = self.centre();

        // Both components read the original size, so exactly one axis
        // grows: whichever is short for the ratio.
        let half = Vec2::new(
            size.x().max(size.y() * ratio.get()),
            size.y().max(size.x() / ratio.get()),
        ) * 0.5;

        Self {
            min: centre - half,
            max: centre + half,
        }
    }

    /// Scales the box about its centre by `factor`.
    ///
    /// Both axes scale by the same factor and the centre does not move, so the result contains this
    /// box for a factor above one and sits inside it below one. A factor of one returns the same
    /// extent, to within the rounding of the halved arithmetic.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let bounds =
    ///     Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("corners are finite and ordered");
    /// let margin = Positive::new(1.5).expect("1.5 is positive");
    ///
    /// let widened = bounds.scaled_about_centre(margin);
    /// assert_eq!(widened.min(), Vec2::splat(-1.5));
    /// assert_eq!(widened.max(), Vec2::splat(1.5));
    /// ```
    #[inline]
    #[must_use]
    pub(crate) fn scaled_about_centre(self, factor: Positive) -> Self {
        let centre = self.centre();
        let half = self.size() * (factor.get() * 0.5);

        Self {
            min: centre - half,
            max: centre + half,
        }
    }

    /// Returns the transform mapping this box onto `target`.
    ///
    /// The transform scales and translates each axis independently, so `self.min` lands on
    /// `target.min` and `self.max` on `target.max`. This is the normalize-into-viewport operation:
    /// fit a layout's extent, then map every point into `[0, size]` coordinates with one batched
    /// transform.
    ///
    /// Returns [`None`] when this box has an axis with zero, subnormal, or otherwise non-normal
    /// extent, where the scale factor degenerates; widen with
    /// [`with_minimum_extent`](Self::with_minimum_extent) first when the point set may be
    /// collinear.
    ///
    /// # Examples
    ///
    /// ```ignore
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
    pub(crate) fn fit(self, target: Self) -> Option<Transform> {
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

    /// Maps points from this box onto `target`, exactly per axis.
    ///
    /// Each axis maps affinely in `f64` - subtract this box's minimum, divide by its extent, scale
    /// onto the target axis - and rounds once to `f32`, so every output component is within one
    /// `f32` ULP of the exact mapping for every input magnitude, including boxes sitting far from
    /// the origin relative to their extent. This box's corners map onto the target's corners.
    /// Points outside this box extrapolate along the same map. A zero-extent axis (every point
    /// identical on it) maps to the centre of the target's axis.
    ///
    /// This method maps points in parallel, four at a time per axis: each batch converts to
    /// [`Vec2x4T`] at the loop boundary and widens its lane groups to `f64`, so the batched and
    /// scalar paths round identically and the output is independent of the split.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let layout = Bounds2::new(Vec2::new(-2.0, 0.0), Vec2::new(6.0, 4.0))
    ///     .expect("corners are finite and ordered");
    /// let frame = Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("the frame is valid");
    ///
    /// let mapped = layout.normalize_into(frame, &[Vec2::new(-2.0, 0.0), Vec2::new(2.0, 2.0)]);
    /// assert_eq!(mapped, [Vec2::new(-1.0, -1.0), Vec2::new(0.0, 0.0)]);
    /// ```
    #[must_use]
    pub(crate) fn normalize_into(self, target: Self, points: &[Vec2]) -> Vec<Vec2> {
        let x = AxisMap::new(self.min.x(), self.max.x(), target.min.x(), target.max.x());
        let y = AxisMap::new(self.min.y(), self.max.y(), target.min.y(), target.max.y());

        let mut mapped = vec![Vec2::ZERO; points.len()];
        mapped
            .par_chunks_mut(Self::PARALLEL_CHUNK.get())
            .zip(points.par_chunks(Self::PARALLEL_CHUNK.get()))
            .for_each(|(mapped, points)| {
                let (mapped_batches, mapped_remainder) = mapped.as_chunks_mut::<4>();
                let (batches, remainder) = points.as_chunks::<4>();

                for (mapped, &batch) in mapped_batches.iter_mut().zip(batches) {
                    let batch = Vec2x4T::from(batch);
                    let lanes = Vec2x4T::from_lanes(x.apply_x4(batch.xs()), y.apply_x4(batch.ys()));

                    *mapped = Vec2x4::from(lanes).into();
                }
                for (mapped, point) in mapped_remainder.iter_mut().zip(remainder) {
                    *mapped = Vec2::new(x.apply(point.x()), y.apply(point.y()));
                }
            });

        mapped
    }
}

impl Bounds2 {
    /// Quantizes a point onto the bounds' 32-bit-per-axis grid.
    ///
    /// Each axis maps affinely onto `[0, 2^32)` in `f64` (so every `f32` coordinate quantizes
    /// exactly) and floors. Coordinates outside the bounds clamp onto the boundary cells: points at
    /// or beyond the maximum edge take the last cell, points below the minimum take cell zero. A
    /// zero-extent axis maps to cell zero.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let bounds = Bounds2::new(Vec2::ZERO, Vec2::new(1.0, 1.0)).expect("the bounds are ordered");
    /// assert_eq!(bounds.quantize(Vec2::ZERO), [0, 0]);
    /// assert_eq!(bounds.quantize(Vec2::new(1.0, 0.5)), [u32::MAX, 1 << 31]);
    /// ```
    #[must_use]
    pub(crate) fn quantize(self, point: Vec2) -> [u32; 2] {
        let size = self.size();
        [
            quantize_axis(point.x(), self.min.x(), size.x()),
            quantize_axis(point.y(), self.min.y(), size.y()),
        ]
    }
}

/// The number of grid positions per axis of [`Bounds2::quantize`].
#[expect(
    clippy::cast_precision_loss,
    reason = "2^32 is a power of two, exact in `f64`"
)]
const AXIS_CELLS: f64 = (1_u64 << 32) as f64;

/// Maps one coordinate onto its axis grid cell.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the saturating float-to-int cast is the clamp onto the axis grid"
)]
fn quantize_axis(value: f32, min: f32, extent: f32) -> u32 {
    if extent == 0.0 {
        return 0;
    }

    let unit = (f64::from(value) - f64::from(min)) / f64::from(extent);
    // Rust float-to-int casts saturate: negative inputs clamp to cell
    // zero, inputs at or beyond the maximum edge to the last cell, and
    // a NaN coordinate to cell zero.
    (unit * AXIS_CELLS) as u32
}

/// One axis's affine map of [`Bounds2::normalize_into`], with every coefficient widened to `f64`.
#[derive(Copy, Clone)]
struct AxisMap {
    minimum: f64,
    extent: f64,
    target_minimum: f64,
    target_extent: f64,
    target_centre: f64,
}

impl AxisMap {
    fn new(minimum: f32, maximum: f32, target_minimum: f32, target_maximum: f32) -> Self {
        let minimum = f64::from(minimum);
        let target_minimum = f64::from(target_minimum);
        let target_maximum = f64::from(target_maximum);

        Self {
            minimum,
            extent: f64::from(maximum) - minimum,
            target_minimum,
            target_extent: target_maximum - target_minimum,
            target_centre: f64::midpoint(target_minimum, target_maximum),
        }
    }

    /// Maps one coordinate onto its target axis.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the single f64-to-f32 rounding is the mapping's error bound"
    )]
    fn apply(self, value: f32) -> f32 {
        if self.extent == 0.0 {
            return self.target_centre as f32;
        }

        let unit = (f64::from(value) - self.minimum) / self.extent;
        // f64 fused multiply-add is correctly rounded by IEEE 754, so it
        // is both more accurate and byte-reproducible across targets.
        unit.mul_add(self.target_extent, self.target_minimum) as f32
    }

    /// Maps four coordinates onto their target axis.
    ///
    /// Rounds each lane exactly as [`apply`](Self::apply) rounds one value.
    #[inline]
    fn apply_x4(self, values: &Simd<f32, 4>) -> Simd<f32, 4> {
        if self.extent == 0.0 {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the single f64-to-f32 rounding is the mapping's error bound"
            )]
            return Simd::splat(self.target_centre as f32);
        }

        let unit = (values.cast::<f64>() - Simd::splat(self.minimum)) / Simd::splat(self.extent);
        mul_add_f64x4(
            unit,
            Simd::splat(self.target_extent),
            Simd::splat(self.target_minimum),
        )
        .cast::<f32>()
    }
}
