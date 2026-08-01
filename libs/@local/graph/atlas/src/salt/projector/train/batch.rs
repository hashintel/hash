//! Population draws and batch-local re-indexing for one minibatch.
//!
//! [`BatchSampler::draw`] pulls one step's populations from the built artifacts in corpus row
//! space, together with each family's estimator scale. [`Batch::assemble`] re-indexes the
//! populations into the batch-local row domain the loss terms speak - corpus keys convert to
//! `BatchRowId` positions here and nowhere else, so the type system keeps the two domains apart -
//! and [`Batch::input`] materializes the model input tensors for the participating rows, padded to
//! [`ROW_ALIGNMENT`] so the tensor shapes stay inside every GPU kernel's launch constraints.
//!
//! Draws consume the caller's random stream in a fixed family order (semantic, ordinary, hard,
//! relation, landmark, anchor), and a skipped family consumes nothing. Equal artifacts,
//! plans, stream types, and seeds therefore reproduce a batch exactly.
//!
//! The drawing and assembly paths allocate per step, so both expose `_in` variants in the
//! standard library's allocator pattern: [`BatchSampler::draw_in`] and [`Batch::assemble_in`]
//! place every population and batch vector in the caller's allocator, and the plain methods are
//! defaulting wrappers over the global one. The allocator covers the batch spine; the structures
//! nested inside draws (the relation draws' and [`RelationEdges`]' edge vectors, the
//! gathered [`LocalScales`]) and the tensor buffers of [`Batch::input`] - consumed by the
//! backend - stay global.

use core::{alloc::Allocator, num::NonZero};
use std::alloc::Global;

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use hashql_core::id::{Id, IdSlice};
use rand::Rng;

use super::BatchPlan;
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, NonNegative, Vec2},
    random::sample_indices_vec,
    salt::{
        projector::{
            loss::{BatchAnchor, BatchRowId, RelationEdge, RelationEdges},
            miner::MinedFrame,
            model::{NodeRole, ProjectorInput},
            sample::{
                OrdinaryNegativeSampler, RelationEdgeSampler, SampledRelationEdges,
                SemanticEdgeSampler,
            },
            scale::LocalScales,
        },
        relation::{
            attraction::AttractionIndex,
            protection::{NodePair, ProtectionConfig, ProtectionView},
        },
        semantic::SemanticGraphView,
    },
};

/// The materialized model input's row alignment.
///
/// The batch's gathered-row count is dynamic - draws and deduplication vary per step - and it
/// becomes the reduction dimension of the backward matmuls. Some GPU matmul kernels elected by
/// shape-bucketed autotune constrain that dimension to a plane-size multiple and abort on shapes
/// that violate it, so every materialized frame pads its row count to this alignment. A generous
/// power of two covers every plausible plane size and collapses the per-step shape variety the
/// election is sensitive to.
///
/// Padded rows replicate the last participating row and no population references them, so they
/// receive exactly zero force and contribute exactly zero parameter gradient.
pub(crate) const ROW_ALIGNMENT: NonZero<usize> =
    NonZero::new(256).expect("the row alignment is non-zero");

/// One anchored node of a support pool, in corpus row space.
///
/// `row` names the anchored corpus row, `target` the prior or skeleton coordinate holding the node,
/// `radius` the local scale that normalizes the residual, and `weight` the anchor's mass in the
/// sum. Assembly converts drawn anchors into the batch-local [`BatchAnchor`] the support term
/// consumes.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SupportAnchor<N> {
    pub row: N,
    pub target: Vec2,
    pub radius: f32,
    pub weight: f32,
}

/// One step's drawn populations, in corpus row space.
///
/// Each family carries its estimator scale, the factor that makes the family's batch sum an
/// unbiased estimate of the family objective that [`super`] documents. For the relation family that
/// objective is the capped-sampling one, a per-type clipped total. An empty family carries a zero
/// scale, and its term contributes nothing.
///
/// The population vectors live in the draw's allocator; the relation draws' nested edge vectors
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
    /// The step's relation-lens rung.
    pub eta: NonNegative,
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

    /// Draws one step's populations at the given lens rung.
    ///
    /// At `eta == 0` the draw structurally skips the relation family, because the relation term
    /// contributes nothing there and its draws would be dead weight. Hard negatives come from
    /// `mined` when a pooled frame exists. Before the first refresh tick no frame exists and the
    /// family is empty.
    ///
    /// # Panics
    ///
    /// This panics when the mined frame's row domain disagrees with the artifacts'. Both come from
    /// one training run, so a mismatch is a wiring defect.
    pub(crate) fn draw(
        &self,
        eta: NonNegative,
        mined: Option<&MinedFrame<N>>,
        landmarks: &[SupportAnchor<N>],
        anchors: &[SupportAnchor<N>],
        rng: impl Rng,
    ) -> Populations<'view, N, E> {
        self.draw_in(eta, mined, landmarks, anchors, rng, Global)
    }

    /// Draws one step's populations at the given lens rung, allocating them in `alloc`.
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
        eta: NonNegative,
        mined: Option<&MinedFrame<N>>,
        landmarks: &[SupportAnchor<N>],
        anchors: &[SupportAnchor<N>],
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

        let (hard, hard_scale) = self.draw_hard_in(mined, &mut rng, alloc.clone());

        let (relation, relation_scale) = if eta.get() > 0.0 && self.plan.relation_types != 0 {
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
            landmarks,
            self.plan.landmark_anchors,
            &mut rng,
            alloc.clone(),
        );
        let (anchors, anchor_scale) =
            draw_support_in(anchors, self.plan.temporal_anchors, &mut rng, alloc);

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
            eta,
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

/// The per-row model input columns of one corpus.
///
/// The representation matrix and the role column are the two per-row inputs the projector consumes;
/// they always travel together, cover the same rows, and stay borrowed from the mapped artifacts.
#[derive(Debug, Copy, Clone)]
pub(crate) struct NodeColumns<'corpus, N> {
    /// Normalized representations, one aligned row per node.
    pub representations: &'corpus IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The projection role of each node row.
    pub roles: &'corpus IdSlice<N, NodeRole>,
}

/// One assembled minibatch, re-indexed to the batch-local row domain.
///
/// `rows` lists the participating corpus rows in ascending order; a population's [`BatchRowId`]
/// position `i` refers to `rows[i]`. The corpus-to-local map is monotone, so canonical pair
/// ordering survives re-indexing.
///
/// The batch vectors live in the assembly's allocator; the relation entries' nested edge vectors
/// and the gathered scales stay global (see the module documentation).
#[derive(Debug)]
pub(crate) struct Batch<N, A: Allocator = Global> {
    /// The participating corpus rows, ascending and distinct: the batch-to-corpus row map.
    pub rows: Box<IdSlice<BatchRowId, N>, A>,
    /// Semantic positive pairs, batch-local.
    pub semantic: Vec<NodePair<BatchRowId>, A>,
    /// See [`Populations::semantic_scale`].
    pub semantic_scale: f32,
    /// Ordinary negative pairs, batch-local.
    pub ordinary: Vec<NodePair<BatchRowId>, A>,
    /// See [`Populations::ordinary_scale`].
    pub ordinary_scale: f32,
    /// Hard-negative pairs with rank weights, batch-local.
    pub hard: Vec<(NodePair<BatchRowId>, f32), A>,
    /// See [`Populations::hard_scale`].
    pub hard_scale: f32,
    /// Relation draws with batch-local endpoints.
    pub relation: Vec<RelationEdges<BatchRowId>, A>,
    /// See [`Populations::relation_scale`].
    pub relation_scale: f32,
    /// Landmark anchors, batch-local.
    pub landmarks: Vec<BatchAnchor, A>,
    /// See [`Populations::landmark_scale`].
    pub landmark_scale: f32,
    /// Temporal anchors, batch-local.
    pub anchors: Vec<BatchAnchor, A>,
    /// See [`Populations::anchor_scale`].
    pub anchor_scale: f32,
    /// The participating rows' local scales, gathered from the corpus table.
    ///
    /// Present exactly when relation edges are.
    pub scales: Option<LocalScales<BatchRowId>>,
    /// The step's relation-lens rung.
    pub eta: NonNegative,
}

impl<N> Batch<N>
where
    N: Id,
{
    /// Re-indexes drawn populations into the batch-local row domain.
    ///
    /// `scales` is the corpus-wide local-scale table of the step's rung; the batch gathers the
    /// participating rows' entries. The opening semantic-only segment has no scale tables and
    /// passes [`None`] - its draws carry no relation edges.
    ///
    /// # Panics
    ///
    /// This panics when relation edges are present without a scale table, or when a drawn row lies
    /// outside the table. The draws and the tables come from one training run, so a mismatch is a
    /// wiring defect.
    #[must_use]
    pub(crate) fn assemble<E>(
        populations: Populations<'_, N, E>,
        scales: Option<&LocalScales<N>>,
    ) -> Self
    where
        E: Id,
    {
        Self::assemble_in(populations, scales, Global)
    }
}

impl<N, A: Allocator> Batch<N, A>
where
    N: Id,
{
    /// Re-indexes drawn populations into the batch-local row domain, allocating in `alloc`.
    ///
    /// The populations may carry any allocator: re-indexing consumes their values, not their
    /// storage. Contract and panics as in [`Batch::assemble`].
    #[must_use]
    pub(crate) fn assemble_in<E>(
        populations: Populations<'_, N, E, impl Allocator>,
        scales: Option<&LocalScales<N>>,
        alloc: A,
    ) -> Self
    where
        E: Id,
        A: Clone,
    {
        assert!(
            populations.relation.is_empty() || scales.is_some(),
            "relation edges need the rung's local scales"
        );

        let mut rows: Vec<N, A> = Vec::new_in(alloc.clone());
        for pair in populations.semantic.iter().chain(&populations.ordinary) {
            rows.extend([pair.lhs(), pair.rhs()]);
        }

        for (pair, _) in &populations.hard {
            rows.extend([pair.lhs(), pair.rhs()]);
        }

        for sampled in &populations.relation {
            for edge in &sampled.edges {
                rows.extend([edge.source, edge.target]);
            }
        }

        for anchor in populations.landmarks.iter().chain(&populations.anchors) {
            rows.push(anchor.row);
        }
        rows.sort_unstable();
        rows.dedup();

        let local = |id: N| {
            let position = rows
                .binary_search(&id)
                .expect("every re-indexed row was collected above");

            BatchRowId::new(u32::try_from(position).expect("batch positions fit the u32 encoding"))
        };

        let mut semantic = Vec::with_capacity_in(populations.semantic.len(), alloc.clone());
        semantic.extend(
            populations
                .semantic
                .iter()
                .map(|pair| NodePair::new(local(pair.lhs()), local(pair.rhs()))),
        );

        let mut ordinary = Vec::with_capacity_in(populations.ordinary.len(), alloc.clone());
        ordinary.extend(
            populations
                .ordinary
                .iter()
                .map(|pair| NodePair::new(local(pair.lhs()), local(pair.rhs()))),
        );

        let mut hard = Vec::with_capacity_in(populations.hard.len(), alloc.clone());
        hard.extend(
            populations.hard.iter().map(|&(pair, weight)| {
                (NodePair::new(local(pair.lhs()), local(pair.rhs())), weight)
            }),
        );

        let mut relation = Vec::with_capacity_in(populations.relation.len(), alloc.clone());
        relation.extend(populations.relation.into_iter().map(|sampled| {
            RelationEdges {
                relation: sampled.group.relation(),
                weights: sampled.group.weights(),
                edges: sampled
                    .edges
                    .into_iter()
                    .map(|edge| RelationEdge {
                        source: local(edge.source),
                        target: local(edge.target),
                        confidence: edge.confidence.value(),
                        normalization: edge.normalization,
                    })
                    .collect(),
            }
        }));

        let localize = |anchor: &SupportAnchor<N>| BatchAnchor {
            row: local(anchor.row),
            target: anchor.target,
            radius: anchor.radius,
            weight: anchor.weight,
        };

        let mut landmarks = Vec::with_capacity_in(populations.landmarks.len(), alloc.clone());
        landmarks.extend(populations.landmarks.iter().map(localize));
        let mut anchors = Vec::with_capacity_in(populations.anchors.len(), alloc);
        anchors.extend(populations.anchors.iter().map(localize));

        let scales = scales.map(|table| {
            let gathered = rows.iter().map(|&row| table.as_slice()[row]).collect();

            LocalScales::new(IdSlice::from_boxed_slice(gathered))
        });

        Self {
            rows: IdSlice::from_boxed_slice(rows.into_boxed_slice()),
            semantic,
            semantic_scale: populations.semantic_scale,
            ordinary,
            ordinary_scale: populations.ordinary_scale,
            hard,
            hard_scale: populations.hard_scale,
            relation,
            relation_scale: populations.relation_scale,
            landmarks,
            landmark_scale: populations.landmark_scale,
            anchors,
            anchor_scale: populations.anchor_scale,
            scales,
            eta: populations.eta,
        }
    }

    /// Materializes the batch's model input on `device`.
    ///
    /// With the row dimension padded to [`ROW_ALIGNMENT`].
    ///
    /// The condition vector is the relation lens, and every row carries the batch's rung as its
    /// single column. The model is parametric in the condition width.
    ///
    /// # Panics
    ///
    /// This panics when the representation and role columns disagree in length or a batch row lies
    /// outside them. The columns and the draws come from one generation, so a mismatch is a wiring
    /// defect.
    #[must_use]
    pub(crate) fn input<B: Backend>(
        &self,
        columns: NodeColumns<'_, N>,
        device: &B::Device,
    ) -> ProjectorInput<B> {
        self.input_aligned(columns, device, ROW_ALIGNMENT)
    }

    /// Materializes the batch's model input at an explicit row alignment.
    ///
    /// The row count pads up to the next `alignment` multiple. Padded rows replicate the last
    /// participating row and carry the batch's rung. No population references them, so they project
    /// dead coordinates that receive exactly zero force. Production goes through [`Batch::input`],
    /// and certificates pass `1` to obtain the unpadded frame.
    ///
    /// # Panics
    ///
    /// This panics when the representation and role columns disagree in length or a batch row lies
    /// outside them. The columns and the draws come from one generation, so a mismatch is a wiring
    /// defect.
    #[must_use]
    pub(crate) fn input_aligned<B: Backend>(
        &self,
        columns: NodeColumns<'_, N>,
        device: &B::Device,
        alignment: NonZero<usize>,
    ) -> ProjectorInput<B> {
        assert_eq!(
            columns.representations.len(),
            columns.roles.len(),
            "the representation and role columns should cover the same rows"
        );

        let rows = self.rows.len();
        let padded = rows.next_multiple_of(alignment.get());
        let mut representation = Vec::with_capacity(padded * PROJECTOR_DIMENSIONS);
        let mut role_values = Vec::with_capacity(padded);

        for &row in self.rows.iter() {
            representation.extend_from_slice(columns.representations[row].as_array());
            role_values.push(i64::from(columns.roles[row].index()));
        }

        if let Some(&last) = self.rows.iter().next_back() {
            let pattern = columns.representations[last].as_array();
            let role = i64::from(columns.roles[last].index());
            for _ in rows..padded {
                representation.extend_from_slice(pattern);
                role_values.push(role);
            }
        }

        ProjectorInput {
            representation: Tensor::from_data(
                TensorData::new(representation, [padded, PROJECTOR_DIMENSIONS]),
                device,
            ),
            roles: Tensor::<B, 1, Int>::from_data(TensorData::new(role_values, [padded]), device),
            condition: Tensor::from_data(
                TensorData::new(vec![self.eta.get(); padded], [padded, 1]),
                device,
            ),
        }
    }
}
