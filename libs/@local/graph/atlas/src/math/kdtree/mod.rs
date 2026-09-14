//! Nearest-neighbour readouts with row-ordered distance ties.
//!
//! [`KdTree`] indexes a borrowed [`FinitePointField`], the frame. Row queries exclude the query
//! row. Point queries accept any finite point and exclude no row. Both return up to `k` entries
//! ordered by squared distance, then row ID. Every published distance uses
//! [`Vec2::distance_squared_wide`]. Duplicated positions retain distinct row identities.
//!
//! # Example
//!
//! This in-crate example is ignored because the math API is crate-private.
//!
//! ```ignore
//! use hashql_core::id::IdSlice;
//! use crate::math::{FinitePointField, KdTree, Vec2, nz};
//! # hashql_core::id::newtype! { #[id(const)] struct RowId(u32) }
//! let points = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0), Vec2::new(0.0, 2.0)];
//! let frame = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&points))
//!     .expect("the example points are finite");
//! let tree = KdTree::build(frame);
//!
//! let neighbours = tree.nearest(RowId::new(0), nz!(2));
//! assert_eq!(neighbours[0].row, RowId::new(1));
//! assert_eq!(neighbours[1].row, RowId::new(2));
//! ```
//!
//! # Selection
//!
//! A nearest-`k` engine query can choose arbitrary members of an equal-distance class at its
//! boundary. Selecting the entire boundary class before sorting makes the row ID decide ties. The
//! first walk probes for a distance boundary. The second performs an inclusive radius query at that
//! boundary. Each candidate is re-read through [`Vec2::distance_squared_wide`], ordered by
//! `(distance_squared, row)`, and retained only if it is among the first `k`.
//!
//! With complete radius selection and the correct probed boundary, this composition equals sorting
//! a full scan. It includes every closer row and every boundary tie before applying the row
//! ordering. A row query probes one extra entry to account for its excluded zero-distance row.
//!
//! # Precision
//!
//! Finite `f32` coordinates widen exactly to `f64` before subtraction. The engine's mixed-precision
//! leaf metric squares each rounded difference separately and adds x before y, matching
//! [`Vec2::distance_squared_wide`]. Use that method when comparing published readings.
//!
//! Radius membership also depends on the engine's rectangle bounds. Their incremental `f64` updates
//! can round above the point metric at a box corner. The radius query makes no allowance for
//! outward rounding. Re-reading and sorting candidates preserves their published distances and
//! ordering, but cannot recover a row pruned at a rounding-sensitive boundary.
//!
//! # Complexity
//!
//! Construction copies the coordinates and one item per row, using soft buckets that permit
//! co-located rows to exceed [`BUCKET_ROWS`]. The point payload is 8 bytes plus the ID size per
//! row. Stem storage, leaf extents, alignment padding and spare capacity add to that payload.
//!
//! A readout performs two tree walks and sorts `m` radius candidates, where `m` can be the entire
//! frame even for a small `k`. Sorting costs O(m log m) comparisons in the worst case. The returned
//! vector retains the candidate allocation after truncation. Its initial capacity is
//! `k.saturating_add(1)`, independent of frame size. The supplied allocator controls this vector.
//! Multi-entry engine probes use separate allocations.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the k-nearest-neighbour count's literature name"
)]

use alloc::alloc::Global;
use core::{alloc::Allocator, cmp::Ordering, fmt, num::NonZero};

use hashql_core::id::{Id, IdSlice};
use kiddo::{
    QueryScratch, SquaredEuclidean, leaf_strategies::VecOfArenas,
    stem_strategies::eytzinger::Eytzinger,
};

use super::{FinitePointField, scalar::DNonNegative, vec2::Vec2};

#[cfg(test)]
mod tests;

/// A frame-row identity for the engine's stored items.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(transparent)]
struct Leaf<N>(N);

impl<N> Leaf<N> {
    /// Creates an engine item naming `row`.
    pub(crate) const fn new(row: N) -> Self {
        Self(row)
    }

    /// Returns the frame row this item names.
    pub(crate) fn row(self) -> N {
        self.0
    }
}

// kiddo's Content bound requires Default, including for a nearest-one query's initial best item.
// VecOfArenas copies populated items only. MIN is a provisional item value, not leaf padding or an
// extra ID inhabitant.
impl<N> Default for Leaf<N>
where
    N: Id,
{
    fn default() -> Self {
        Self(N::MIN)
    }
}

/// A frame row together with its squared distance to the query.
///
/// Equality and ordering compare `(distance_squared, row)`.
#[derive(Debug, Copy, Clone)]
pub(crate) struct KdNeighbour<I> {
    /// The neighbouring frame row.
    pub row: I,
    /// The row's squared distance to the query.
    ///
    /// Computed by [`Vec2::distance_squared_wide`].
    pub distance_squared: DNonNegative,
}

impl<I> PartialEq for KdNeighbour<I>
where
    I: Id,
{
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl<I> Eq for KdNeighbour<I> where I: Id {}

impl<I> PartialOrd for KdNeighbour<I>
where
    I: Id,
{
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<I> Ord for KdNeighbour<I>
where
    I: Id,
{
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        (self.distance_squared, self.row).cmp(&(other.distance_squared, other.row))
    }
}

/// The engine's target leaf size, exceeded when a split cannot separate coordinates.
const BUCKET_ROWS: usize = 32;

/// The engine over stored `f32` coordinates and frame-row identities.
type Engine<I> = kiddo::kd_tree::KdTree<
    f32,
    Leaf<I>,
    Eytzinger,
    VecOfArenas<f32, Leaf<I>, 2, BUCKET_ROWS>,
    2,
    BUCKET_ROWS,
>;

/// A nearest-neighbour index over a borrowed finite 2D frame.
///
/// Construction borrows the validated field for the tree's lifetime. Readouts use the frame's row
/// IDs. See the [module documentation](crate::math::kdtree) for the selection model, precision
/// limits and allocation costs.
pub(crate) struct KdTree<'frame, I> {
    /// The borrowed frame, indexed by row.
    points: &'frame FinitePointField<I>,
    /// The engine over the frame's stored coordinates.
    engine: Engine<I>,
}

impl<'frame, I> KdTree<'frame, I>
where
    I: Id,
{
    /// Builds an index whose row IDs address `points`.
    ///
    /// The field supplies the finite-coordinate invariant. Soft buckets permit repeated positions.
    /// Construction uses the engine's adaptive serial/parallel policy.
    ///
    /// # Panics
    ///
    /// Panics if a stored row index cannot be represented by `I` or if an engine allocation exceeds
    /// its capacity limits.
    pub(crate) fn build(points: &'frame FinitePointField<I>) -> Self {
        let engine = Engine::new_from_source_parallel(
            points.as_raw(),
            |point, axis| point[axis],
            |index, _| Leaf::new(I::from_usize(index)),
        )
        .expect(
            "the leaf strategy is soft-bucketed and items arrive from the closure, so no \
             construction error is reachable",
        );

        Self { points, engine }
    }

    /// Selects up to `k` other rows, allocating candidates in `alloc`.
    ///
    /// The readout ascends by `(distance_squared, row)`, subject to the module's radius-selection
    /// precision limits. The result retains its candidate capacity after truncation. Multi-entry
    /// engine probes allocate separately.
    ///
    /// # Panics
    ///
    /// Panics if `row` is outside the frame, if the one-past-end frame index is not representable
    /// by `I`, or if the requested candidate capacity exceeds the vector's limits. The initial
    /// reservation uses `k.saturating_add(1)` even for a smaller nonempty frame.
    #[must_use]
    pub(crate) fn nearest_in<A>(
        &self,
        row: I,
        k: NonZero<usize>,
        alloc: A,
    ) -> Vec<KdNeighbour<I>, A>
    where
        A: Allocator,
    {
        assert!(row < self.points.bound(), "row {row} is not a frame row");

        self.readout_in(self.points[row], Some(row), k, alloc)
    }

    /// Selects up to `k` other rows using the global allocator.
    ///
    /// See [`Self::nearest_in`] for ordering, precision and allocation behavior.
    ///
    /// # Panics
    ///
    /// Panics under the same conditions as [`Self::nearest_in`].
    #[must_use]
    pub(crate) fn nearest(&self, row: I, k: NonZero<usize>) -> Vec<KdNeighbour<I>> {
        self.nearest_in(row, k, Global)
    }

    /// Selects up to `k` rows near `point`, allocating candidates in `alloc`.
    ///
    /// The point needs no frame membership. No row is excluded, including a row at the same
    /// position. An empty frame returns an empty vector. Ordering and radius-selection precision
    /// follow [`Self::nearest_in`].
    ///
    /// # Panics
    ///
    /// Panics if `point` has a NaN or infinite component, or if the requested candidate capacity
    /// exceeds the vector's limits. The initial reservation uses `k.saturating_add(1)` even for a
    /// smaller nonempty frame.
    #[must_use]
    pub(crate) fn nearest_point_in<A>(
        &self,
        point: Vec2,
        k: NonZero<usize>,
        alloc: A,
    ) -> Vec<KdNeighbour<I>, A>
    where
        A: Allocator,
    {
        assert!(point.is_finite(), "the query point is finite");

        self.readout_in(point, None, k, alloc)
    }

    /// Selects up to `k` rows near `point` using the global allocator.
    ///
    /// See [`Self::nearest_point_in`] for ordering, precision and allocation behavior.
    ///
    /// # Panics
    ///
    /// Panics under the same conditions as [`Self::nearest_point_in`].
    #[must_use]
    pub(crate) fn nearest_point(&self, point: Vec2, k: NonZero<usize>) -> Vec<KdNeighbour<I>> {
        self.nearest_point_in(point, k, Global)
    }

    /// Probes a boundary, gathers its radius candidates and applies row-ordered truncation.
    ///
    /// `query` must be finite. If `exclude` is present, it must name a frame row at `query`. For N
    /// frame rows, the probe requests min(k + 1, N) entries for exclusion and min(k, N) otherwise,
    /// with saturating addition. Including the excluded zero-distance row in this count preserves
    /// the desired boundary even when the probe chooses other rows from the same tie class. The
    /// module's selection argument requires complete engine radius membership.
    ///
    /// # Panics
    ///
    /// Panics if the candidate reservation exceeds the vector's capacity limits.
    fn readout_in<A>(
        &self,
        query: Vec2,
        exclude: Option<I>,
        k: NonZero<usize>,
        alloc: A,
    ) -> Vec<KdNeighbour<I>, A>
    where
        A: Allocator,
    {
        let Some(probe_size) = NonZero::new(
            k.get()
                .saturating_add(usize::from(exclude.is_some()))
                .min(self.points.len()),
        ) else {
            return Vec::new_in(alloc);
        };

        let mut scratch = QueryScratch::new();

        // a nearest-one probe returns its boundary without a result vector. Larger probes retain a
        // bounded collection until traversal has finished, then reduce its distances to the
        // boundary.
        let boundary = if probe_size == NonZero::<usize>::MIN {
            self.engine
                .query(query.as_array())
                .nearest_one::<SquaredEuclidean<f64>>()
                .execute()
                .distance
        } else {
            let probe = self
                .engine
                .query(query.as_array())
                .nearest_n::<SquaredEuclidean<f64>>(probe_size)
                .unsorted()
                .without_items()
                .with_scratch(&mut scratch)
                .execute();

            let Some(boundary) = probe
                .into_iter()
                .map(|candidate| candidate.distance)
                .reduce(f64::max)
            else {
                return Vec::new_in(alloc);
            };

            boundary
        };

        // the probe bounds its size by the frame length, but this reservation uses k directly.
        // Radius ties can grow the candidate vector beyond this initial capacity.
        let mut readout = Vec::with_capacity_in(k.get().saturating_add(1), alloc);
        self.engine
            .query(query.as_array())
            .within::<SquaredEuclidean<f64>>(boundary)
            .unsorted()
            .with_scratch(&mut scratch)
            .visit(|candidate| {
                let row = candidate.item.row();

                if Some(row) != exclude {
                    readout.push(KdNeighbour {
                        row,
                        distance_squared: query.distance_squared_wide(self.points[row]),
                    });
                }
            });
        readout.sort_unstable();
        readout.truncate(k.get());
        readout
    }

    /// Returns the point slice the tree indexes, in row order.
    pub(crate) const fn points(&self) -> &'frame IdSlice<I, Vec2> {
        self.points
    }
}

impl<I> fmt::Debug for KdTree<'_, I> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("KdTree").finish_non_exhaustive()
    }
}
