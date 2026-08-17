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
//! relation, landmark, anchor, target), and a skipped family consumes nothing. Equal artifacts,
//! plans, stream types, and seeds therefore reproduce a batch exactly.
//!
//! The drawing and assembly paths allocate per step, so both expose `_in` variants in the standard
//! library's allocator pattern: [`BatchSampler::draw_in`] and [`Batch::assemble_in`] place every
//! population and batch vector in the caller's allocator, and the plain methods are defaulting
//! wrappers over the global one. The allocator covers the batch spine; the structures nested inside
//! draws (the relation draws' and [`RelationEdges`]' edge vectors, the gathered [`LocalScales`])
//! and the tensor buffers of [`Batch::input`] - consumed by the backend - stay global.

use core::{alloc::Allocator, num::NonZero};
use std::alloc::Global;

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use hashql_core::id::{Id, IdSlice};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, NonNegative},
    salt::{
        projector::{
            loss::{BatchAnchor, BatchRowId, RelationEdge, RelationEdges},
            model::{NodeRole, ProjectorInput},
            scale::LocalScales,
        },
        relation::protection::NodePair,
    },
};

mod draw;

pub(crate) use self::draw::{BatchSampler, DrawContext, Populations, SupportAnchor};

/// The materialized model input's row alignment.
///
/// The batch's gathered-row count varies per step - draws and deduplication decide it - and it
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

/// The per-row model input columns of one corpus.
///
/// The representation matrix and the role column are the two per-row inputs the projector
/// consumes. They always travel together over the same rows, borrowed from the mapped artifacts.
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
        materialize_input(self.rows.as_raw(), self.eta, columns, device, alignment)
    }
}

/// Materializes a model input for an explicit row set at one rung on `device`.
///
/// The row count pads up to the next `alignment` multiple. Padded rows replicate the last row and
/// carry the same rung. [`Batch::input`] wraps this for the assembled batch, and the target
/// objective materializes its own row set at the estimand's two rungs through it.
///
/// # Panics
///
/// This panics when the representation and role columns disagree in length or a row lies outside
/// them. The columns and the draws come from one generation, so a mismatch is a wiring defect.
#[must_use]
pub(crate) fn materialize_input<N, B: Backend>(
    rows: &[N],
    eta: NonNegative,
    columns: NodeColumns<'_, N>,
    device: &B::Device,
    alignment: NonZero<usize>,
) -> ProjectorInput<B>
where
    N: Id,
{
    assert_eq!(
        columns.representations.len(),
        columns.roles.len(),
        "the representation and role columns should cover the same rows"
    );

    let count = rows.len();
    let padded = count.next_multiple_of(alignment.get());
    let mut representation = Vec::with_capacity(padded * PROJECTOR_DIMENSIONS);
    let mut role_values = Vec::with_capacity(padded);

    for &row in rows {
        representation.extend_from_slice(columns.representations[row].as_array());
        role_values.push(i64::from(columns.roles[row].index()));
    }

    if let Some(&last) = rows.last() {
        let pattern = columns.representations[last].as_array();
        let role = i64::from(columns.roles[last].index());
        for _ in count..padded {
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
            TensorData::new(vec![eta.get(); padded], [padded, 1]),
            device,
        ),
    }
}
