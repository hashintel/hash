//! Minibatch assembly: population draws and batch-local re-indexing.
//!
//! [`BatchSampler::draw`] pulls one step's populations from the built
//! artifacts in corpus row space, together with each family's
//! estimator scale. [`Batch::assemble`] re-indexes the populations
//! into a batch-local coordinate domain - the loss terms are
//! index-space agnostic, and only the participating rows are projected
//! per step - and [`Batch::input`] materializes the model input
//! tensors for those rows.
//!
//! Draws consume the caller's random stream in a fixed family order
//! (semantic, ordinary, hard, relation, landmark, anchor); a family
//! whose draw is skipped consumes nothing. Equal artifacts, plans,
//! stream types, and seeds therefore reproduce a batch exactly.

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use rand::Rng;

use super::BatchPlan;
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::sample_indices_vec,
    salt::{
        projector::{
            loss::SupportAnchor,
            miner::MinedFrame,
            model::{NodeRole, ProjectorInput},
            sample::{
                OrdinaryNegativeSampler, RelationEdgeSampler, SampledRelationEdges,
                SemanticEdgeSampler,
            },
            scale::LocalScales,
        },
        relation::{
            attraction::{AttractionEdge, AttractionIndex},
            protection::{NodePair, ProtectionConfig, ProtectionView},
        },
        semantic::SemanticGraphView,
    },
};

/// One step's drawn populations, in corpus row space.
///
/// Each family carries its estimator scale: the factor that makes the
/// family's batch sum an unbiased estimate of its full objective (see
/// the module documentation of [`super`]). An empty family carries a
/// zero scale; its term contributes nothing.
#[derive(Debug)]
pub(crate) struct Populations<'index> {
    /// Semantic positive pairs; unit weights, the proportional draw
    /// already accounts for the edge weight.
    pub semantic: Vec<NodePair>,
    /// `W / m`: total positive edge weight over drawn pairs.
    pub semantic_scale: f32,
    /// Ordinary negative pairs; unit weights.
    pub ordinary: Vec<NodePair>,
    /// `W / m`: the commensurate-mass repulsion scale.
    pub ordinary_scale: f32,
    /// Mined hard-negative pairs with their bounded rank weights.
    pub hard: Vec<(NodePair, f32)>,
    /// `N / m`: corpus rows over drawn query rows.
    pub hard_scale: f32,
    /// Per-type capped relation attraction draws.
    pub relation: Vec<SampledRelationEdges<'index>>,
    /// `G / g`: total relation groups over drawn groups.
    pub relation_scale: f32,
    /// Landmark anchors, rows in corpus space.
    pub landmarks: Vec<SupportAnchor>,
    /// Landmark pool size over drawn anchors.
    pub landmark_scale: f32,
    /// Temporal anchors, rows in corpus space.
    pub anchors: Vec<SupportAnchor>,
    /// Anchor pool size over drawn anchors.
    pub anchor_scale: f32,
    /// The step's relation-lens rung.
    pub eta: f32,
}

/// The per-step population sampler over the built artifacts.
#[derive(Debug)]
pub(crate) struct BatchSampler<'view> {
    semantic: SemanticEdgeSampler<'view>,
    ordinary: OrdinaryNegativeSampler<'view>,
    relation: RelationEdgeSampler<'view>,
    plan: BatchPlan,
    rows: usize,
    groups: usize,
}

impl<'view> BatchSampler<'view> {
    /// Binds the samplers over one generation's artifacts.
    ///
    /// Returns [`None`] when the semantic graph holds no edge weight:
    /// a corpus without semantic evidence cannot train.
    ///
    /// # Panics
    ///
    /// Panics when the semantic graph and the protection evidence
    /// disagree about the row domain; both artifacts come from one
    /// generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        semantic: SemanticGraphView<'view>,
        protection: ProtectionView<'view>,
        config: ProtectionConfig,
        attraction: &'view AttractionIndex,
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
    /// The relation family is structurally skipped at `eta == 0`: the
    /// relation term contributes nothing there, so its draws would be
    /// dead weight. Hard negatives are drawn from `mined` when a
    /// pooled frame exists; before the first refresh tick there is
    /// none and the family is empty.
    ///
    /// # Panics
    ///
    /// Panics when `eta` is negative or non-finite, or when the mined
    /// frame's row domain disagrees with the artifacts'; both come
    /// from one training run, so a mismatch is a wiring defect.
    pub(crate) fn draw(
        &self,
        eta: f32,
        mined: Option<&MinedFrame>,
        landmarks: &[SupportAnchor],
        anchors: &[SupportAnchor],
        rng: &mut (impl Rng + ?Sized),
    ) -> Populations<'view> {
        assert!(
            eta.is_finite() && eta >= 0.0,
            "the relation lens rung should be finite and non-negative"
        );

        let semantic = self
            .semantic
            .sample(self.plan.semantic_pairs.get(), &mut *rng);
        let semantic_scale = self.semantic.total_weight() / count(semantic.len());

        let ordinary = self.ordinary.sample(self.plan.ordinary_pairs, &mut *rng);
        let ordinary_scale = if ordinary.is_empty() {
            0.0
        } else {
            self.semantic.total_weight() / count(ordinary.len())
        };

        let (hard, hard_scale) = self.draw_hard(mined, &mut *rng);

        let (relation, relation_scale) = if eta > 0.0 && self.plan.relation_types != 0 {
            let drawn =
                self.relation
                    .sample(self.plan.relation_types, self.plan.relation_cap, &mut *rng);
            if drawn.is_empty() {
                (drawn, 0.0)
            } else {
                let scale = count(self.groups) / count(drawn.len());
                (drawn, scale)
            }
        } else {
            (Vec::new(), 0.0)
        };

        let (landmarks, landmark_scale) =
            draw_support(landmarks, self.plan.landmark_anchors, &mut *rng);
        let (anchors, anchor_scale) = draw_support(anchors, self.plan.temporal_anchors, &mut *rng);

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

    /// Draws query rows and collects their pooled mined pairs.
    fn draw_hard(
        &self,
        mined: Option<&MinedFrame>,
        rng: &mut (impl Rng + ?Sized),
    ) -> (Vec<(NodePair, f32)>, f32) {
        let Some(frame) = mined else {
            return (Vec::new(), 0.0);
        };

        if self.plan.hard_queries == 0 {
            return (Vec::new(), 0.0);
        }

        assert_eq!(
            frame.rows(),
            self.rows,
            "the mined frame and the artifacts should cover the same rows"
        );

        let queries = self.plan.hard_queries.min(self.rows);

        let mut pairs = Vec::new();
        for query in sample_indices_vec(&mut *rng, self.rows, queries) {
            pairs.extend(frame.row(query));
        }

        (pairs, count(self.rows) / count(queries))
    }
}

/// Draws a uniform support subset with its pool-over-drawn scale.
fn draw_support(
    pool: &[SupportAnchor],
    requested: usize,
    rng: &mut (impl Rng + ?Sized),
) -> (Vec<SupportAnchor>, f32) {
    let take = requested.min(pool.len());
    if take == 0 {
        return (Vec::new(), 0.0);
    }

    let drawn = sample_indices_vec(&mut *rng, pool.len(), take)
        .into_vec()
        .into_iter()
        .map(|index| pool[index])
        .collect();
    (drawn, count(pool.len()) / count(take))
}

#[expect(
    clippy::cast_precision_loss,
    reason = "draw counts and row counts stay far below f32's exact-integer range for ratio \
              purposes"
)]
#[inline]
const fn count(value: usize) -> f32 {
    value as f32
}

/// The per-row model input columns of one corpus.
///
/// The representation matrix and the role column are the two per-row
/// inputs the projector consumes; they always travel together, cover
/// the same rows, and stay borrowed from the mapped artifacts.
#[derive(Debug, Copy, Clone)]
pub(crate) struct NodeColumns<'corpus> {
    /// Normalized representations, one aligned row per node.
    pub representations: &'corpus [AlignedVecN<PROJECTOR_DIMENSIONS>],
    /// The projection role of each node row.
    pub roles: &'corpus [NodeRole],
}

/// One assembled minibatch, re-indexed to a batch-local row domain.
///
/// `rows` lists the participating corpus rows in ascending order; a
/// population's row `i` refers to `rows[i]`. The corpus-to-local map
/// is monotone, so canonical pair ordering survives re-indexing.
#[derive(Debug)]
pub(crate) struct Batch<'index> {
    /// The participating corpus rows, ascending and distinct.
    pub rows: Box<[NodeRowId]>,
    /// Semantic positive pairs, batch-local.
    pub semantic: Vec<NodePair>,
    /// See [`Populations::semantic_scale`].
    pub semantic_scale: f32,
    /// Ordinary negative pairs, batch-local.
    pub ordinary: Vec<NodePair>,
    /// See [`Populations::ordinary_scale`].
    pub ordinary_scale: f32,
    /// Hard-negative pairs with rank weights, batch-local.
    pub hard: Vec<(NodePair, f32)>,
    /// See [`Populations::hard_scale`].
    pub hard_scale: f32,
    /// Relation draws with batch-local edge endpoints.
    pub relation: Vec<SampledRelationEdges<'index>>,
    /// See [`Populations::relation_scale`].
    pub relation_scale: f32,
    /// Landmark anchors, batch-local rows.
    pub landmarks: Vec<SupportAnchor>,
    /// See [`Populations::landmark_scale`].
    pub landmark_scale: f32,
    /// Temporal anchors, batch-local rows.
    pub anchors: Vec<SupportAnchor>,
    /// See [`Populations::anchor_scale`].
    pub anchor_scale: f32,
    /// The participating rows' local scales, gathered from the
    /// corpus table; present exactly when relation edges are.
    pub scales: Option<LocalScales>,
    /// The step's relation-lens rung.
    pub eta: f32,
}

impl<'index> Batch<'index> {
    /// Re-indexes drawn populations into the batch-local row domain.
    ///
    /// `scales` is the corpus-wide local-scale table of the step's
    /// rung; the batch gathers the participating rows' entries. The
    /// opening semantic-only segment has no scale tables and passes
    /// [`None`] - its draws carry no relation edges.
    ///
    /// # Panics
    ///
    /// Panics when relation edges are present without a scale table,
    /// or when a drawn row lies outside the table; the draws and the
    /// tables come from one training run, so a mismatch is a wiring
    /// defect.
    #[must_use]
    pub(crate) fn assemble(populations: Populations<'index>, scales: Option<&LocalScales>) -> Self {
        assert!(
            populations.relation.is_empty() || scales.is_some(),
            "relation edges need the rung's local scales"
        );

        let mut rows: Vec<NodeRowId> = Vec::new();
        for pair in populations.semantic.iter().chain(&populations.ordinary) {
            rows.extend([pair.first(), pair.second()]);
        }
        for (pair, _) in &populations.hard {
            rows.extend([pair.first(), pair.second()]);
        }
        for sampled in &populations.relation {
            for edge in &sampled.edges {
                rows.extend([edge.source, edge.target]);
            }
        }
        for anchor in populations.landmarks.iter().chain(&populations.anchors) {
            rows.push(row_id(anchor.row));
        }
        rows.sort_unstable_by_key(|row| row.get());
        rows.dedup();

        let local = |id: NodeRowId| {
            let index = rows
                .binary_search_by_key(&id.get(), |row| row.get())
                .expect("every re-indexed row was collected above");
            row_id(index)
        };

        let semantic = populations
            .semantic
            .iter()
            .map(|pair| NodePair::new(local(pair.first()), local(pair.second())))
            .collect();
        let ordinary = populations
            .ordinary
            .iter()
            .map(|pair| NodePair::new(local(pair.first()), local(pair.second())))
            .collect();
        let hard = populations
            .hard
            .iter()
            .map(|&(pair, weight)| {
                (
                    NodePair::new(local(pair.first()), local(pair.second())),
                    weight,
                )
            })
            .collect();
        let relation = populations
            .relation
            .into_iter()
            .map(|sampled| SampledRelationEdges {
                group: sampled.group,
                edges: sampled
                    .edges
                    .into_iter()
                    .map(|edge| AttractionEdge {
                        source: local(edge.source),
                        target: local(edge.target),
                        ..edge
                    })
                    .collect(),
            })
            .collect();

        let localize = |anchor: &SupportAnchor| SupportAnchor {
            row: local(row_id(anchor.row)).usize(),
            ..*anchor
        };
        let landmarks = populations.landmarks.iter().map(localize).collect();
        let anchors = populations.anchors.iter().map(localize).collect();

        let scales = scales.map(|table| {
            let gathered = rows
                .iter()
                .map(|row| table.as_slice()[row.usize()])
                .collect();
            LocalScales::new(gathered)
                .expect("a validated scale table stays valid under row selection")
        });

        Self {
            rows: rows.into_boxed_slice(),
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
    /// The condition vector is the relation lens: every row carries
    /// the batch's rung as its single column. A future type-context
    /// generation appends its pooled columns here; the model is
    /// already parametric in the condition width.
    ///
    /// # Panics
    ///
    /// Panics when the representation and role columns disagree in
    /// length or a batch row lies outside them; the columns and the
    /// draws come from one generation, so a mismatch is a wiring
    /// defect.
    #[must_use]
    pub(crate) fn input<B: Backend>(
        &self,
        columns: NodeColumns<'_>,
        device: &B::Device,
    ) -> ProjectorInput<B> {
        assert_eq!(
            columns.representations.len(),
            columns.roles.len(),
            "the representation and role columns should cover the same rows"
        );

        let rows = self.rows.len();
        let mut representation = Vec::with_capacity(rows * PROJECTOR_DIMENSIONS);
        let mut role_values = Vec::with_capacity(rows);
        for row in &self.rows {
            representation.extend_from_slice(columns.representations[row.usize()].as_array());
            role_values.push(i64::from(columns.roles[row.usize()].index()));
        }

        ProjectorInput {
            representation: Tensor::from_data(
                TensorData::new(representation, [rows, PROJECTOR_DIMENSIONS]),
                device,
            ),
            roles: Tensor::<B, 1, Int>::from_data(TensorData::new(role_values, [rows]), device),
            condition: Tensor::from_data(TensorData::new(vec![self.eta; rows], [rows, 1]), device),
        }
    }
}

#[inline]
fn row_id(index: usize) -> NodeRowId {
    NodeRowId::new(u64::try_from(index).expect("row indexes fit the row-id encoding"))
}
