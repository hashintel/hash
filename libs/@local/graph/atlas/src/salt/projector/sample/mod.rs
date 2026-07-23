//! Seeded minibatch samplers over the fitting artifacts.
//!
//! Each training step draws three edge populations:
//!
//! - [`SemanticEdgeSampler`]: positive pairs from the semantic graph, drawn proportional to their
//!   fuzzy weight (with replacement), so gradient work concentrates where the attraction evidence
//!   is;
//! - [`RelationEdgeSampler`]: typed attraction instances, relation types drawn uniformly and edges
//!   capped per type, so raw edge frequency cannot hand the layout to high-volume relations;
//! - [`OrdinaryNegativeSampler`]: uniform distinct node pairs admitted only past every veto - self
//!   pairs, semantic-positive pairs, and pairs the protection evidence bars from ordinary
//!   repulsion. Typed-separation control sets and signed-policy conflicts are further vetoes the
//!   admission contract names; the initial generation has no signed policies, so both sets are
//!   empty here.
//!
//! Every sampler draws from a caller-supplied random stream and nothing else: equal artifacts,
//! stream types, and seeds reproduce a batch exactly.

#[cfg(test)]
mod tests;

use core::{alloc::Allocator, num::NonZero};
use std::{alloc::Global, collections::HashSet};

use rand::{Rng, RngExt as _};

use crate::{
    dataset::NodeRowId,
    random::{sample_indices_vec, uniform_below},
    salt::{
        relation::{
            attraction::{AttractionEdge, AttractionGroup, AttractionIndex},
            protection::{NodePair, ProtectionConfig, ProtectionView},
        },
        semantic::SemanticGraphView,
    },
};

/// Weight-proportional semantic-positive edge sampler.
///
/// Draws are independent (with replacement): a duplicate edge in one batch is a legitimate sample,
/// and the estimator needs no without-replacement correction. The drawn weight itself stays out of
/// the emitted pair - proportional sampling already accounts for it.
#[derive(Debug)]
pub(crate) struct SemanticEdgeSampler<'graph> {
    graph: SemanticGraphView<'graph>,
    /// Cumulative row weight totals, `rows + 1` entries from zero.
    ///
    /// Accumulated in double precision in row-major edge order, the same order the per-draw walk
    /// re-accumulates.
    cumulative: Box<[f64]>,
}

impl<'graph> SemanticEdgeSampler<'graph> {
    /// Indexes a semantic graph for weight-proportional draws.
    ///
    /// Returns [`None`] when the graph holds no edge weight to draw from: a corpus without semantic
    /// edges cannot train.
    #[must_use]
    pub(crate) fn new(graph: SemanticGraphView<'graph>) -> Option<Self> {
        let mut cumulative = Vec::with_capacity(graph.rows() + 1);
        let mut total = 0.0_f64;

        cumulative.push(0.0);
        for row in 0..graph.rows() {
            for edge in graph.row(row) {
                total += f64::from(edge.weight);
            }
            cumulative.push(total);
        }

        if total <= 0.0 {
            return None;
        }

        Some(Self {
            graph,
            cumulative: cumulative.into_boxed_slice(),
        })
    }

    /// Returns the graph's total positive edge weight.
    ///
    /// The semantic term's estimator scales its batch mean by this total, keeping the loss
    /// coefficient's meaning independent of corpus size. Accumulated in double precision, rounded
    /// on return.
    #[must_use]
    pub(crate) fn total_weight(&self) -> f32 {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "narrowing the double-precision weight total is the accessor's contract"
        )]
        let total = self.cumulative[self.cumulative.len() - 1] as f32;
        total
    }

    /// Draws `count` edges proportional to their weight.
    pub(crate) fn sample(&self, count: usize, rng: impl Rng) -> Vec<NodePair> {
        self.sample_in(count, rng, Global)
    }

    /// Draws `count` edges proportional to their weight, allocating the pairs in `alloc`.
    pub(crate) fn sample_in<A: Allocator>(
        &self,
        count: usize,
        mut rng: impl Rng,
        alloc: A,
    ) -> Vec<NodePair, A> {
        let total = self.cumulative[self.cumulative.len() - 1];
        let mut pairs = Vec::with_capacity_in(count, alloc);
        pairs.extend(
            core::iter::repeat_with(|| {
                // Redrawing pins `target < total` structurally rather than leaning on the sampler's
                // bit width: today's 53-bit uniform times `total` never rounds up to `total`, but
                // that is an implementation detail of the rand version.
                let target = loop {
                    let candidate = rng.random::<f64>() * total;

                    if candidate < total {
                        break candidate;
                    }
                };

                // The last cumulative entry therefore exceeds every target, so the partition point
                // lands in `1..=rows`; rows without weight repeat their predecessor's total and are
                // never selected.
                let row = self.cumulative.partition_point(|&sum| sum <= target) - 1;
                let mut sum = self.cumulative[row];
                let mut chosen = None;
                for edge in self.graph.row(row) {
                    sum += f64::from(edge.weight);

                    if target < sum {
                        chosen = Some(edge.id);
                        break;
                    }
                }

                // The walk rebuilds the constructor's partial sums (same values, same order), so it
                // reaches the row's total and the target lies strictly below it.
                let id = chosen.expect("the row's rebuilt weight sums cover every drawn target");
                let row = u64::try_from(row).expect("graph rows fit the row-id encoding");
                NodePair::new(NodeRowId::new(row), id)
            })
            .take(count),
        );
        pairs
    }
}

/// One relation type's sampled attraction instances.
#[derive(Debug)]
pub(crate) struct SampledRelationEdges<'index> {
    /// The group the edges came from: relation row and shared weights.
    pub group: &'index AttractionGroup,
    /// The sampled instances, distinct, in group storage order.
    pub edges: Vec<AttractionEdge>,
}

/// Per-type-capped relation attraction sampler.
///
/// Relation types are drawn uniformly without replacement, then each selected type contributes at
/// most the per-type cap of distinct edges: the cap is what keeps a high-volume relation from
/// owning a batch. Uniform type selection is the strongest anti-skew choice; a
/// square-root-of-edge-count weighting is the sanctioned alternative if quality evidence shows the
/// cap alone starves high-volume relations.
#[derive(Debug)]
pub(crate) struct RelationEdgeSampler<'index> {
    groups: &'index [AttractionGroup],
}

impl<'index> RelationEdgeSampler<'index> {
    /// Wraps an attraction index for per-batch sampling.
    #[inline]
    #[must_use]
    pub(crate) const fn new(index: &'index AttractionIndex) -> Self {
        Self {
            groups: index.groups(),
        }
    }

    /// Draws up to `types` relation types with at most `cap` edges each.
    ///
    /// Fewer types than requested means every type participates; a group smaller than the cap
    /// contributes all its edges.
    pub(crate) fn sample(
        &self,
        types: usize,
        cap: NonZero<usize>,
        rng: impl Rng,
    ) -> Vec<SampledRelationEdges<'index>> {
        self.sample_in(types, cap, rng, Global)
    }

    /// Draws up to `types` relation types, allocating the draw list in `alloc`.
    ///
    /// The per-group edge vectors stay on the global allocator: they belong to
    /// [`SampledRelationEdges`], whose layout does not vary with the caller's arena.
    pub(crate) fn sample_in<A: Allocator>(
        &self,
        types: usize,
        cap: NonZero<usize>,
        mut rng: impl Rng,
        alloc: A,
    ) -> Vec<SampledRelationEdges<'index>, A> {
        let count = types.min(self.groups.len());
        if count == 0 {
            return Vec::new_in(alloc);
        }

        let mut selected = sample_indices_vec(&mut rng, self.groups.len(), count).into_vec();

        // Ascending group order makes the output order - and the random
        // stream the per-group draws consume - independent of the
        // selection's internal ordering.
        selected.sort_unstable();
        let mut sampled = Vec::with_capacity_in(count, alloc);
        sampled.extend(selected.into_iter().map(|index| {
            let group = &self.groups[index];
            let edges = group.edges();
            let mut offsets =
                sample_indices_vec(&mut rng, edges.len(), cap.get().min(edges.len())).into_vec();
            offsets.sort_unstable();

            SampledRelationEdges {
                group,
                edges: offsets.into_iter().map(|offset| edges[offset]).collect(),
            }
        }));
        sampled
    }
}

/// Veto-respecting uniform negative-pair sampler.
#[derive(Debug)]
pub(crate) struct OrdinaryNegativeSampler<'view> {
    semantic: SemanticGraphView<'view>,
    protection: ProtectionView<'view>,
    config: ProtectionConfig,
}

impl<'view> OrdinaryNegativeSampler<'view> {
    /// Binds the veto sources.
    ///
    /// The semantic-positive set and the protection evidence judged under `config`.
    ///
    /// # Panics
    ///
    /// Panics when the two views disagree about the row domain; both artifacts come from one
    /// generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        semantic: SemanticGraphView<'view>,
        protection: ProtectionView<'view>,
        config: ProtectionConfig,
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
        }
    }

    /// Draws up to `count` distinct admissible pairs.
    ///
    /// Rejection is bounded: the attempt budget guarantees termination when the admissible pool is
    /// smaller than the request (dense tiny corpora, aggressive protection), where the honest
    /// outcome is a shorter batch. At corpus scale the vetoed fraction of all pairs is vanishing
    /// and the budget never binds.
    pub(crate) fn sample(&self, count: usize, rng: impl Rng) -> Vec<NodePair> {
        self.sample_in(count, rng, Global)
    }

    /// Draws up to `count` distinct admissible pairs, allocating them in `alloc`.
    ///
    /// The rejection bookkeeping is scratch and stays on the global allocator.
    pub(crate) fn sample_in<A: Allocator>(
        &self,
        count: usize,
        mut rng: impl Rng,
        alloc: A,
    ) -> Vec<NodePair, A> {
        let rows = u64::try_from(self.semantic.rows()).expect("graph rows fit the row-id encoding");
        // Pairs need two distinct rows; the empty and singleton corpora sample nothing.
        let Some(bound) = NonZero::new(rows).filter(|bound| bound.get() >= 2) else {
            return Vec::new_in(alloc);
        };

        let budget = count.saturating_mul(64).saturating_add(128);
        let mut seen = HashSet::with_capacity(count);
        let mut sampled = Vec::with_capacity_in(count, alloc);

        for _ in 0..budget {
            if sampled.len() == count {
                break;
            }

            let left = uniform_below(&mut rng, bound);
            let right = uniform_below(&mut rng, bound);
            if left == right {
                continue;
            }

            let pair = NodePair::new(NodeRowId::new(left), NodeRowId::new(right));
            // A vetoed pair stays vetoed; remembering it before the veto
            // checks skips their cost on repeats.
            if !seen.insert((pair.first().get(), pair.second().get())) {
                continue;
            }

            if self.is_semantic_positive(pair) {
                continue;
            }
            if self.protection.judge(pair, self.config).ordinary {
                continue;
            }

            sampled.push(pair);
        }

        sampled
    }

    /// Returns whether the pair is a semantic-positive edge.
    ///
    /// The graph is symmetric, so one row's adjacency decides.
    fn is_semantic_positive(&self, pair: NodePair) -> bool {
        self.semantic
            .row(pair.first().usize())
            .any(|edge| edge.id == pair.second())
    }
}
