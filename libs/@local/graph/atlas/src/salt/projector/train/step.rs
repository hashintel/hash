//! One training step's objective.
//!
//! Forward, hand-gradient fields, budget diagnostics, and the backward-ready surrogate.
//!
//! [`objective`](Evaluation::objective) projects the batch rows and hands the coordinates to
//! [`evaluate`], which computes the composite objective in two regimes. The hand-gradient families
//! (semantic attraction, ordinary and hard repulsion, relation attraction) evaluate value and
//! per-node coordinate gradient against the detached coordinate frame; the evaluation measures the
//! relation field per node against the semantic one for the budget diagnostics, and the combined
//! field re-enters the parameter graph through the surrogate scalar, whose single backward pass
//! deposits exactly that field. The support families (temporal anchors, landmarks) ride ordinary
//! autodiff on the coordinate tensor - they carry no budget diagnostics - and add onto the same
//! scalar.
//!
//! Relation-inactive nodes - every node when the batch carries no relation edges, and any node
//! whose accumulated relation gradient is exactly zero - contribute their semantic gradient alone
//! and are not recorded into the budget metrics: there is nothing to measure.

use core::alloc::Allocator;

use burn::tensor::{
    Tensor, TensorData,
    backend::{AutodiffBackend, Backend},
};
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    ObjectiveOptions, StepError,
    batch::{Batch, NodeColumns, ROW_ALIGNMENT},
    metrics::{BudgetBreakdown, DegreeDeciles},
};
use crate::{
    identity::OntologyRowId,
    math::{DVec2, FinitePointField, NonFinitePoint, Vec2},
    salt::projector::{
        budget::{self, BudgetOutcome},
        loss::{
            BatchRowId, GradientField, SupportTargets, attraction_term, relation_term,
            repulsion_term, support_term,
        },
        model::Projector,
    },
};

/// The step's evaluated loss values, one per objective family.
///
/// Values are the scaled batch sums the step actually descends; families absent from the batch
/// report zero.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub struct LossBreakdown {
    /// Semantic attraction.
    pub semantic: f32,
    /// Ordinary negative repulsion.
    pub ordinary: f32,
    /// Mined hard-negative repulsion.
    pub hard: f32,
    /// Relation attraction, lens factor included.
    pub relation: f32,
    /// Temporal anchor support.
    pub anchor: f32,
    /// Landmark support.
    pub landmark: f32,
    /// The target objective's contribution, activation included.
    ///
    /// Zero before the boundary, on runs without a target configuration, and at zero activation.
    /// The unscaled estimand reading lives in the target evidence.
    pub target: f32,
}

impl LossBreakdown {
    /// Returns the composite objective value.
    #[must_use]
    pub fn total(&self) -> f32 {
        let Self {
            semantic,
            ordinary,
            hard,
            relation,
            anchor,
            landmark,
            target,
        } = *self;

        semantic + ordinary + hard + relation + anchor + landmark + target
    }
}

/// One step's backward-ready scalar and its evaluated values.
///
/// A single backward pass through `surrogate` deposits the combined coordinate field and the
/// support gradients into the shared model parameters.
pub(crate) struct Objective<B: AutodiffBackend> {
    /// The scalar to backpropagate.
    pub surrogate: Tensor<B, 1>,
    /// The step's loss values, for the training evidence.
    pub loss: LossBreakdown,
}

/// The step objective's run-bound context.
///
/// The corpus input columns, the numerical contract, and the reporting decile axis.
///
/// Bound once per training run; the loop composes the frozen relation energy into `options` at the
/// phase boundary.
#[derive(Debug)]
pub(crate) struct Evaluation<'run, N> {
    /// The per-row model input columns of the whole corpus.
    pub columns: NodeColumns<'run, N>,
    /// The objective's numerical contract.
    pub options: ObjectiveOptions,
    /// The relation-degree decile axis of the budget metrics.
    pub deciles: DegreeDeciles<N>,
}

impl<N> Evaluation<'_, N>
where
    N: Id,
{
    /// Projects the batch rows and evaluates the composite objective.
    ///
    /// # Errors
    ///
    /// Returns an error when the forward pass produces a non-finite coordinate, which means
    /// training diverged.
    ///
    /// # Panics
    ///
    /// This panics when the input columns disagree with the batch rows, when relation edges arrive
    /// without a frozen relation energy, or when a scale table is missing where relation edges are
    /// present. Each of those is a wiring defect.
    pub(crate) fn objective<B: AutodiffBackend<FloatElem = f32>, A: Allocator>(
        &self,
        model: &Projector<B>,
        batch: &Batch<N, A>,
        metrics: &mut BudgetBreakdown,
        device: &B::Device,
    ) -> Result<Objective<B>, StepError<N>> {
        let coordinates = model.forward(batch.input(self.columns, device));
        evaluate(coordinates, batch, &self.options, &self.deciles, metrics)
    }
}

/// Evaluates the composite objective against projected coordinates.
///
/// `coordinates` are the batch rows' projections in the batch's local row order, optionally
/// followed by alignment padding. Trailing rows beyond the batch's own are the materialized input's
/// padding twins (see [`ROW_ALIGNMENT`]), which no population references, so they carry exactly
/// zero force.
///
/// Splitting this from [`objective`](Evaluation::objective) keeps the coordinate producer
/// exchangeable, so the training loop forwards the model while tests drive hand-built frames.
///
/// # Errors
///
/// Returns an error when a coordinate is non-finite, which means training diverged.
///
/// # Panics
///
/// This panics when the coordinate row count disagrees with the batch, when relation edges arrive
/// without a frozen relation energy, or when a scale table is missing. Each of those is a wiring
/// defect.
#[expect(
    clippy::panic_in_result_fn,
    reason = "a frame/batch row mismatch is a wiring defect contract, not a recoverable error"
)]
pub(crate) fn evaluate<N, B: AutodiffBackend<FloatElem = f32>, A: Allocator>(
    coordinates: Tensor<B, 2>,
    batch: &Batch<N, A>,
    options: &ObjectiveOptions,
    deciles: &DegreeDeciles<N>,
    metrics: &mut BudgetBreakdown,
) -> Result<Objective<B>, StepError<N>>
where
    N: Id,
{
    let frame_rows = coordinates.dims()[0];
    assert!(
        (batch.rows.len()..=batch.rows.len().next_multiple_of(ROW_ALIGNMENT.get()))
            .contains(&frame_rows),
        "the coordinate frame should cover the batch rows, at most alignment-padded"
    );

    // Alignment padding trails the batch rows. A padded point diverging names the last real row.
    let diverged = |offender: NonFinitePoint<BatchRowId>| {
        let local = BatchRowId::from_usize(offender.id.as_usize().min(batch.rows.len() - 1));
        StepError::Diverged {
            row: batch.rows[local],
        }
    };
    let values = read_frame_finite(coordinates.clone().inner()).map_err(diverged)?;
    let frame = values.prefix(batch.rows.bound());

    let rows = frame.len();
    let coefficients = options.coefficients;

    let mut semantic_field = GradientField::new(rows);
    let semantic = attraction_term(
        frame,
        batch.semantic.iter().map(|&pair| (pair, 1.0)),
        options.affinity,
        coefficients.semantic * batch.semantic_scale,
        &mut semantic_field,
    );
    let ordinary = repulsion_term(
        frame,
        batch.ordinary.iter().map(|&pair| (pair, 1.0)),
        options.affinity,
        coefficients.ordinary * batch.ordinary_scale,
        &mut semantic_field,
    );
    let hard = repulsion_term(
        frame,
        batch.hard.iter().copied(),
        options.affinity,
        coefficients.hard * batch.hard_scale,
        &mut semantic_field,
    );

    let (relation, mut combined) = if batch.relation.is_empty() {
        (0.0, flatten(semantic_field.as_slice()))
    } else {
        relation_pass(frame, batch, options, &semantic_field, deciles, metrics)
    };

    let device = coordinates.device();
    let landmark_term = SupportTargets::new(&batch.landmarks, &device).map(|targets| {
        support_term(
            &coordinates,
            &targets,
            options.support,
            coefficients.landmark * batch.landmark_scale,
        )
    });
    let anchor_term = SupportTargets::new(&batch.anchors, &device).map(|targets| {
        support_term(
            &coordinates,
            &targets,
            options.support,
            coefficients.anchor * batch.anchor_scale,
        )
    });

    // The surrogate's field matches the coordinate tensor's padded shape. The padding rows carry
    // exactly zero force.
    combined.resize(frame_rows * 2, 0.0);
    let gradient = Tensor::from_data(TensorData::new(combined, [frame_rows, 2]), &device);
    let mut surrogate = budget::surrogate(coordinates, gradient);

    let mut landmark = 0.0;
    if let Some(term) = landmark_term {
        landmark = term.clone().into_scalar();
        surrogate = surrogate + term;
    }
    let mut anchor = 0.0;
    if let Some(term) = anchor_term {
        anchor = term.clone().into_scalar();
        surrogate = surrogate + term;
    }

    Ok(Objective {
        surrogate,
        loss: LossBreakdown {
            semantic,
            ordinary,
            hard,
            relation,
            anchor,
            landmark,
            // The target objective evaluates outside this function - it reads whole-corpus
            // frozen references the batch never carries - and the loop composes its
            // contribution in.
            target: 0.0,
        },
    })
}

/// Evaluates the relation term per type and records its per-node measurements as budget metrics.
///
/// Returns the relation loss value and the flattened combined field.
fn relation_pass<N, A: Allocator>(
    frame: &FinitePointField<BatchRowId>,
    batch: &Batch<N, A>,
    options: &ObjectiveOptions,
    semantic_field: &GradientField<BatchRowId>,
    deciles: &DegreeDeciles<N>,
    metrics: &mut BudgetBreakdown,
) -> (f32, Vec<f32>)
where
    N: Id,
{
    let energy = options
        .relation
        .expect("relation edges arrive only after the boundary freezes the relation energy");
    let scales = batch
        .scales
        .as_ref()
        .expect("a batch with relation edges was assembled with its scale table");
    // Raw: the term scale is a product of unbounded working-precision factors, and the
    // relation term folds it under the batch's total.
    let scale = batch.eta.get() * options.coefficients.relation * batch.relation_scale;
    let rows = frame.len();

    // One scratch field serves every type. The pass reads and re-zeroes only the rows a type
    // touches, so it costs the edge lists rather than types times batch rows.
    let mut relation_field = GradientField::new(rows);
    let mut scratch = GradientField::new(rows);
    let mut contributions: Vec<(BatchRowId, OntologyRowId, Vec2)> = Vec::new();
    let mut touched: Vec<BatchRowId> = Vec::new();

    // Accumulated in double precision across types.
    let mut value = 0.0_f64;
    for sampled in &batch.relation {
        value += f64::from(relation_term(
            frame,
            scales,
            core::slice::from_ref(sampled),
            energy,
            scale,
            &mut scratch,
        ));

        touched.clear();
        touched.extend(
            sampled
                .edges
                .iter()
                .flat_map(|edge| [edge.source, edge.target]),
        );
        touched.sort_unstable();
        touched.dedup();

        for &row in &touched {
            let gradient = scratch.take(row);
            if gradient == DVec2::ZERO {
                continue;
            }

            relation_field.add(row, gradient);
            contributions.push((row, sampled.relation, gradient.narrow_lossy()));
        }
    }

    let mut outcomes: IdVec<BatchRowId, Option<BudgetOutcome>> = IdVec::from_elem(None, rows);
    let mut combined = Vec::with_capacity(rows * 2);

    for ((row, &semantic), &relation) in semantic_field
        .as_slice()
        .iter_enumerated()
        .zip(relation_field.as_slice())
    {
        let semantic = semantic.narrow_lossy();
        let relation = relation.narrow_lossy();

        let applied = if relation == Vec2::splat(0.0) {
            semantic
        } else {
            let outcome = options.budget.measure(semantic, relation);
            metrics.record_node(deciles.decile(batch.rows[row]), &outcome);
            outcomes[row] = Some(outcome);
            semantic + relation
        };

        combined.extend([applied.x(), applied.y()]);
    }

    for (row, relation, gradient) in contributions {
        // A row whose per-type contributions cancelled exactly has no budget outcome, because no
        // relation force acted there.
        let Some(outcome) = outcomes[row] else {
            continue;
        };

        metrics.record_type(
            relation,
            &BudgetOutcome {
                relation_norm: gradient.length(),
                ..outcome
            },
        );
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the double-precision batch sum is the term's contract"
    )]
    let value = value as f32;
    (value, combined)
}

/// Reads the detached coordinate frame back to the host as a proven-finite field.
///
/// The finiteness scan covers the whole readback, alignment padding included, so the returned
/// [`FinitePointField`] carries every row of the tensor in row order and downstream views need
/// no rescan.
///
/// # Errors
///
/// Returns the smallest row whose point has a NaN or infinite component.
pub(super) fn read_frame_finite<N, B: Backend<FloatElem = f32>>(
    coordinates: Tensor<B, 2>,
) -> Result<Box<FinitePointField<N>>, NonFinitePoint<N>>
where
    N: Id,
{
    let data = coordinates.into_data();
    let values = data
        .as_slice::<f32>()
        .expect("the projector's coordinates are an f32 tensor");

    let frame = Vec2::from_slice(values)
        .expect("a [rows, 2] tensor reads back an even length")
        .to_vec();
    let frame = IdVec::from_raw(frame).into_boxed_slice();

    FinitePointField::new_boxed(frame)
}

/// Flattens per-node gradients into the tensor's row-major layout.
pub(super) fn flatten<N>(gradients: &IdSlice<N, DVec2>) -> Vec<f32>
where
    N: Id,
{
    let mut flat = Vec::with_capacity(gradients.len() * 2);

    for gradient in gradients {
        let narrowed = gradient.narrow_lossy();
        flat.extend([narrowed.x(), narrowed.y()]);
    }

    flat
}
