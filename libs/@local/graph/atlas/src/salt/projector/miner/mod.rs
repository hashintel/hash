//! The 2D hard-negative miner over detached coordinate frames.
//!
//! At a configured cadence training mines each node's closest projected points and admits the ones
//! no other evidence explains. A mined pair joins two distinct nodes that share no semantic edge
//! and that the hard channel does not protect. What survives is independent evidence of a false
//! neighbour, two points close on the map that nothing says belong together. The same bounded
//! negative energy that repels ordinary negatives repels this pair, weighted by closeness rank.
//!
//! Under a conditioned model the current map is one map per lens value. A refresh tick therefore
//! mines one [`SpatialField`] per lens extreme and pools the frames with [`MinedFrame::pool`],
//! where a pair mined in both keeps its maximum weight. Pooling relies on the repulsion's decay at
//! large distances. The bounded negative energy's force on a pair falls toward zero as the pair's
//! distance grows in a frame and, in the real model, reaches zero at no finite positive distance:
//! the term has no support cutoff. That decay is the large-distance side of a force that is not
//! monotone in the distance. At exactly zero distance the explicit branch of
//! [`AffinityEnergy::repulsion`](crate::salt::projector::loss::AffinityEnergy::repulsion) returns
//! a zero derivative, and for exponents `b > 1/2` the coordinate force also has limit zero as a
//! positive distance shrinks toward coincidence, as the [`loss`](crate::salt::projector::loss)
//! module documents. A pair mined close in one frame and far apart in the other therefore pushes in
//! the second frame with whatever force that distance leaves, and pooling adds that decayed
//! influence rather than nothing.
//!
//! The spatial index is a kd-tree over the frame, [`SpatialField`] over [`KdTree`]. A query returns
//! up to the requested count of other rows, ascending by squared distance with ties resolved by
//! row, under the selection precision that index documents. Mining examines each row's bounded
//! candidate prefix once, `neighbours · search_margin` rows, and never widens the search when
//! exclusions thin it. A short mined set therefore means the examined candidates ran out, not that
//! the frame holds no further admissible partner: with a quota and a margin of one, rows at
//! `x = 0`, `1` and `2`, a semantic edge between the first two and none between the first and the
//! third, row zero examines row one alone, rejects it and mines nothing while row two remains
//! admissible. The single bounded query is the trade the margin buys. Every row costs one readout
//! of `neighbours · search_margin` rows and at most that many exclusion checks, and a wider margin
//! raises that cost for every row. A row whose examined prefix is dense with excluded pairs mines
//! fewer than its quota.

#[cfg(test)]
mod tests;

use core::{fmt, num::NonZero};

use hashql_core::id::Id;
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use crate::{
    math::{FinitePointField, KdTree, Positive, kdtree::KdNeighbour},
    runs::{Runs, RunsBuilder},
    salt::{
        relation::protection::{NodePair, ProtectionConfig, ProtectionView},
        semantic::SemanticGraphView,
    },
};

/// Validated mining schedule and rank-weight coefficients.
///
/// Per row, the miner examines the nearest `neighbours · search_margin` projected points and admits
/// up to `neighbours` of them past the exclusions. The margin is what lets a row surrounded by its
/// own semantic cluster reach candidates past that cluster, within the one examined prefix. An
/// admitted candidate at closeness rank `r` weighs
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
    /// Ranks lie below the quota, and rank zero carries the full bound. The real formula
    /// `maximum_weight · (1 − rank/neighbours)^rank_exponent` is strictly positive for every rank
    /// below the quota. The computed weight converts `rank` and the quota to `f32` first, and that
    /// conversion can make the relative rank one: for a quota of `2²⁴ + 1` and rank `2²⁴`, both
    /// integers round to `2²⁴` and the weight is zero. A small base raised to a large exponent
    /// can also underflow to zero. The represented weight therefore lies in `[0, maximum_weight]`.
    fn weight(self, rank: usize) -> f32 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "ranks stay below the quota, far inside exact f32 integers"
        )]
        let relative = rank as f32 / self.neighbours.get() as f32;

        self.maximum_weight * (1.0 - relative).powf(self.rank_exponent.get())
    }

    /// Returns the per-row search size: quota times margin.
    const fn search_size(self) -> NonZero<usize> {
        self.neighbours.saturating_mul(self.search_margin)
    }
}

/// The 2D neighbour index over one frame's detached coordinates.
///
/// Every refresh tick builds one field per lens extreme and drops it with the tick. Queries never
/// mutate the field and are thread-safe. The field wraps [`KdTree`] and inherits its selection
/// precision: a readout equals a full scan where that index's documented conditions hold. The
/// miner keeps no recall accounting of its own, and the index's selection limits pass through to
/// the mined set.
pub(crate) struct SpatialField<'frame, N> {
    tree: KdTree<'frame, N>,
}

impl<'frame, N> SpatialField<'frame, N>
where
    N: Id,
{
    /// Indexes one frame of projected coordinates, in row order.
    ///
    /// A diverged projection never reaches the index: the frame arrives as a proven-finite
    /// field from its readback boundary. Construction is [`KdTree::build`]'s.
    ///
    /// # Panics
    ///
    /// This panics when the frame holds more rows than `N` addresses, the condition
    /// [`KdTree::build`] states. The field's constructor contracts to prevent it.
    #[must_use]
    pub(crate) fn new(coordinates: &'frame FinitePointField<N>) -> Self {
        Self {
            tree: KdTree::build(coordinates),
        }
    }

    /// Returns the frame's row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.tree.points().len()
    }

    /// Returns up to `count` other rows nearest to `row`, ascending by `(squared distance, row)`.
    ///
    /// The query is [`KdTree::nearest`]. The index excludes the query row and orders the rows it
    /// selects under that key, and equal distances therefore come back in one order regardless of
    /// tree traversal. Which rows it selects is the index's contract: [`KdTree`] states where the
    /// selection equals a full scan. A `count` beyond the frame's other rows requests them all,
    /// under the same selection. Every returned candidate is a potential pair partner.
    ///
    /// # Panics
    ///
    /// This panics when `row` is not a frame row, and when the readout's reservation of
    /// `count + 1` entries exceeds the vector capacity limit.
    fn nearest(&self, row: N, count: NonZero<usize>) -> Vec<KdNeighbour<N>> {
        self.tree.nearest(row, count)
    }
}

/// The exclusion evidence one generation mines against.
///
/// The semantic graph vetoes pairs the attraction objective already pulls together (the graph is
/// symmetric, and one row's adjacency decides), and the protection evidence vetoes pairs whose
/// links veto targeted repulsion under the hard channel. The admission contract names two further
/// exclusions, typed-separation control sets and signed-policy conflicts. Both sets are empty
/// here, and this miner applies neither.
#[derive(Debug)]
pub(crate) struct HardNegativeMiner<'view, N> {
    semantic: SemanticGraphView<'view, N>,
    protection: ProtectionView<'view, N>,
    config: ProtectionConfig,
    options: MinerOptions,
}

impl<N> fmt::Debug for SpatialField<'_, N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SpatialField").finish_non_exhaustive()
    }
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
    /// generation, and a mismatch is therefore a wiring defect.
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
    ///
    /// One readout of `neighbours · search_margin` candidates, filtered in order until the quota
    /// fills or the readout ends. The result is short when the examined candidates run out, and
    /// the search never widens.
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
    /// from one generation, and a mismatch is therefore a wiring defect. It also panics when a
    /// quota exceeds the vector capacity limit: each row reserves `neighbours` entries for its
    /// admitted candidates and its readout reserves `neighbours · search_margin + 1`, and a
    /// reservation past `isize::MAX` bytes panics on capacity overflow. A refused allocation is
    /// not recoverable here.
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
/// after a pool. Each target has its weight beside it either way, and consumers never reconstruct
/// rank.
#[derive(Debug, PartialEq)]
pub(crate) struct MinedFrame<N> {
    /// Mined counterpart rows, grouped into one run per anchor row.
    targets: Runs<N, N>,
    /// Rank weights in `[0, maximum_weight]`, one beside each target.
    ///
    /// The real rank-decay formula is strictly positive below the quota, and the represented `f32`
    /// weight can be zero where the rank and the quota round to one `f32` integer or the power
    /// underflows, as [`MinerOptions::weight`] states.
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
    /// and a mismatch is therefore a wiring defect.
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
