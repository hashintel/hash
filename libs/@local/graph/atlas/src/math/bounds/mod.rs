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
/// Every value has finite minimum and maximum corners with `min ≤ max` per component. Constructors
/// return [`None`] for invalid input.
///
/// Gather the extent of a point set with [`from_points`](Self::from_points), then map the points
/// onto a target region with [`normalize_into`](Self::normalize_into), the per-axis affine
/// box-to-box map.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{Bounds2, Vec2};
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
/// assert_eq!(bounds.centre(), Vec2::new(4.0, 1.0));
/// ```
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
    /// Returns [`None`] when the iterator is empty or any coordinate is not finite. The returned
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
    /// The recorded bounds benchmark measured a gain of around a third at a million points,
    /// with the serial [`from_slice`](Self::from_slice) faster below about a hundred thousand.
    /// These are machine-dependent crossover points. Measure with wall time when choosing
    /// between the serial and parallel forms.
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
    /// `chunk` points. Smaller chunks balance better across uneven core loads, and larger chunks
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
    /// Both components are non-negative by the type's invariant. A difference can overflow to
    /// positive infinity even though both corners are finite.
    #[inline]
    #[must_use]
    pub(crate) const fn size(self) -> Vec2 {
        self.max - self.min
    }

    /// Returns the centre of the box.
    ///
    /// Each component is the exact midpoint of its axis rounded once to the nearest `f32`. The
    /// result is finite and lies inside the box: the midpoint lies between two `f32` corners and
    /// rounding is monotone.
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
    /// Each narrow axis grows symmetrically in exact arithmetic. Rounding follows
    /// [`with_aspect_ratio`](Self::with_aspect_ratio). An axis already at least `minimum` wide
    /// keeps its corners bit for bit.
    ///
    /// This repairs degenerate boxes (all points on a line, or a single point) before operations
    /// that divide by the extent, such as box-to-box fitting or density rasterization.
    ///
    /// Returns [`None`] when a widened corner would lie beyond the finite `f32` range.
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

    /// Grows the shorter axis toward the given width-to-height ratio.
    ///
    /// The result contains this box. The axis already long enough for the ratio keeps its corners
    /// bit for bit, and the other grows symmetrically in exact arithmetic.
    ///
    /// A viewport on a grid of square cells needs equal data extent per cell on both axes. Growing
    /// to `across / down` supplies that ratio in exact arithmetic. The represented ratio also
    /// depends on the corner spacing described below.
    ///
    /// An axis with no extent grows from the other axis's extent. A box degenerate on both axes
    /// remains degenerate. [`with_minimum_extent`](Self::with_minimum_extent) supplies an extent.
    ///
    /// Returns [`None`] when a grown corner would lie beyond the finite `f32` range.
    ///
    /// # Rounding
    ///
    /// This method, [`with_minimum_extent`](Self::with_minimum_extent) and
    /// [`scaled_about_centre`](Self::scaled_about_centre) compute per-corner shifts in `f64`, then
    /// round the low corner down and the high corner up to `f32`. A positive outward shift too
    /// small to change the `f64` corner instead takes one outward `f32` step. Growth contains the
    /// original axis and shrinking lies within it. A target equal to the current extent preserves
    /// both corners bit for bit.
    ///
    /// Rounding can move the midpoint and change the achieved extent. Outward narrowing encloses
    /// the computed `f64` corners, not necessarily the exact real-valued result: earlier `f64`
    /// rounding can leave an extent slightly short of its target.
    ///
    /// # Warning
    ///
    /// Corner spacing can be comparable to the box's extent far from the origin. For example,
    /// `[2²⁴, 0]..[2²⁴ + 2, 2]` grown to ratio 2 becomes `[2²⁴ - 1, 0]..[2²⁴ + 4, 2]`, with
    /// ratio 2.5. The requested upper corner `2²⁴ + 3` lies between adjacent `f32` values.
    /// Containment takes precedence over an exact ratio.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let bounds = Bounds2::new(Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0))
    ///     .expect("corners are finite and ordered");
    /// let ratio = Positive::new(4.0).expect("4 is positive");
    ///
    /// // The box is 16 by 2, wider than 4:1, so the height grows to 4 and the width stays.
    /// let viewport = bounds
    ///     .with_aspect_ratio(ratio)
    ///     .expect("the grown corners are far inside the `f32` range");
    /// assert_eq!(viewport.size(), Vec2::new(16.0, 4.0));
    /// assert_eq!(viewport.centre(), bounds.centre());
    /// ```
    #[inline]
    #[must_use]
    pub(crate) const fn with_aspect_ratio(self, ratio: Positive) -> Self {
        let size = self.size();
        let centre = self.centre();

        // Both components read the original size, so exactly one axis
        // grows: whichever is short for the ratio.
        let half = Vec2::new(
            size.x().max(size.y() * ratio),
            size.y().max(size.x() / ratio),
        ) * 0.5;

        Self {
            min: centre - half,
            max: centre + half,
        }
    }

    /// Scales the box about its centre by `factor`.
    ///
    /// The result contains this box for a factor above one and lies within it for a factor below
    /// one. A factor of one returns the box bit for bit. Rounding follows
    /// [`with_aspect_ratio`](Self::with_aspect_ratio) and can leave an axis unchanged when its
    /// corners are adjacent `f32` values.
    ///
    /// Returns [`None`] when a scaled corner would lie beyond the finite `f32` range.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{Bounds2, Positive, Vec2};
    ///
    /// let bounds =
    ///     Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("corners are finite and ordered");
    /// let margin = Positive::new(1.5).expect("1.5 is positive");
    ///
    /// let widened = bounds
    ///     .scaled_about_centre(margin)
    ///     .expect("the scaled corners are far inside the `f32` range");
    /// assert_eq!(widened.min(), Vec2::splat(-1.5));
    /// assert_eq!(widened.max(), Vec2::splat(1.5));
    /// ```
    #[inline]
    #[must_use]
    pub(crate) const fn scaled_about_centre(self, factor: Positive) -> Self {
        let centre = self.centre();
        let half = self.size() * (factor * 0.5);

        Self {
            min: centre - half,
            max: centre + half,
        }
    }

    /// Fits an axis-aligned transform from this box to `target`.
    ///
    /// In exact arithmetic, independent scale and translation map each source endpoint to the
    /// corresponding target endpoint. Fit a layout's extent, then apply the transform in batches to
    /// map points into viewport coordinates. The `f32` extents, scales and composed coefficients
    /// round, and endpoint equality is not guaranteed.
    ///
    /// Returns [`None`] when a source extent computed by [`Self::size`] is zero, subnormal or
    /// infinite. Widen with [`Self::with_minimum_extent`] first when the point set may be
    /// collinear. Target extents and computed coefficients are not validated: target-extent or
    /// scale overflow can produce a transform containing infinities or NaNs. Use
    /// [`Self::normalize_into`] for per-point mapping with widened arithmetic.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{Bounds2, Vec2};
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

    /// Maps points between boxes with per-axis double-precision arithmetic.
    ///
    /// For source axis [a, b] and target axis [c, d], the map is
    /// c + (p − a) · (d − c)/(b − a) in exact arithmetic. A zero-extent source axis maps to the
    /// target midpoint. Points outside this box extrapolate along the same map.
    ///
    /// Coordinates widen before the differences are formed. Computing the unit coordinate
    /// before target scaling avoids an `f32` scale-translation composition that loses small
    /// offsets far from the origin. The `f64` operations still round before the final narrowing.
    /// Cancellation near zero can magnify their error in output ULPs, and a rounded target
    /// extent can prevent even a source endpoint from reaching its target endpoint exactly.
    /// Extrapolated results can overflow to infinity.
    ///
    /// The parallel batch and scalar remainder use the same sequence of rounded operations.
    /// Finite input points give the same results regardless of the split. NaN payloads are not
    /// part of this agreement.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{Bounds2, Vec2};
    ///
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
    /// Divides the coordinate's offset from the minimum by the extent returned by [`Self::size`],
    /// then scales by 2³². The offset and division use `f64`, but the extent is already rounded
    /// to `f32`. The float-to-integer conversion truncates toward zero and saturates to the
    /// `u32` range. NaN maps to cell zero.
    ///
    /// # Warning
    ///
    /// Rounding the extent can move a grid boundary, including making the maximum corner map
    /// below the last cell. A zero or infinite extent maps every coordinate to cell zero. This
    /// operation does not guarantee exact quantization of the real-valued box.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{Bounds2, Vec2};
    ///
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
    // the cast saturates the computed scaled value: negatives and NaN become zero, and values at or
    // above u32::MAX become the last cell.
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
    /// Builds the map sending `[minimum, maximum]` onto `[target_minimum, target_maximum]`.
    ///
    /// Every input widens to `f64` before the extents and the target midpoint are formed.
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
        // fusion rounds the target product-plus-sum once. The unit coordinate and target
        // extent already carry any rounding from their construction.
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
