//! The 2D hard-negative miner over detached coordinate frames.
//!
//! At a configured cadence training mines each node's closest projected points and admits the ones
//! no other evidence explains: a mined pair must not be a semantic edge, must not be protected
//! under the hard channel, and must not be the node itself. What survives is independent evidence
//! of a false neighbour - two points close on the map that nothing says belong together - and is
//! repelled by the same bounded negative energy as ordinary negatives, weighted by closeness rank.
//!
//! Under a conditioned model the current map is one map per lens value, so a refresh tick mines one
//! [`SpatialField`] per lens extreme and pools the frames with [`MinedFrame::pool`]: a pair mined
//! in both keeps its maximum weight. Pooling is safe by saturation - the bounded negative energy
//! exerts vanishing force on pairs far apart in a frame, so pooled pairs act only where they are
//! genuinely close.
//!
//! The spatial index is exact (a balanced kd-tree), so a query returns the exact nearest points: no
//! recall accounting, and no retry loop widening the search when exclusions thin the candidates. A
//! node whose map neighbourhood is fully explained yields an honest short set - it has no false
//! neighbours to repel.

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id, IdSlice, IdVec};
use kiddo::{NearestNeighbour, SquaredEuclidean, immutable::float::kdtree::ImmutableKdTree};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{
    math::{Positive, Vec2},
    salt::{
        relation::protection::{NodePair, ProtectionConfig, ProtectionView},
        semantic::SemanticGraphView,
    },
};

/// Validated mining schedule and rank-weight coefficients.
///
/// Per row, the miner examines the nearest `neighbours · search_margin` projected points and admits
/// up to `neighbours` of them past the exclusions; the margin is what keeps a row surrounded by its
/// own semantic cluster from starving. An admitted candidate at closeness rank `r` weighs
/// `maximum_weight · (1 - r / neighbours)^rank_exponent`: the nearest surviving false neighbour
/// carries the full weight and the last admissible rank fades toward zero, satisfying the bounded
/// rank-weight contract.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct MinerOptions {
    neighbours: NonZero<usize>,
    search_margin: NonZero<usize>,
    maximum_weight: Positive,
    rank_exponent: Positive,
}

impl MinerOptions {
    /// Assembles a mining schedule.
    ///
    /// Every field arrives valid by construction, so no state this type can hold is invalid.
    #[must_use]
    pub(crate) const fn new(
        neighbours: NonZero<usize>,
        search_margin: NonZero<usize>,
        maximum_weight: Positive,
        rank_exponent: Positive,
    ) -> Self {
        Self {
            neighbours,
            search_margin,
            maximum_weight,
            rank_exponent,
        }
    }

    /// Returns the per-row admission quota `h`.
    #[inline]
    #[must_use]
    pub(crate) const fn neighbours(self) -> NonZero<usize> {
        self.neighbours
    }

    /// Returns the search-quota multiplier over the admission quota.
    #[inline]
    #[must_use]
    pub(crate) const fn search_margin(self) -> NonZero<usize> {
        self.search_margin
    }

    /// Returns the bound every rank weight stays within.
    #[inline]
    #[must_use]
    pub(crate) const fn maximum_weight(self) -> f32 {
        self.maximum_weight.get()
    }

    /// Returns the rank-decay exponent.
    #[inline]
    #[must_use]
    pub(crate) const fn rank_exponent(self) -> f32 {
        self.rank_exponent.get()
    }

    /// Computes the weight of the candidate at closeness `rank`.
    ///
    /// Ranks lie below the quota; rank zero carries the full bound.
    fn weight(self, rank: usize) -> f32 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "ranks stay below the quota, far inside exact f32 integers"
        )]
        let relative = rank as f32 / self.neighbours.get() as f32;

        self.maximum_weight.get() * (1.0 - relative).powf(self.rank_exponent.get())
    }

    /// Returns the per-row search size: quota times margin, plus the query point itself.
    const fn search_size(self) -> usize {
        self.neighbours
            .get()
            .saturating_mul(self.search_margin.get())
            .saturating_add(1)
    }
}

/// Building a spatial field over a coordinate frame failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SpatialFieldError<N> {
    /// A coordinate is NaN or infinite: the projection diverged.
    NonFinite { row: N },
    /// The frame's rows exceed the index's `u32` item encoding.
    RowsExceedIndexDomain { rows: usize },
}

impl<N> fmt::Display for SpatialFieldError<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NonFinite { row } => {
                write!(fmt, "the coordinate at row {row} is not finite")
            }
            Self::RowsExceedIndexDomain { rows } => {
                write!(fmt, "{rows} rows exceed the index's u32 item encoding")
            }
        }
    }
}

impl<N> Error for SpatialFieldError<N> where N: fmt::Debug + fmt::Display {}

/// The exact 2D neighbour index over one frame's detached coordinates.
///
/// One field is built per lens extreme at every refresh tick and dropped with it; queries are
/// read-only and thread-safe. Exactness is part of the contract: consumers account for no recall.
pub(crate) struct SpatialField<'frame, N> {
    tree: ImmutableKdTree<f32, u32, 2, 32>,
    points: &'frame IdSlice<N, Vec2>,
}

impl<N> fmt::Debug for SpatialField<'_, N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SpatialField").finish_non_exhaustive()
    }
}

impl<'frame, N> SpatialField<'frame, N>
where
    N: Id,
{
    /// Indexes one frame of projected coordinates, in row order.
    ///
    /// # Errors
    ///
    /// Returns an error when a coordinate is not finite (a diverged projection must fail the tick,
    /// not seed an index) or the row count exceeds the index's `u32` item encoding.
    pub(crate) fn new(coordinates: &'frame IdSlice<N, Vec2>) -> Result<Self, SpatialFieldError<N>> {
        if let Some(row) = coordinates.iter().position(|point| !point.is_finite()) {
            return Err(SpatialFieldError::NonFinite {
                row: N::from_usize(row),
            });
        }
        if u32::try_from(coordinates.len()).is_err() {
            return Err(SpatialFieldError::RowsExceedIndexDomain {
                rows: coordinates.len(),
            });
        }

        // `Vec2` is transparently its interleaved component pair, so the
        // frame reinterprets without copying.
        let points = zerocopy::transmute_ref!(coordinates.as_raw());

        Ok(Self {
            tree: ImmutableKdTree::new_from_slice(points),
            points: coordinates,
        })
    }

    /// Returns the frame's row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.points.len()
    }

    /// Returns the `count` nearest rows to `row`, ascending by `(squared distance, row)`.
    ///
    /// The query point is in the index, so `row` itself leads the result. The secondary row order
    /// pins ties: equal distances are returned in one order regardless of tree traversal.
    ///
    /// Items are frame row indexes in the tree's compact `u32` domain; [`NodeRowId::from_u32`]
    /// widens one losslessly.
    // The tree stores one content id per point, so the u32 domain halves
    // that storage against a 64-bit id.
    fn nearest(&self, row: N, count: usize) -> Vec<NearestNeighbour<f32, u32>> {
        let count = NonZero::new(count.min(self.points.len()))
            .expect("search sizes are at least one by construction");

        let mut nearest = self
            .tree
            .nearest_n::<SquaredEuclidean>(self.points[row].as_array(), count);

        nearest.sort_unstable_by(|left, right| {
            left.distance
                .total_cmp(&right.distance)
                .then(left.item.cmp(&right.item))
        });

        nearest
    }
}

/// The exclusion evidence one generation mines against.
///
/// The semantic graph vetoes pairs the attraction objective already pulls together (the graph is
/// symmetric, so one row's adjacency decides), and the protection evidence vetoes pairs whose links
/// veto targeted repulsion under the hard channel. Typed-separation control sets and signed-policy
/// conflicts are further exclusions the admission contract names; the initial generation has no
/// signed policies, so both sets are empty here.
#[derive(Debug)]
pub(crate) struct HardNegativeMiner<'view, N> {
    semantic: SemanticGraphView<'view, N>,
    protection: ProtectionView<'view, N>,
    config: ProtectionConfig,
    options: MinerOptions,
}

impl<'view, N> HardNegativeMiner<'view, N>
where
    N: Id,
{
    /// Binds the exclusion evidence and the mining schedule.
    ///
    /// # Panics
    ///
    /// Panics when the two views disagree about the row domain; both artifacts come from one
    /// generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        semantic: SemanticGraphView<'view, N>,
        protection: ProtectionView<'view, N>,
        config: ProtectionConfig,
        options: MinerOptions,
    ) -> Self {
        assert_eq!(
            semantic.rows(),
            protection.rows(),
            "the semantic graph and protection evidence should cover the same rows"
        );

        Self {
            semantic,
            protection,
            config,
            options,
        }
    }

    /// Mines one row's admissible candidates in closeness-rank order.
    fn mine_row(&self, field: &SpatialField<'_, N>, row: N) -> Vec<(N, f32)> {
        let quota = self.options.neighbours().get();

        let mut accepted = Vec::with_capacity(quota);

        for neighbour in field.nearest(row, self.options.search_size()) {
            let candidate = neighbour.item;
            let candidate_id = N::from_u32(candidate);

            if candidate_id == row {
                continue;
            }

            if self.is_semantic_positive(row, candidate_id) {
                continue;
            }

            let pair = NodePair::new(row, candidate_id);
            if self.protection.judge(pair, self.config).hard {
                continue;
            }

            let weight = self.options.weight(accepted.len());
            accepted.push((candidate_id, weight));
            if accepted.len() == quota {
                break;
            }
        }

        accepted
    }

    /// Mines one frame: per row, the admissible closest projected points with their rank weights.
    ///
    /// Rows mine independently and in parallel; the result is a function of the inputs alone.
    ///
    /// # Panics
    ///
    /// Panics when the frame's row domain disagrees with the exclusion evidence; both come from one
    /// generation, so a mismatch is a wiring defect.
    pub(crate) fn mine(&self, field: &SpatialField<'_, N>) -> MinedFrame<N> {
        assert_eq!(
            field.rows(),
            self.semantic.rows(),
            "the coordinate frame and the exclusion evidence should cover the same rows"
        );

        let rows: Vec<_> = (0..field.rows())
            .into_par_iter()
            .map(|row| self.mine_row(field, N::from_usize(row)))
            .collect();

        let mut offsets = IdVec::<N, _>::with_capacity(rows.len() + 1);
        let mut targets = Vec::new();
        let mut weights = Vec::new();

        offsets.push(0);
        for mined in rows {
            for (target, weight) in mined {
                targets.push(target);
                weights.push(weight);
            }
            offsets.push(targets.len());
        }

        MinedFrame {
            offsets: offsets.into_boxed_slice(),
            targets: targets.into_boxed_slice(),
            weights: weights.into_boxed_slice(),
        }
    }

    /// Returns whether the pair is a semantic-positive edge.
    fn is_semantic_positive(&self, row: N, candidate: N) -> bool {
        self.semantic.row(row).any(|edge| edge.id == candidate)
    }
}

/// One frame's mined hard negatives, grouped by anchor row.
///
/// Rows keep their candidates in closeness-rank order after a mine and in ascending target order
/// after a pool; the weights ride beside the targets either way, so consumers never reconstruct
/// rank.
#[derive(Debug, PartialEq)]
pub(crate) struct MinedFrame<N> {
    /// Per-row spans into the columns, `rows + 1` entries from zero.
    offsets: Box<IdSlice<N, usize>>,
    /// Mined counterpart rows.
    targets: Box<[N]>,
    /// Rank weights, in `(0, maximum_weight]`.
    weights: Box<[f32]>,
}

impl<N> MinedFrame<N>
where
    N: Id,
{
    /// Returns the anchor row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.offsets.len() - 1
    }

    /// Returns the mined pair count over all rows.
    #[inline]
    #[must_use]
    pub(crate) const fn pairs(&self) -> usize {
        self.targets.len()
    }

    /// Iterates one row's mined pairs as weighted node pairs.
    ///
    /// # Panics
    ///
    /// Panics when `row` is not below [`rows`](Self::rows).
    pub(crate) fn row(&self, row: N) -> impl ExactSizeIterator<Item = (NodePair<N>, f32)> + '_
    where
        N: Id,
    {
        let span = self.offsets[row]..self.offsets[row.plus(1)];

        self.targets[span.clone()]
            .iter()
            .zip(&self.weights[span])
            .map(move |(&target, &weight)| (NodePair::new(row, target), weight))
    }

    /// Pools two frames of one refresh tick.
    ///
    /// The union of each row's pairs, a pair mined in both keeping its maximum weight.
    ///
    /// Pooled rows order by ascending target.
    ///
    /// # Panics
    ///
    /// Panics when the frames disagree about the row domain; both come from one refresh tick, so a
    /// mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn pool(&self, other: &Self) -> Self
    where
        N: Id,
    {
        assert_eq!(
            self.rows(),
            other.rows(),
            "pooled frames should cover the same rows"
        );

        let mut offsets = IdVec::<N, _>::with_capacity(self.offsets.len());
        let mut targets = Vec::new();
        let mut weights = Vec::new();
        let mut merged: Vec<(N, f32)> = Vec::new();

        offsets.push(0);
        for row in 0..self.rows() {
            let row = N::from_usize(row);

            merged.clear();
            for frame in [self, other] {
                let span = frame.offsets[row]..frame.offsets[row.plus(1)];

                merged.extend(
                    frame.targets[span.clone()]
                        .iter()
                        .copied()
                        .zip(frame.weights[span].iter().copied()),
                );
            }

            merged.sort_unstable_by(|(left_target, left_weight), (right_target, right_weight)| {
                left_target
                    .cmp(right_target)
                    .then(left_weight.total_cmp(right_weight).reverse())
            });
            merged.dedup_by_key(|(target, _)| *target);

            for &(target, weight) in &merged {
                targets.push(target);
                weights.push(weight);
            }

            offsets.push(targets.len());
        }

        Self {
            offsets: offsets.into_boxed_slice(),
            targets: targets.into_boxed_slice(),
            weights: weights.into_boxed_slice(),
        }
    }
}
