//! The 2D hard-negative miner over detached coordinate frames.
//!
//! At a configured cadence training mines each node's closest projected points and admits the ones
//! no other evidence explains. A mined pair joins two distinct nodes that share no semantic edge
//! and that the hard channel does not protect. What survives is independent evidence of a false
//! neighbour, two points close on the map that nothing says belong together. The same bounded
//! negative energy that repels ordinary negatives repels this pair, weighted by closeness rank.
//!
//! Under a conditioned model the current map is one map per lens value, so a refresh tick mines one
//! [`SpatialField`] per lens extreme and pools the frames with [`MinedFrame::pool`], where a pair
//! mined in both keeps its maximum weight. Saturation makes pooling safe. The bounded negative
//! energy exerts vanishing force on pairs far apart in a frame, so pooled pairs act only where they
//! lie close together.
//!
//! The spatial index is exact (a balanced kd-tree), so a query returns the exact nearest points.
//! Mining needs no recall accounting and no retry loop that widens the search when exclusions thin
//! the candidates. A node whose map neighbourhood other evidence fully explains yields an honest
//! short set, because it has no false neighbours to repel.

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id, IdSlice};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{
    math::{KdTree, NonFinitePoint, Positive, Vec2, kdtree::KdNeighbour},
    runs::{Runs, RunsBuilder},
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
    /// Ranks lie below the quota, and rank zero carries the full bound.
    fn weight(self, rank: usize) -> f32 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "ranks stay below the quota, far inside exact f32 integers"
        )]
        let relative = rank as f32 / self.neighbours.get() as f32;

        self.maximum_weight.get() * (1.0 - relative).powf(self.rank_exponent.get())
    }

    /// Returns the per-row search size: quota times margin.
    const fn search_size(self) -> NonZero<usize> {
        self.neighbours.saturating_mul(self.search_margin)
    }
}

/// Building a spatial field over a coordinate frame failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SpatialFieldError<N> {
    /// A coordinate is NaN or infinite: the projection diverged.
    NonFinite(NonFinitePoint<N>),
}

impl<N> From<NonFinitePoint<N>> for SpatialFieldError<N> {
    fn from(value: NonFinitePoint<N>) -> Self {
        Self::NonFinite(value)
    }
}

impl<N> fmt::Display for SpatialFieldError<N>
where
    N: Id,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonFinite(error) => fmt::Display::fmt(error, fmt),
        }
    }
}

impl<N> Error for SpatialFieldError<N>
where
    N: Id,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::NonFinite(error) => Some(error),
        }
    }
}

/// The exact 2D neighbour index over one frame's detached coordinates.
///
/// Every refresh tick builds one field per lens extreme and drops it with the tick. Queries never
/// mutate the field and are thread-safe. Exactness is part of the contract: consumers account for
/// no recall.
pub(crate) struct SpatialField<'frame, N> {
    tree: KdTree<'frame, N>,
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
        let tree = KdTree::build(coordinates)?;

        Ok(Self { tree })
    }

    /// Returns the frame's row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.tree.points().len()
    }

    /// Returns the `count` nearest other rows of `row`, ascending by `(squared distance, row)`.
    ///
    /// The index excludes the query row and selects the exact `count`-set under that order, so
    /// equal distances come back in one order regardless of tree traversal and every returned
    /// candidate is a potential pair partner.
    fn nearest(&self, row: N, count: NonZero<usize>) -> Vec<KdNeighbour<N>> {
        self.tree.nearest(row, count)
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
    /// This panics when the two views disagree about the row domain. Both artifacts come from one
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
            let candidate = neighbour.row;
            if self.is_semantic_positive(row, candidate) {
                continue;
            }

            let pair = NodePair::new(row, candidate);
            if self.protection.judge(pair, self.config).hard {
                continue;
            }

            let weight = self.options.weight(accepted.len());
            accepted.push((candidate, weight));
            if accepted.len() == quota {
                break;
            }
        }

        accepted
    }

    /// Mines each row's admissible closest projected points with their rank weights.
    ///
    /// Rows mine independently and in parallel, and the result is a function of the inputs alone.
    ///
    /// # Panics
    ///
    /// This panics when the frame's row domain disagrees with the exclusion evidence. Both come
    /// from one generation, so a mismatch is a wiring defect.
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

        let mut builder = RunsBuilder::with_capacity(rows.len(), 0);
        let mut weights = Vec::new();
        for mined in rows {
            weights.extend(mined.iter().map(|&(_, weight)| weight));
            builder.push_run(mined.into_iter().map(|(target, _)| target));
        }

        MinedFrame {
            targets: builder.finish(),
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
    /// Mined counterpart rows, grouped into one run per anchor row.
    targets: Runs<N, N>,
    /// Rank weights in `(0, maximum_weight]`, one beside each target.
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
        self.targets.runs()
    }

    /// Returns the mined pair count over all rows.
    #[inline]
    #[must_use]
    pub(crate) fn pairs(&self) -> usize {
        self.targets.items().len()
    }

    /// Iterates one row's mined pairs as weighted node pairs.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not below [`rows`](Self::rows).
    pub(crate) fn row(&self, row: N) -> impl ExactSizeIterator<Item = (NodePair<N>, f32)> + '_
    where
        N: Id,
    {
        self.targets
            .run(row)
            .iter()
            .zip(&self.weights[self.targets.span(row)])
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
    /// This panics when the frames disagree about the row domain. Both come from one refresh tick,
    /// so a mismatch is a wiring defect.
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

        let mut builder = RunsBuilder::with_capacity(self.rows(), self.pairs().max(other.pairs()));
        let mut weights = Vec::new();
        let mut merged: Vec<(N, f32)> = Vec::new();

        for row in 0..self.rows() {
            let row = N::from_usize(row);

            merged.clear();
            for frame in [self, other] {
                merged.extend(
                    frame
                        .targets
                        .run(row)
                        .iter()
                        .copied()
                        .zip(frame.weights[frame.targets.span(row)].iter().copied()),
                );
            }

            merged.sort_unstable_by(|(left_target, left_weight), (right_target, right_weight)| {
                left_target
                    .cmp(right_target)
                    .then(left_weight.total_cmp(right_weight).reverse())
            });
            merged.dedup_by_key(|(target, _)| *target);

            weights.extend(merged.iter().map(|&(_, weight)| weight));
            builder.push_run(merged.iter().map(|&(target, _)| target));
        }

        Self {
            targets: builder.finish(),
            weights: weights.into_boxed_slice(),
        }
    }
}
