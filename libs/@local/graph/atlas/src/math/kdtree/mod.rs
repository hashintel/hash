//! Exact k-nearest-neighbour readouts over a placed 2D frame.
//!
//! [`KdTree`] indexes a borrowed point slice, the frame, and answers the exact `k` nearest other
//! rows of any frame row, ascending by squared distance with ties resolved by row. The frame
//! arrives as an [`IdSlice`], so every readout names rows in the frame's own id domain and a
//! consumer never rediscovers which domain a raw position meant. Equality with a full scan is
//! the contract: a query selects exactly the rows that sorting every other row's
//! [`Vec2::distance_squared_wide`] reading would select. The tree only accelerates that
//! selection, and no readout depends on its internal shape. A point query
//! ([`KdTree::nearest_point`]) answers the exact `k` nearest frame rows of any finite point
//! under the same contract, with no row excluded.
//!
//! Readouts are deterministic. A readout is a function of the frame bytes, the query, and `k`,
//! and row ids double as the tie-break identity, so a frame with duplicated positions still
//! orders every readout totally.
//!
//! ```ignore
//! let points = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0), Vec2::new(0.0, 2.0)];
//! let frame = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&points))
//!     .expect("the example points are finite");
//! let tree = KdTree::build(frame);
//!
//! let neighbours = tree.nearest(RowId::new(0), NonZero::new(2).expect("two is nonzero"));
//! assert_eq!(neighbours[0].row, RowId::new(1));
//! assert_eq!(neighbours[1].row, RowId::new(2));
//! ```
//!
//! # Engine
//!
//! The index is kiddo's immutable kd-tree over the frame's `f32` coordinates, with the
//! Eytzinger stem layout and soft-bucketed arena leaves, so a run of co-located rows wider than
//! a bucket becomes one over-full leaf instead of refusing construction. The engine computes in
//! `f64` over its `f32` storage, and its readings are bit-identical to
//! [`Vec2::distance_squared_wide`]: it widens each coordinate exactly before subtracting, and
//! its squared distance rounds once per multiply and once per add, x before y. That identity is
//! what lets the engine's radius selection decide membership under the one metric.
//!
//! The engine resolves equal readings in traversal order, so a single k-query cannot honour the
//! `(reading, row)` tie contract when a tie class straddles the boundary: which co-located rows
//! enter the result would depend on the tree's internal shape. A readout therefore composes two
//! walks. The first probes for the k-th smallest reading, the boundary. The second selects
//! every row reading at most the boundary, which admits each boundary tie class whole; the
//! readout then re-reads every candidate through [`Vec2::distance_squared_wide`], orders by
//! `(reading, row)`, and keeps the first `k`.
//!
//! # Precision
//!
//! Coordinates widen exactly from `f32` to `f64` before any arithmetic, and squared distances
//! accumulate in `f64` ([`Vec2::distance_squared_wide`]). A consumer that compares its own
//! readings against the tree's computes them through that one metric, so tie sets never depend
//! on the call site.
//!
//! # Complexity
//!
//! The build median-splits on alternating axes in parallel above the engine's own threshold,
//! and runs in expected `O(N·log N)` for `N` rows. A readout on a well-spread frame walks the
//! tree twice in expected `O(log N + k)`. Rows sharing one position defeat the spatial pruning
//! and degrade a readout toward the full `O(N)` scan, with the result unchanged. The index owns
//! a copy of the coordinates and one item per row beside the borrowed frame, 16 bytes per row
//! for a 64-bit id.

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

/// A frame row as the engine stores it against a point.
///
/// The engine keeps items in fixed-size leaf arrays that it initialises before filling, so its
/// item type must have a default for the unused tail of a partly-filled leaf. A row id has none:
/// every id names a real row. This wrapper supplies the one the engine needs, and the wrapper
/// exists so that the requirement is stated here rather than forced onto the id domain.
///
/// The padding is [`Id::MIN`], which is also a real row. Nothing distinguishes the two by value,
/// and nothing needs to: a query reads only within a leaf's extent, and every item inside an
/// extent is written at construction. The alternative, an extra inhabitant through [`Option`],
/// would make padding loud at a cost of double the item storage, because a row id wraps a plain
/// integer and leaves no niche for one. Items are the per-point storage the engine scans, so
/// that is the wrong trade.
///
/// The ordering is the id's own and exists because the engine's query bound asks for one;
/// consumers order distance ties by row, and the engine's k-nearest queries never consult it.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(transparent)]
struct Leaf<N>(N);

impl<N> Leaf<N> {
    /// Wraps the frame row.
    pub(crate) const fn new(row: N) -> Self {
        Self(row)
    }

    /// Returns the frame row this item names.
    pub(crate) fn row(self) -> N {
        self.0
    }
}

impl<N> Default for Leaf<N>
where
    N: Id,
{
    fn default() -> Self {
        Self(N::MIN)
    }
}

/// A frame row together with its squared distance to the query.
#[derive(Debug, Copy, Clone)]
pub(crate) struct KdNeighbour<I> {
    /// The neighbouring frame row.
    pub row: I,
    /// The row's squared Euclidean distance to the query, per
    /// [`Vec2::distance_squared_wide`].
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

/// The engine's leaf bucket capacity, in rows.
const BUCKET_ROWS: usize = 32;

/// Kiddo's immutable tree over the frame's widened coordinates, one [`Leaf`] item per row.
type Engine<I> = kiddo::kd_tree::KdTree<
    f32,
    Leaf<I>,
    Eytzinger,
    VecOfArenas<f32, Leaf<I>, 2, BUCKET_ROWS>,
    2,
    BUCKET_ROWS,
>;

/// An exact k-nearest-neighbour index over a borrowed 2D frame.
///
/// Building validates the frame once and borrows it for the tree's lifetime. Frame rows are the
/// identities: a query names a row, and readouts name rows. The module documentation states the
/// exactness, determinism, and complexity guarantees.
pub(crate) struct KdTree<'frame, I> {
    /// The borrowed frame, indexed by row.
    points: &'frame FinitePointField<I>,
    /// The engine over the frame's widened coordinates.
    engine: Engine<I>,
}

impl<'frame, I> KdTree<'frame, I>
where
    I: Id,
{
    /// Builds the index over `points`.
    ///
    /// The field becomes the frame, so row `r` is `points[r]` and readouts name these rows.
    /// Finiteness arrives proven with the field, so construction cannot refuse.
    ///
    /// # Panics
    ///
    /// This panics when the frame holds more rows than `I` addresses, which the frame's
    /// constructor is contracted to prevent.
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

    /// Returns the `k` nearest other rows of `row`, allocating the readout in `alloc`.
    ///
    /// The readout ascends by `(distance_squared, row)`: exactly the first `k` entries of the
    /// sorted full scan over every other row. A bump allocator makes the readout free to create
    /// and abandon per query: allocate a reading loop's readouts in a scratch arena and reset it
    /// between readings.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row.
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

    /// Returns the `k` nearest other rows of `row`: [`nearest_in`](Self::nearest_in) in the
    /// global allocator.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row.
    #[must_use]
    pub(crate) fn nearest(&self, row: I, k: NonZero<usize>) -> Vec<KdNeighbour<I>> {
        self.nearest_in(row, k, Global)
    }

    /// Returns the `k` nearest frame rows of `point`, allocating the readout in `alloc`.
    ///
    /// The query point needs no frame membership, and no row is excluded: a frame row co-located
    /// with `point` is a candidate at distance zero. The readout holds one entry per frame row up
    /// to `k`, so a frame with fewer than `k` rows returns them all, ordered as
    /// [`nearest_in`](Self::nearest_in) states.
    ///
    /// # Panics
    ///
    /// This panics when `point` has a NaN or infinite component, which would break the pruning's
    /// soundness argument.
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

    /// Returns the `k` nearest frame rows of `point`:
    /// [`nearest_point_in`](Self::nearest_point_in) in the global allocator.
    ///
    /// # Panics
    ///
    /// This panics when `point` has a NaN or infinite component.
    #[must_use]
    pub(crate) fn nearest_point(&self, point: Vec2, k: NonZero<usize>) -> Vec<KdNeighbour<I>> {
        self.nearest_point_in(point, k, Global)
    }

    /// Selects the exact `k`-set of `query` under `(reading, row)`, the two-walk composition.
    ///
    /// The probe walk asks the engine for the `k` smallest readings, `k + 1` when `exclude`
    /// names a frame row, because that row's own zero reading occupies one slot. The largest
    /// probed reading is the boundary: the multiset of the `k` smallest readings is a function
    /// of the frame alone, whichever tied rows the engine kept. The selection walk then admits
    /// every row reading at most the boundary, inclusively, so each boundary tie class arrives
    /// whole and the engine's traversal order decides nothing. Re-reading the candidates through
    /// [`Vec2::distance_squared_wide`] makes the published readings the one metric's by
    /// construction. The engine's bit-identical readings only steered the selection.
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

        // A single-reading probe is its own boundary, and the single-item query returns without
        // the result vector a top-k probe buffers into. The engine has no visitor for a top-k:
        // a bounded k-set evicts rows while the walk runs, so it only exists once the walk ends,
        // and the executed vector is that collection itself.
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

        // Without boundary ties the selection returns exactly the probed rows, so `k + 1` is the
        // readout's usual size and a wider tie class is the one case that grows the buffer.
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

    pub(crate) const fn points(&self) -> &'frame IdSlice<I, Vec2> {
        self.points
    }
}

impl<I> fmt::Debug for KdTree<'_, I> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("KdTree").finish_non_exhaustive()
    }
}
