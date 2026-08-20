//! The per-step population draws, in corpus row space.
//!
//! The draw side of [`super`]: [`BatchSampler`] pulls one step's populations from the built
//! artifacts, and the family order and the allocator contract live in the parent module's
//! documentation.

use core::alloc::Allocator;
use std::alloc::Global;

use hashql_core::id::Id;
use rand::Rng;

use super::super::BatchPlan;
use crate::{
    math::{NonNegative, Vec2},
    random::sample_indices_vec,
    salt::{
        projector::{
            miner::MinedFrame,
            sample::{
                OrdinaryNegativeSampler, RelationEdgeSampler, SampledRelationEdges,
                SemanticEdgeSampler,
            },
        },
        relation::{
            attraction::AttractionIndex,
            protection::{NodePair, ProtectionConfig, ProtectionView},
        },
        semantic::SemanticGraphView,
    },
};

/// One anchored node of a support pool, in corpus row space.
///
/// `row` names the anchored corpus row, `target` the prior or skeleton coordinate holding the node,
/// `radius` the local scale that normalizes the residual, and `weight` the anchor's mass in the
/// sum. Assembly converts drawn anchors into the batch-local
/// [`BatchAnchor`](crate::salt::projector::loss::BatchAnchor) the support term
/// consumes.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SupportAnchor<N> {
    pub row: N,
    pub target: Vec2,
    pub radius: NonNegative,
    pub weight: f32,
}

/// One step's drawn populations, in corpus row space.
///
/// Each family carries its estimator scale, the factor that makes the family's batch sum an
/// unbiased estimate of the family objective that [`super`] documents. For the relation family that
/// objective is the capped-sampling one, a per-type clipped total. An empty family carries a zero
/// scale, and its term contributes nothing.
///
/// The population vectors live in the draw's allocator. The relation draws' nested edge vectors
/// stay global (see the module documentation).
#[derive(Debug)]
pub(crate) struct Populations<'index, N, E, A: Allocator = Global> {
    /// Semantic positive pairs.
    ///
    /// Unit weights, the proportional draw already accounts for the edge weight.
    pub semantic: Vec<NodePair<N>, A>,
    /// `W / m`: total positive edge weight over drawn pairs.
    pub semantic_scale: f32,
    /// Ordinary negative pairs with unit weights.
    pub ordinary: Vec<NodePair<N>, A>,
    /// `W / m`: the commensurate-mass repulsion scale.
    pub ordinary_scale: f32,
    /// Mined hard-negative pairs with their bounded rank weights.
    pub hard: Vec<(NodePair<N>, f32), A>,
    /// `N / m`: corpus rows over drawn query rows.
    pub hard_scale: f32,
    /// Per-type capped relation attraction draws.
    pub relation: Vec<SampledRelationEdges<'index, N, E>, A>,
    /// `G / g`: total relation groups over drawn groups.
    pub relation_scale: f32,
    /// Landmark anchors, rows in corpus space.
    pub landmarks: Vec<SupportAnchor<N>, A>,
    /// Landmark pool size over drawn anchors.
    pub landmark_scale: f32,
    /// Temporal anchors, rows in corpus space.
    pub anchors: Vec<SupportAnchor<N>, A>,
    /// Anchor pool size over drawn anchors.
    pub anchor_scale: f32,
    /// The target objective's unit draws, per-type capped like the relation family.
    ///
    /// Drawn exactly when the caller says the target estimand exists - every step from the
    /// boundary on a target-configured run - independent of the step's step and of the
    /// activation, so a zero-activation reference replicate consumes the identical stream. The
    /// batch assembly never touches this family: the target term forwards its own row set at
    /// the estimand's two steps instead of riding the batch frame.
    pub target: Vec<SampledRelationEdges<'index, N, E>, A>,
    /// The step's relation-lens step.
    pub eta: NonNegative,
}

/// The per-step inputs the sampler combines with its frozen plan.
///
/// The plan's counts are frozen for the run, while these facts change step by step, so a draw
/// call names them once as one value.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DrawContext<'frame, N> {
    /// `η`: the step step's relation activation.
    pub eta: NonNegative,
    /// The pooled hard-negative frame, absent before the first refresh tick.
    pub mined: Option<&'frame MinedFrame<N>>,
    /// The landmark support pool, rows in corpus space.
    pub landmarks: &'frame [SupportAnchor<N>],
    /// The temporal-anchor support pool, rows in corpus space.
    pub anchors: &'frame [SupportAnchor<N>],
    /// Whether the target estimand exists at this step.
    ///
    /// A fact of the schedule and the run configuration, never of the activation value, so the
    /// target family's stream consumption is identical between a zero-activation reference
    /// replicate and a live target run.
    pub target: bool,
}

/// The per-step population sampler over the built artifacts.
#[derive(Debug)]
pub(crate) struct BatchSampler<'view, N, E> {
    semantic: SemanticEdgeSampler<'view, N>,
    ordinary: OrdinaryNegativeSampler<'view, N>,
    relation: RelationEdgeSampler<'view, N, E>,
    plan: BatchPlan,
    rows: usize,
    groups: usize,
}

impl<'view, N, E> BatchSampler<'view, N, E>
where
    N: Id,
    E: Id,
{
    /// Binds the samplers over one generation's artifacts.
    ///
    /// Returns [`None`] when the semantic graph holds no edge weight: a corpus without semantic
    /// evidence cannot train.
    ///
    /// # Panics
    ///
    /// This panics when the semantic graph and the protection evidence disagree about the row
    /// domain. Both artifacts come from one generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        semantic: SemanticGraphView<'view, N>,
        protection: ProtectionView<'view, N>,
        config: ProtectionConfig,
        attraction: &'view AttractionIndex<N, E>,
        plan: BatchPlan,
    ) -> Option<Self> {
        let rows = semantic.rows();
        let ordinary = OrdinaryNegativeSampler::new(semantic.clone(), protection, config);
        let semantic = SemanticEdgeSampler::new(semantic)?;

        Some(Self {
            semantic,
            ordinary,
            relation: RelationEdgeSampler::new(attraction),
            plan,
            rows,
            groups: attraction.groups().len(),
        })
    }

    /// Returns the semantic graph's total positive edge weight.
    #[inline]
    #[must_use]
    pub(crate) fn total_weight(&self) -> f32 {
        self.semantic.total_weight()
    }

    /// Draws one step's populations at the context's lens step.
    ///
    /// At a zero `eta` the draw structurally skips the relation family, because the relation
    /// term contributes nothing there and its draws would be dead weight. Hard negatives come
    /// from the context's mined frame. Before the first refresh tick no frame exists and the
    /// family is empty.
    ///
    /// # Panics
    ///
    /// This panics when the mined frame's row domain disagrees with the artifacts'. Both come from
    /// one training run, so a mismatch is a wiring defect.
    pub(crate) fn draw(
        &self,
        context: DrawContext<'_, N>,
        rng: impl Rng,
    ) -> Populations<'view, N, E> {
        self.draw_in(context, rng, Global)
    }

    /// Draws one step's populations at the context's lens step, allocating them in `alloc`.
    ///
    /// The population vectors live in `alloc`, and sampler-internal scratch stays global. Contract
    /// and panics as in [`BatchSampler::draw`].
    #[expect(
        clippy::cast_precision_loss,
        reason = "draw counts and pool sizes stay far below f32's exact-integer range for ratio \
                  purposes"
    )]
    pub(crate) fn draw_in<A: Allocator + Clone>(
        &self,
        context: DrawContext<'_, N>,
        mut rng: impl Rng,
        alloc: A,
    ) -> Populations<'view, N, E, A> {
        let semantic =
            self.semantic
                .sample_in(self.plan.semantic_pairs.get(), &mut rng, alloc.clone());
        let semantic_scale = self.semantic.total_weight() / semantic.len() as f32;

        let ordinary = self
            .ordinary
            .sample_in(self.plan.ordinary_pairs, &mut rng, alloc.clone());
        let ordinary_scale = if ordinary.is_empty() {
            0.0
        } else {
            self.semantic.total_weight() / ordinary.len() as f32
        };

        let (hard, hard_scale) = self.draw_hard_in(context.mined, &mut rng, alloc.clone());

        let (relation, relation_scale) = if context.eta > 0.0 && self.plan.relation_types != 0 {
            let drawn = self.relation.sample_in(
                self.plan.relation_types,
                self.plan.relation_cap,
                &mut rng,
                alloc.clone(),
            );
            if drawn.is_empty() {
                (drawn, 0.0)
            } else {
                let scale = self.groups as f32 / drawn.len() as f32;
                (drawn, scale)
            }
        } else {
            (Vec::new_in(alloc.clone()), 0.0)
        };

        let (landmarks, landmark_scale) = draw_support_in(
            context.landmarks,
            self.plan.landmark_anchors,
            &mut rng,
            alloc.clone(),
        );
        let (anchors, anchor_scale) = draw_support_in(
            context.anchors,
            self.plan.temporal_anchors,
            &mut rng,
            alloc.clone(),
        );

        // The target family draws last, so a run without it consumes the exact stream the
        // released trainer consumes today.
        let target = if context.target {
            self.relation.sample_in(
                self.plan.relation_types,
                self.plan.relation_cap,
                &mut rng,
                alloc,
            )
        } else {
            Vec::new_in(alloc)
        };

        Populations {
            semantic,
            semantic_scale,
            ordinary,
            ordinary_scale,
            hard,
            hard_scale,
            relation,
            relation_scale,
            landmarks,
            landmark_scale,
            anchors,
            anchor_scale,
            target,
            eta: context.eta,
        }
    }

    /// Draws query rows and collects their pooled mined pairs in `alloc`.
    #[expect(
        clippy::cast_precision_loss,
        reason = "row and query counts stay far below f32's exact-integer range for ratio purposes"
    )]
    fn draw_hard_in<A: Allocator>(
        &self,
        mined: Option<&MinedFrame<N>>,
        mut rng: impl Rng,
        alloc: A,
    ) -> (Vec<(NodePair<N>, f32), A>, f32) {
        let Some(frame) = mined else {
            return (Vec::new_in(alloc), 0.0);
        };

        if self.plan.hard_queries == 0 {
            return (Vec::new_in(alloc), 0.0);
        }

        assert_eq!(
            frame.rows(),
            self.rows,
            "the mined frame and the artifacts should cover the same rows"
        );

        let queries = self.plan.hard_queries.min(self.rows);

        let mut pairs = Vec::new_in(alloc);
        for query in sample_indices_vec(&mut rng, self.rows, queries) {
            pairs.extend(frame.row(N::from_usize(query)));
        }

        (pairs, self.rows as f32 / queries as f32)
    }
}

/// Draws a uniform support subset in `alloc`, with its pool-over-drawn scale.
#[expect(
    clippy::cast_precision_loss,
    reason = "pool sizes stay far below f32's exact-integer range for ratio purposes"
)]
fn draw_support_in<N, A: Allocator>(
    pool: &[SupportAnchor<N>],
    requested: usize,
    mut rng: impl Rng,
    alloc: A,
) -> (Vec<SupportAnchor<N>, A>, f32)
where
    N: Id,
{
    let take = requested.min(pool.len());
    if take == 0 {
        return (Vec::new_in(alloc), 0.0);
    }

    let mut drawn = Vec::with_capacity_in(take, alloc);
    drawn.extend(
        sample_indices_vec(&mut rng, pool.len(), take)
            .into_vec()
            .into_iter()
            .map(|index| pool[index]),
    );

    (drawn, pool.len() as f32 / take as f32)
}
