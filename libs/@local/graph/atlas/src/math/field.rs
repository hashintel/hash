//! Finite point fields and their geometric statistics.
//!
//! [`FinitePointField`] retains a finiteness check across borrowed and owned point storage. For
//! points pᵢ ∈ ℝ² and count n > 0, the centroid is μ = Σpᵢ/n, the squared-deviation sum about c ∈
//! ℝ² is S(c) = Σ‖pᵢ − c‖², and RMS spread is √(S(μ)/n). Extent is the greatest absolute
//! coordinate, maxᵢ max(|pᵢₓ|, |pᵢᵧ|).
//!
//! Coordinates widen exactly from finite `f32` to `f64`. Sums, squared distances and normalization
//! still round, including conversion of counts above 2⁵³. Fixed point chunks and a fixed
//! combination tree keep the grouping independent of Rayon scheduling. This preserves the reduction
//! order within a build, without specifying bitwise agreement across builds or SIMD
//! implementations.

use alloc::alloc::Allocator;
use core::{
    num::NonZero,
    ops::{Deref, Index},
    simd::{Simd, num::SimdFloat as _},
};
use std::alloc::Global;

use hashql_core::id::{Id, IdSlice, IdVec};
use rayon::iter::ParallelIterator as _;

use super::{
    NonFinitePoint, NonNegative, Vec2SliceExt as _,
    dvec2::{DVec2, DVec2x4T},
    vec2::{Vec2, Vec2x4},
};

/// Points per parallel chunk in the point-statistics reductions.
pub(super) const POINT_CHUNK: NonZero<usize> = NonZero::new(4096).unwrap();

/// Folds point chunks over a midpoint-split tree in a fixed combination order.
///
/// Leaves have at most [`POINT_CHUNK`] points, including an empty leaf for empty input. Every split
/// is at a chunk boundary and divides the chunk count at its midpoint. [`rayon::join`] preserves
/// the left and right result positions regardless of execution order. Therefore deterministic
/// `leaf` and `combine` callbacks give a schedule-independent result.
///
/// # Panics
///
/// Propagates a panic from either callback.
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
    let chunks = points.len().div_ceil(POINT_CHUNK.get());
    if chunks <= 1 {
        return leaf(points);
    }

    let (left, right) = points.split_at((chunks / 2) * POINT_CHUNK.get());
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
/// Complete four-point batches accumulate per-lane squared deviations before reduction. Remaining
/// points add their separately rounded scalar distances afterward.
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

/// A typed point slice whose coordinates are finite.
///
/// [`new`](Self::new) validates the initial points and [`copy_from`](Self::copy_from) validates
/// replacements before writing them. Writes through the `_unchecked` methods must preserve
/// finiteness. Indexing selects a row by its ID and panics outside the slice's bounds.
#[derive(Debug, PartialEq, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct FinitePointField<I>(IdSlice<I, Vec2>);

impl<I> FinitePointField<I>
where
    I: Id,
{
    /// Allocates `count` points at the origin in the global allocator.
    ///
    /// # Panics
    ///
    /// Panics if the point-slice layout cannot be represented. See [`Self::zeroed_in`].
    #[inline]
    #[must_use]
    pub(crate) fn zeroed(count: usize) -> Box<Self> {
        Self::zeroed_in(count, Global)
    }

    /// Allocates `count` points at the origin in `alloc`.
    ///
    /// The origin is finite. Zero-initialization establishes the field's invariant without a
    /// coordinate scan. Allocation failure follows [`Box::new_zeroed_slice_in`].
    ///
    /// # Panics
    ///
    /// Panics if the point-slice layout cannot be represented.
    #[inline]
    pub(crate) fn zeroed_in<A: Allocator>(count: usize, alloc: A) -> Box<Self, A> {
        const {
            /// Requires `T` to admit the all-zero bit pattern at compile time.
            const fn assert_is_zeroed<T: zerocopy::FromZeros>() {}
            assert_is_zeroed::<Vec2>();

            let bytes = [0_u8; size_of::<Vec2>()];
            let vec: Vec2 = zerocopy::transmute!(bytes);
            assert!(vec == Vec2::ZERO);
            assert!(vec.is_finite());
        }

        // SAFETY: assume_init requires every point to be initialized as Vec2. The boxed constructor
        // supplies zeroed storage, and the compile-time FromZeros check and value assertions
        // establish that an all-zero Vec2 is valid and finite. Therefore all elements may be
        // assumed initialized, including the vacuous empty slice.
        let boxed = unsafe { Box::new_zeroed_slice_in(count, alloc).assume_init() };
        let boxed = IdSlice::from_boxed_slice(boxed);

        Self::new_boxed_unchecked(boxed)
    }

    /// Validates every point as finite and borrows the slice in place.
    ///
    /// # Errors
    ///
    /// Returns [`NonFinitePoint`] with the smallest ID whose point has a NaN or infinite component.
    ///
    /// # Panics
    ///
    /// If a non-finite point is found, panics when an index needed by [`IdSlice::iter_enumerated`]
    /// is outside `I`'s range. Before scanning for the offender, that enumeration checks the
    /// slice's last index because raw typed-slice construction does not establish ID
    /// representability.
    pub(crate) fn new(points: &IdSlice<I, Vec2>) -> Result<&Self, NonFinitePoint<I>> {
        // On the measured arm64 Apple-silicon host, the math_kernels finite_scan benchmark's serial
        // four-point scan beat Rayon's per-point search at sampled counts from 2¹² through 2²⁰
        // points, by over 100× at 2¹⁴ and over 4× at 2²⁰. Distributing the same batch predicate
        // over Rayon chunks was near parity at 2¹² and slower at sampled counts from 2¹⁴ through
        // 2²⁰. These wall-time measurements select the serial scan.
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

        // SAFETY: repr(transparent) preserves the IdSlice layout and metadata. The source is
        // initialized and shared for the returned lifetime, and the scan established the field's
        // finiteness invariant. Therefore the cast preserves reference validity and the field
        // contract.
        let this = unsafe { &*((&raw const *points) as *const Self) };
        Ok(this)
    }

    /// Validates every point as finite and retains the owned slice without copying.
    ///
    /// The boxed form of [`new`](Self::new). An error drops the supplied allocation.
    ///
    /// # Errors
    ///
    /// Returns [`NonFinitePoint`] with the smallest ID whose point has a NaN or infinite component.
    ///
    /// # Panics
    ///
    /// Panics under [`Self::new`]'s ID-range condition.
    pub(crate) fn new_boxed<A: Allocator>(
        points: Box<IdSlice<I, Vec2>, A>,
    ) -> Result<Box<Self, A>, NonFinitePoint<I>> {
        let _this = Self::new(&points)?;

        let (ptr, alloc) = Box::into_raw_with_allocator(points);

        // SAFETY: Box::from_raw_in requires unique ownership of a valid allocation with the target
        // layout. into_raw_with_allocator transfers that ownership and the allocator, and
        // repr(transparent) preserves the initialized slice's layout and metadata. The scan
        // established finiteness. Therefore the reconstructed box retains the same valid allocation
        // and field invariant.
        let this = unsafe { Box::from_raw_in(ptr as *mut Self, alloc) };
        Ok(this)
    }

    /// Wraps a slice the caller proves finite.
    ///
    /// Where the proof is not immediate, [`new`](Self::new) scans instead.
    // finiteness concerns correctness alone and imposes no memory-safety requirement.
    #[inline]
    #[must_use]
    pub(crate) fn new_unchecked(points: &IdSlice<I, Vec2>) -> &Self {
        debug_assert!(
            points.iter().all(|point| point.is_finite()),
            "the caller promised a finite point set",
        );

        // SAFETY: repr(transparent) preserves the initialized IdSlice's layout and metadata. The
        // pointer keeps its provenance and shared borrow lifetime. Finiteness is a separate
        // correctness obligation on the caller. Therefore the cast preserves Rust reference
        // validity.
        unsafe { &*((&raw const *points) as *const Self) }
    }

    /// Wraps a mutable slice the caller proves finite, and keeps finite.
    ///
    /// The mutable form of [`new_unchecked`](Self::new_unchecked): every write through
    /// [`as_raw_mut_unchecked`](Self::as_raw_mut_unchecked) must preserve finite coordinates.
    // Correctness, never memory safety: a broken promise yields wrong statistics downstream.
    #[inline]
    #[must_use]
    pub(crate) fn new_unchecked_mut(points: &mut IdSlice<I, Vec2>) -> &mut Self {
        debug_assert!(
            points.iter().all(|point| point.is_finite()),
            "the caller promised a finite point set",
        );

        // SAFETY: repr(transparent) preserves the initialized IdSlice's layout and metadata. The
        // pointer keeps its provenance and exclusive borrow lifetime. Finiteness is a separate
        // correctness obligation on the caller. Therefore the cast preserves Rust reference
        // validity.
        unsafe { &mut *((&raw mut *points) as *mut Self) }
    }

    /// Wraps an owned slice the caller proves finite, without a copy.
    ///
    /// The boxed form of [`new_unchecked`](Self::new_unchecked).
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

        // SAFETY: Box::from_raw_in requires unique ownership of a valid allocation with the target
        // layout. into_raw_with_allocator transfers that ownership and the allocator, and
        // repr(transparent) preserves the initialized slice's layout and metadata. Finiteness
        // remains the caller's correctness obligation. Therefore reconstructing the box preserves
        // allocation and value validity.
        unsafe { Box::from_raw_in(ptr as *mut Self, alloc) }
    }

    /// Copies finite points into the rows starting at `offset`.
    ///
    /// # Errors
    ///
    /// Returns the first non-finite point's destination id and leaves the field unchanged.
    ///
    /// # Panics
    ///
    /// Panics if the destination range extends beyond the field. If validation finds a non-finite
    /// point, it also panics under [`Self::new`]'s ID-range condition or when the translated error
    /// ID is outside `I`'s range.
    pub(crate) fn copy_from(
        &mut self,
        offset: I,
        points: &IdSlice<I, Vec2>,
    ) -> Result<(), NonFinitePoint<I>> {
        let target = &mut self.0.as_raw_mut()[offset.as_usize()..][..points.len()];
        let finite = Self::new(points).map_err(|error| NonFinitePoint {
            id: offset.plus(error.id.as_usize()),
        })?;
        target.copy_from_slice(finite.as_slice().as_raw());

        Ok(())
    }

    /// Returns the underlying point slice.
    #[inline]
    #[must_use]
    pub(crate) const fn as_slice(&self) -> &IdSlice<I, Vec2> {
        &self.0
    }

    /// Borrows the typed points mutably, with finiteness maintained by the caller.
    ///
    /// Every coordinate must be finite when the borrow ends, as for [`Self::as_raw_mut_unchecked`].
    #[inline]
    #[must_use]
    pub(crate) const fn as_slice_mut_unchecked(&mut self) -> &mut IdSlice<I, Vec2> {
        &mut self.0
    }

    /// Gathers the named rows into an owned field over the gather's own row domain.
    ///
    /// Each entry of `rows` names a row of this field. The gather copies the proven-finite points
    /// in `rows` order without arithmetic. The returned field is finite without another scan.
    ///
    /// # Panics
    ///
    /// This panics when a row id lies outside this field's row domain.
    #[must_use]
    pub(crate) fn gather<A: Id>(&self, rows: &IdSlice<A, I>) -> Box<FinitePointField<A>> {
        let gathered: IdVec<A, Vec2> = rows.iter().map(|&row| self.0[row]).collect();

        FinitePointField::new_boxed_unchecked(gathered.into_boxed_slice())
    }

    /// Borrows the raw points mutably, with finiteness maintained by the caller.
    ///
    /// Every coordinate must be finite when the borrow ends.
    // Correctness, never memory safety: a non-finite write yields wrong statistics downstream.
    #[inline]
    #[must_use]
    pub(crate) const fn as_raw_mut_unchecked(&mut self) -> &mut [Vec2] {
        self.0.as_raw_mut()
    }

    /// Returns the largest absolute coordinate component over the whole field.
    ///
    /// The empty field gives zero. Absolute values make all zeros positive, and maximum over the
    /// finite non-negative components is order-independent.
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

        // Absolute finite f32 coordinates remain finite and non-negative. Each fold selects a
        // component or its zero identity. Therefore the maximum satisfies NonNegative's domain.
        NonNegative::new_unchecked(largest)
    }

    /// Returns the centroid in double precision.
    ///
    /// Approximates μ = Σpᵢ/n using double-precision accumulation and normalization. Chunk
    /// boundaries and the combination tree are fixed by the point order and count, independently of
    /// Rayon scheduling.
    ///
    /// # Panics
    ///
    /// This panics when the field is empty, because an empty set has no centroid.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the point count is converted to f64 for double-precision centroid arithmetic"
    )]
    #[must_use]
    pub(crate) fn centroid(&self) -> DVec2 {
        assert!(!self.0.is_empty(), "a centroid needs at least one point");

        let count = self.0.len() as f64;
        let total = tree_fold(self.0.as_raw(), &chunk_coordinate_sum, &|lhs, rhs| {
            lhs + rhs
        });

        total / count
    }

    /// Accumulates squared distances from `centre` in double precision.
    ///
    /// Approximates S(c) = Σ‖pᵢ − c‖² with the schedule-independent grouping of [`Self::centroid`].
    /// An empty field gives zero. The supplied centre is unrestricted, and nonempty calculations
    /// can produce non-finite results for a non-finite or sufficiently large centre.
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
    /// Approximates √(S(μ)/n), using the computed centroid μ followed by a squared-deviation pass.
    /// Both passes retain the schedule-independent grouping of [`Self::centroid`].
    ///
    /// # Panics
    ///
    /// This panics when the field is empty, because an empty set has no centroid to spread
    /// about.
    #[expect(
        clippy::cast_precision_loss,
        reason = "double-precision RMS normalization uses the point count as f64"
    )]
    #[must_use]
    pub(crate) fn rms_spread(&self) -> f64 {
        let count = self.0.len() as f64;

        (self.squared_deviation_sum(self.centroid()) / count).sqrt()
    }

    /// Views the rows below `bound` as a field.
    ///
    /// Taking a prefix preserves the finiteness invariant.
    ///
    /// # Panics
    ///
    /// Panics if `bound` exceeds the field length.
    #[inline]
    #[must_use]
    pub(crate) fn prefix(&self, bound: I) -> &Self {
        Self::new_unchecked(self.0.prefix(bound))
    }

    /// Views the rows below `bound` as a mutable field.
    ///
    /// Writes through the view must preserve finiteness, as for [`Self::as_raw_mut_unchecked`].
    ///
    /// # Panics
    ///
    /// Panics if `bound` exceeds the field length.
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
        ///
        #[id(const)]
        struct RowId(u32)
    }

    hashql_core::id::newtype! {
        /// The gather tests' target domain.
        ///
        #[id(const)]
        struct DrawId(u32)
    }

    /// Generates eleven finite points for slice-alignment tests.
    fn points() -> Vec<Vec2> {
        (0..11_u8)
            .map(|index| Vec2::new(f32::from(index), -f32::from(index)))
            .collect()
    }

    #[test]
    fn zeroed_lengths() {
        for count in [0, 1, 7] {
            let field = FinitePointField::<RowId>::zeroed(count);
            assert_eq!(field.len(), count);
            assert!(field.iter().all(|&point| point == Vec2::ZERO));
        }
    }

    #[test]
    fn copy_range() {
        let mut field = FinitePointField::<RowId>::zeroed(5);
        let replacement = [Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)];
        field
            .copy_from(RowId::new(2), IdSlice::from_raw(&replacement))
            .expect("should copy finite points");
        assert_eq!(
            field.as_slice().as_raw(),
            [
                Vec2::ZERO,
                Vec2::ZERO,
                replacement[0],
                replacement[1],
                Vec2::ZERO
            ]
        );
    }

    #[test]
    fn copy_empty() {
        for count in [0, 4] {
            let mut field = FinitePointField::<RowId>::zeroed(count);
            field
                .copy_from(RowId::from_usize(count), IdSlice::from_raw(&[]))
                .expect("should accept an empty copy at the end");
            assert_eq!(field.len(), count);
            assert!(field.iter().all(|&point| point == Vec2::ZERO));
        }
    }

    #[test]
    fn copy_non_finite() {
        for value in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            for point in [Vec2::new(value, 0.0), Vec2::new(0.0, value)] {
                let mut field = FinitePointField::<RowId>::zeroed(5);
                let replacement = [Vec2::new(1.0, 2.0), point, point];
                let error = field
                    .copy_from(RowId::new(2), IdSlice::from_raw(&replacement))
                    .expect_err("should refuse non-finite points");
                assert_eq!(error.id, RowId::new(3));
                assert_eq!(field.as_slice().as_raw(), [Vec2::ZERO; 5]);
            }
        }
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn copy_overrun() {
        let mut field = FinitePointField::<RowId>::zeroed(2);
        let _result = field.copy_from(RowId::new(1), IdSlice::from_raw(&[Vec2::ZERO; 2]));
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn copy_offset_past_end() {
        let mut field = FinitePointField::<RowId>::zeroed(2);
        let _result = field.copy_from(RowId::new(3), IdSlice::from_raw(&[]));
    }

    #[test]
    fn scan_first_non_finite() {
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
    fn gather_draw_order() {
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
    fn gather_out_of_domain() {
        let points = points();
        let field = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&points))
            .expect("every point is finite");

        let rows = [RowId::from_usize(11)];
        let _: Box<FinitePointField<DrawId>> = field.gather(IdSlice::<DrawId, _>::from_raw(&rows));
    }

    // The dyadic rectangle has centroid (2, −1) and four squared deviations of 5. The sum is
    // exactly 20, and its RMS spread is the floating-point square root of 5.
    #[test]
    fn statistics_dyadic_values() {
        // centroid (2, −1), deviations (±2, ±1)
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
