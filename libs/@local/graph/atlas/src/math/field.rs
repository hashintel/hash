//! A point slice proven finite at construction, and the statistics defined over it.
//!
//! A consumer that needs a finite field takes the field instead of scanning the slice itself,
//! so the finiteness proof lives in one constructor and the consuming arithmetic restates
//! nothing. The statistics accumulate in double precision over fixed chunk boundaries with
//! ordered folds, so every reading is bit-deterministic under any thread schedule and a caller
//! may persist it and replay it exactly.

use alloc::alloc::Allocator;
use core::{
    ops::{Deref, Index},
    simd::{Simd, num::SimdFloat as _},
};

use hashql_core::id::{Id, IdSlice, IdVec};
use rayon::iter::ParallelIterator as _;

use super::{
    NonFinitePoint, NonNegative, Vec2SliceExt as _,
    dvec2::{DVec2, DVec2x4T},
    vec2::{Vec2, Vec2x4},
};

/// Points per parallel chunk in the point-statistics reductions.
pub(super) const POINT_CHUNK: usize = 4096;

/// Folds per-chunk partials over a midpoint-split tree, in a fixed combination order.
///
/// The leaves are [`POINT_CHUNK`]-sized chunks and every split occurs at a chunk boundary at
/// the chunk count's midpoint, so the combination tree depends only on the point count and
/// the fold is bit-deterministic under any thread schedule. [`rayon::join`] parallelizes the
/// halves while the combine positions stay fixed by the tree.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the midpoint split floors deliberately: the left half takes the smaller chunk \
              count, and the split rule is what fixes the tree's shape"
)]
fn tree_fold<R>(
    points: &[Vec2],
    leaf: &(impl Fn(&[Vec2]) -> R + Sync),
    combine: &(impl Fn(R, R) -> R + Sync),
) -> R
where
    R: Send,
{
    let chunks = points.len().div_ceil(POINT_CHUNK);
    if chunks <= 1 {
        return leaf(points);
    }

    let (left, right) = points.split_at((chunks / 2) * POINT_CHUNK);
    let (lhs, rhs) = rayon::join(
        || tree_fold(left, leaf, combine),
        || tree_fold(right, leaf, combine),
    );

    combine(lhs, rhs)
}

/// Accumulates one chunk's coordinate sum in double precision, four points at a time.
fn chunk_coordinate_sum(points: &[Vec2]) -> DVec2 {
    let (batches, rest) = points.iter_transposed_wide();

    let mut sum = DVec2x4T::ZERO;
    for batch in batches {
        sum += batch;
    }

    let sum = sum.reduce_sum();
    rest.fold(sum, core::ops::Add::add)
}

/// Accumulates one chunk's squared distances to the centre in double precision.
///
/// The batches ride SIMD lanes and a scalar tail closes the chunk.
fn chunk_squared_deviations(points: &[Vec2], centre: DVec2) -> f64 {
    let (batches, rest) = points.iter_transposed_wide();

    let centres = DVec2x4T::splat(centre);
    let mut squares = Simd::splat(0.0_f64);
    for batch in batches {
        let deviation = batch - centres;
        squares += deviation.length_squared();
    }

    let mut sum = squares.reduce_sum();
    for point in rest {
        sum += point.distance_squared(centre);
    }

    sum
}

/// A view of a point slice whose every coordinate is finite, proven at construction.
///
/// The constructor owns the finiteness scan, four points at a time on SIMD lanes, and a
/// consumer holding a field divides, squares, and folds without re-checking. Reads flow
/// through the slice's own API, and every write path carries the `_unchecked` suffix -
/// [`as_raw_mut_unchecked`](Self::as_raw_mut_unchecked) and its siblings - where the caller
/// keeps the proof.
#[derive(Debug, PartialEq, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct FinitePointField<I>(IdSlice<I, Vec2>);

impl<I> FinitePointField<I>
where
    I: Id,
{
    /// Validates every point finite and wraps the slice.
    ///
    /// The scan runs serially, four points at a time on SIMD lanes. The `math_kernels`
    /// bench's `finite_scan` group holds the choice to wall-time measurement on an arm64
    /// Apple-silicon host: rayon's per-point search trails the serial scan at every measured
    /// count from 2¹² through 2²⁰ (above 100× at 2¹⁴, above 4× at 2²⁰), and a chunked rayon
    /// distribution of the serial scan's own batch predicate reads near parity at 2¹² and
    /// decisively behind from 2¹⁴ through 2²⁰, because fork-join overhead dominates a
    /// memory-bound predicate.
    ///
    /// # Errors
    ///
    /// Returns the smallest index whose point has a NaN or infinite component.
    pub(crate) fn new(points: &IdSlice<I, Vec2>) -> Result<&Self, NonFinitePoint<I>> {
        let (prefix, aligned, suffix) = Vec2x4::from_slice(points.as_raw());
        if !prefix.iter().all(|point| point.is_finite())
            || !suffix.iter().all(|point| point.is_finite())
            || !aligned.iter().all(|points| points.is_finite())
        {
            let Some(id) = points
                .iter_enumerated()
                .find_map(|(id, point)| (!point.is_finite()).then_some(id))
            else {
                unreachable!("the batch predicate found a non-finite component");
            };

            return Err(NonFinitePoint { id });
        }

        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the reference
        // reinterprets in place at the same layout, and the borrow keeps the input's lifetime.
        let this = unsafe { &*((&raw const *points) as *const Self) };
        Ok(this)
    }

    /// Validates every point finite and wraps the owned slice, without a copy.
    ///
    /// The boxed form of [`new`](Self::new).
    ///
    /// # Errors
    ///
    /// Returns the smallest index whose point has a NaN or infinite component.
    pub(crate) fn new_boxed<A: Allocator>(
        points: Box<IdSlice<I, Vec2>, A>,
    ) -> Result<Box<Self, A>, NonFinitePoint<I>> {
        let _this = Self::new(&points)?;

        let (ptr, alloc) = Box::into_raw_with_allocator(points);

        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the box pointer
        // reinterprets in place at the same layout, in the same allocator.
        let this = unsafe { Box::from_raw_in(ptr as *mut Self, alloc) };
        Ok(this)
    }

    /// Wraps a slice the caller proves finite.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) scans instead.
    // Correctness, never memory safety: a broken promise yields wrong statistics downstream,
    // so the checked-domain claim stays a debug assertion rather than an `unsafe` contract.
    #[inline]
    #[must_use]
    pub(crate) fn new_unchecked(points: &IdSlice<I, Vec2>) -> &Self {
        debug_assert!(
            points.iter().all(|point| point.is_finite()),
            "the caller promised a finite point set",
        );

        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the reference
        // reinterprets in place at the same layout, and the borrow keeps the input's lifetime.
        unsafe { &*((&raw const *points) as *const Self) }
    }

    /// Wraps a mutable slice the caller proves finite, and keeps finite.
    ///
    /// The mutable form of [`new_unchecked`](Self::new_unchecked): every write through
    /// [`as_raw_mut_unchecked`](Self::as_raw_mut_unchecked) must land a finite value.
    // Correctness, never memory safety: a broken promise yields wrong statistics downstream.
    #[inline]
    #[must_use]
    pub(crate) fn new_unchecked_mut(points: &mut IdSlice<I, Vec2>) -> &mut Self {
        debug_assert!(
            points.iter().all(|point| point.is_finite()),
            "the caller promised a finite point set",
        );

        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the reference
        // reinterprets in place at the same layout, and the borrow keeps the input's lifetime
        // and exclusivity.
        unsafe { &mut *((&raw mut *points) as *mut Self) }
    }

    /// Wraps an owned slice the caller proves finite, without a copy.
    ///
    /// The boxed form of [`new_unchecked`](Self::new_unchecked), for an owner that stores the
    /// proof beside the points.
    // Correctness, never memory safety: a broken promise yields wrong statistics downstream.
    #[must_use]
    pub(crate) fn new_boxed_unchecked<A: Allocator>(
        points: Box<IdSlice<I, Vec2>, A>,
    ) -> Box<Self, A> {
        debug_assert!(
            points.iter().all(|point| point.is_finite()),
            "the caller promised a finite point set",
        );

        let (ptr, alloc) = Box::into_raw_with_allocator(points);

        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the box pointer
        // reinterprets in place at the same layout, in the same allocator.
        unsafe { Box::from_raw_in(ptr as *mut Self, alloc) }
    }

    /// Returns the underlying point slice.
    #[inline]
    #[must_use]
    pub(crate) const fn as_slice(&self) -> &IdSlice<I, Vec2> {
        &self.0
    }

    /// Returns the underlying point slice mutably; every write must land a finite value.
    ///
    /// The mutable form of [`as_slice`](Self::as_slice): the caller keeps the proof, exactly
    /// as through [`as_raw_mut_unchecked`](Self::as_raw_mut_unchecked).
    #[inline]
    #[must_use]
    pub(crate) const fn as_slice_mut_unchecked(&mut self) -> &mut IdSlice<I, Vec2> {
        &mut self.0
    }

    /// Gathers the named rows into an owned field over the gather's own row domain.
    ///
    /// Each entry of `rows` names a row of this field, and the returned field reads the
    /// gathered points in `rows` order. A gather from a proven-finite field stays finite, so
    /// the proof carries over with no scan.
    ///
    /// # Panics
    ///
    /// This panics when a row id lies outside this field's row domain.
    #[must_use]
    pub(crate) fn gather<A: Id>(&self, rows: &IdSlice<A, I>) -> Box<FinitePointField<A>> {
        let gathered: IdVec<A, Vec2> = rows.iter().map(|&row| self.0[row]).collect();

        FinitePointField::new_boxed_unchecked(gathered.into_boxed_slice())
    }

    /// Returns the raw mutable rows, and the caller keeps every write finite.
    ///
    /// The write path for a kernel whose own vocabulary is raw rows. The caller holds the
    /// finiteness proof, and every value written must be finite when the borrow ends.
    // Correctness, never memory safety: a non-finite write yields wrong statistics downstream.
    #[inline]
    #[must_use]
    pub(crate) const fn as_raw_mut_unchecked(&mut self) -> &mut [Vec2] {
        self.0.as_raw_mut()
    }

    /// Returns the largest absolute coordinate component over the whole field.
    ///
    /// Maximum folds are order-independent over a finite set, so the reading is
    /// bit-deterministic under any thread schedule.
    #[must_use]
    pub(crate) fn extent(&self) -> NonNegative {
        let largest = self
            .0
            .par_chunks(POINT_CHUNK)
            .map(|chunk| {
                let (prefix, interleaved, suffix) = chunk.as_interleaved();

                let rest = prefix
                    .iter()
                    .chain(suffix)
                    .fold(Vec2::ZERO, |lhs, rhs| rhs.abs().max(lhs));

                let max = interleaved
                    .iter()
                    .fold(Vec2x4::splat(Vec2::ZERO), |lhs, rhs| rhs.abs().max(lhs));

                let max = max.reduce_max().max(rest);
                max.x().max(max.y())
            })
            .reduce(|| 0.0_f32, f32::max);

        // In domain with no check: a maximum of absolute components of finite points is finite
        // and at least zero, and the empty fold's identity is zero.
        NonNegative::new_unchecked(largest)
    }

    /// Returns the centroid in double precision.
    ///
    /// Chunks of [`POINT_CHUNK`] points accumulate four points at a time on SIMD lanes, and
    /// the partials combine through [`tree_fold`]'s fixed-shape tree, so the reading is
    /// bit-deterministic under any thread schedule and allocates nothing.
    ///
    /// # Panics
    ///
    /// This panics when the field is empty, because an empty set has no centroid.
    #[must_use]
    #[expect(
        clippy::cast_precision_loss,
        reason = "point counts sit far below 2^53, so the count converts exactly"
    )]
    pub(crate) fn centroid(&self) -> DVec2 {
        assert!(!self.0.is_empty(), "a centroid needs at least one point");

        let count = self.0.len() as f64;
        let total = tree_fold(self.0.as_raw(), &chunk_coordinate_sum, &|lhs, rhs| {
            lhs + rhs
        });

        total / count
    }

    /// Returns the sum of squared distances from the points to `centre`, in double precision.
    ///
    /// The reduction is chunked and shaped exactly like [`centroid`](Self::centroid)'s, so it
    /// is bit-deterministic under any thread schedule.
    #[must_use]
    pub(crate) fn squared_deviation_sum(&self, centre: DVec2) -> f64 {
        tree_fold(
            self.0.as_raw(),
            &|chunk| chunk_squared_deviations(chunk, centre),
            &|lhs, rhs| lhs + rhs,
        )
    }

    /// Returns the RMS spread of the points about their centroid, in double precision.
    ///
    /// The centroid pass runs first and the mean-squared-distance pass second, both through
    /// the deterministic chunked reductions above.
    ///
    /// # Panics
    ///
    /// This panics when the field is empty, because an empty set has no centroid to spread
    /// about.
    #[expect(
        clippy::cast_precision_loss,
        reason = "point counts sit far below 2^53, so the count converts exactly"
    )]
    #[must_use]
    pub(crate) fn rms_spread(&self) -> f64 {
        let count = self.0.len() as f64;

        (self.squared_deviation_sum(self.centroid()) / count).sqrt()
    }

    /// Views the rows below `bound` as a field.
    ///
    /// A prefix of a proven-finite field stays finite, so the proof carries over with no scan.
    #[inline]
    #[must_use]
    pub(crate) fn prefix(&self, bound: I) -> &Self {
        Self::new_unchecked(self.0.prefix(bound))
    }

    /// Views the rows below `bound` as a mutable field.
    ///
    /// The mutable form of [`prefix`](Self::prefix): writes through the view carry the same
    /// keep-it-finite contract as [`as_raw_mut_unchecked`](Self::as_raw_mut_unchecked).
    #[inline]
    pub(crate) fn prefix_mut(&mut self, bound: I) -> &mut Self {
        Self::new_unchecked_mut(self.0.prefix_mut(bound))
    }
}

const impl<I> Deref for FinitePointField<I> {
    type Target = IdSlice<I, Vec2>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

const impl<I> Index<I> for FinitePointField<I>
where
    IdSlice<I, Vec2>: [const] Index<I>,
{
    type Output = <IdSlice<I, Vec2> as Index<I>>::Output;

    fn index(&self, index: I) -> &Self::Output {
        &self.0[index]
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        reason = "exactness assertions on constructed dyadic values are bit-precise contracts"
    )]

    use hashql_core::id::{Id as _, IdSlice};

    use super::{DVec2, FinitePointField, NonFinitePoint, Vec2};

    hashql_core::id::newtype! {
        /// The test fields' row domain.
        #[id(const)]
        struct RowId(u32)
    }

    hashql_core::id::newtype! {
        /// The gather tests' target domain.
        #[id(const)]
        struct DrawId(u32)
    }

    /// Enough points to cover the prefix, batch, and suffix regions of the SIMD split.
    fn points() -> Vec<Vec2> {
        (0..11_u8)
            .map(|index| Vec2::new(f32::from(index), -f32::from(index)))
            .collect()
    }

    #[test]
    fn the_scan_admits_a_finite_set_and_names_the_smallest_offender() {
        let finite = points();
        let field = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&finite))
            .expect("every point is finite");
        assert_eq!(field.len(), finite.len());
        assert_eq!(field.as_slice().as_raw().as_ptr(), finite.as_ptr());

        for offender in 0..finite.len() {
            let mut poisoned = finite.clone();
            poisoned[offender] = Vec2::new(f32::NAN, 0.0);
            assert_eq!(
                FinitePointField::new(IdSlice::<RowId, _>::from_raw(&poisoned)),
                Err(NonFinitePoint {
                    id: RowId::from_usize(offender)
                }),
                "the scan should name the poisoned index"
            );

            poisoned[offender] = Vec2::new(0.0, f32::INFINITY);
            assert_eq!(
                FinitePointField::new(IdSlice::<RowId, _>::from_raw(&poisoned)),
                Err(NonFinitePoint {
                    id: RowId::from_usize(offender)
                }),
            );
        }
    }

    #[test]
    fn gather_carries_the_points_in_draw_order() {
        let points = points();
        let field = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&points))
            .expect("every point is finite");

        let rows = [
            RowId::from_usize(4),
            RowId::from_usize(0),
            RowId::from_usize(10),
        ];
        let gathered = field.gather(IdSlice::<DrawId, _>::from_raw(&rows));

        assert_eq!(gathered.len(), rows.len());
        assert_eq!(
            gathered.as_slice().as_raw(),
            [points[4], points[0], points[10]]
        );
    }

    #[test]
    #[should_panic(expected = "index out of bounds")]
    fn gather_panics_outside_the_row_domain() {
        let points = points();
        let field = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&points))
            .expect("every point is finite");

        let rows = [RowId::from_usize(11)];
        let _: Box<FinitePointField<DrawId>> = field.gather(IdSlice::<DrawId, _>::from_raw(&rows));
    }

    #[test]
    fn the_statistics_read_exact_dyadic_values() {
        // Centroid (2, -1), deviations (∓2, ±1): the sums are exact dyadics.
        let square = [
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, -2.0),
            Vec2::new(0.0, -2.0),
            Vec2::new(4.0, 0.0),
        ];
        let field = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&square))
            .expect("the square is finite");

        assert_eq!(field.centroid(), DVec2::new(2.0, -1.0));
        assert_eq!(field.squared_deviation_sum(DVec2::new(2.0, -1.0)), 20.0);
        assert_eq!(field.rms_spread(), 5.0_f64.sqrt());
    }
}
