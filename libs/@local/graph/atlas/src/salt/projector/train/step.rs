//! One training step's objective: forward, hand-gradient fields,
//! budget clip, and the backward-ready surrogate.
//!
//! [`objective`] projects the batch rows and hands the coordinates to
//! [`evaluate`], which computes the composite objective in two
//! regimes. The budget-governed families (semantic attraction,
//! ordinary and hard repulsion, relation attraction) evaluate value
//! and per-node coordinate gradient against the detached coordinate
//! frame; the relation field is clipped per node against the semantic
//! one, and the combined field re-enters the parameter graph through
//! the surrogate scalar, whose single backward pass deposits exactly
//! that field. The support families (temporal anchors, landmarks) ride
//! ordinary autodiff on the coordinate tensor - they are outside the
//! budget - and add onto the same scalar.
//!
//! Relation-inactive nodes - every node when the batch carries no
//! relation edges, and any node whose accumulated relation gradient is
//! exactly zero - contribute their semantic gradient unclipped and are
//! not recorded into the budget metrics: there is nothing to budget.

use burn::tensor::{
    Tensor, TensorData,
    backend::{AutodiffBackend, Backend},
};

use super::{
    ObjectiveOptions, StepError,
    batch::{Batch, NodeColumns},
    metrics::{BudgetBreakdown, DegreeDeciles},
};
use crate::{
    dataset::{NodeRowId, OntologyRowId},
    math::Vec2,
    salt::projector::{
        budget::{self, ClippedRelation},
        loss::{
            GradientField, SupportTargets, attraction_term, relation_term, repulsion_term,
            support_term,
        },
        model::Projector,
    },
};

/// The step's evaluated loss values, one per objective family.
///
/// Values are the scaled batch sums the step actually descends;
/// families absent from the batch report zero.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct LossBreakdown {
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
}

impl LossBreakdown {
    /// Returns the composite objective value.
    #[must_use]
    pub(crate) fn total(&self) -> f32 {
        let Self {
            semantic,
            ordinary,
            hard,
            relation,
            anchor,
            landmark,
        } = *self;
        semantic + ordinary + hard + relation + anchor + landmark
    }
}

/// One step's backward-ready scalar and its evaluated values.
///
/// A single backward pass through `surrogate` deposits the budgeted
/// coordinate field and the support gradients into the shared model
/// parameters.
pub(crate) struct Objective<B: AutodiffBackend> {
    /// The scalar to backpropagate.
    pub surrogate: Tensor<B, 1>,
    /// The step's loss values, for the training evidence.
    pub loss: LossBreakdown,
}

/// The step objective's run-bound context: the corpus input columns,
/// the numerical contract, and the reporting decile axis.
///
/// Bound once per training run; the loop composes the frozen relation
/// energy into `options` at the phase boundary.
#[derive(Debug)]
pub(crate) struct Evaluation<'run> {
    /// The per-row model input columns of the whole corpus.
    pub columns: NodeColumns<'run>,
    /// The objective's numerical contract.
    pub options: ObjectiveOptions,
    /// The relation-degree decile axis of the budget metrics.
    pub deciles: DegreeDeciles,
}

impl Evaluation<'_> {
    /// Projects the batch rows and evaluates the composite objective.
    ///
    /// # Errors
    ///
    /// Returns an error when the forward pass produces a non-finite
    /// coordinate: training diverged.
    ///
    /// # Panics
    ///
    /// Panics on wiring defects: input columns disagreeing with the
    /// batch rows, relation edges without a frozen relation energy, or
    /// scale tables missing where relation edges are present.
    pub(crate) fn objective<B: AutodiffBackend<FloatElem = f32>>(
        &self,
        model: &Projector<B>,
        batch: &Batch,
        metrics: &mut BudgetBreakdown,
        device: &B::Device,
    ) -> Result<Objective<B>, StepError> {
        let coordinates = model.forward(batch.input(self.columns, device));
        evaluate(coordinates, batch, &self.options, &self.deciles, metrics)
    }
}

/// Evaluates the composite objective against projected coordinates.
///
/// `coordinates` are the batch rows' projections, shape `[rows, 2]`,
/// in the batch's local row order. Split from [`objective`] so the
/// coordinate producer stays exchangeable: the training loop forwards
/// the model, tests drive hand-built frames.
///
/// # Errors
///
/// Returns an error when a coordinate is non-finite: training
/// diverged.
///
/// # Panics
///
/// Panics on wiring defects: a coordinate row count disagreeing with
/// the batch, relation edges without a frozen relation energy, or a
/// missing scale table.
#[expect(
    clippy::panic_in_result_fn,
    reason = "a frame/batch row mismatch is a wiring defect contract, not a recoverable error"
)]
pub(crate) fn evaluate<B: AutodiffBackend<FloatElem = f32>>(
    coordinates: Tensor<B, 2>,
    batch: &Batch,
    options: &ObjectiveOptions,
    deciles: &DegreeDeciles,
    metrics: &mut BudgetBreakdown,
) -> Result<Objective<B>, StepError> {
    assert_eq!(
        coordinates.dims()[0],
        batch.rows.len(),
        "the coordinate frame should cover exactly the batch rows"
    );

    let values = read_frame(coordinates.clone().inner(), &batch.rows)?;
    // Zero-copy view over the readback: `Vec2` is a transparent
    // `[f32; 2]`, so the row-major frame reinterprets in place.
    let frame = Vec2::from_slice(&values).expect("a [rows, 2] tensor reads back an even length");
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

    let (relation, combined) = if batch.relation.is_empty() {
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

    let gradient = Tensor::from_data(TensorData::new(combined, [rows, 2]), &device);
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
        },
    })
}

/// Evaluates the relation term per type, clips per node, and records
/// the budget metrics.
///
/// Returns the relation loss value and the flattened combined field.
fn relation_pass(
    frame: &[Vec2],
    batch: &Batch,
    options: &ObjectiveOptions,
    semantic_field: &GradientField,
    deciles: &DegreeDeciles,
    metrics: &mut BudgetBreakdown,
) -> (f32, Vec<f32>) {
    let energy = options
        .relation
        .expect("relation edges arrive only after the boundary freezes the relation energy");
    let scales = batch
        .scales
        .as_ref()
        .expect("a batch with relation edges was assembled with its scale table");
    let scale = batch.eta * options.coefficients.relation * batch.relation_scale;
    let rows = frame.len();

    // One scratch field serves every type; only rows a type touches
    // are read and re-zeroed, so the pass costs the edge lists, not
    // types times batch rows.
    let mut relation_field = GradientField::new(rows);
    let mut scratch = GradientField::new(rows);
    let mut contributions: Vec<(usize, OntologyRowId, Vec2)> = Vec::new();
    let mut touched: Vec<usize> = Vec::new();

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
                .flat_map(|edge| [edge.source.usize(), edge.target.usize()]),
        );
        touched.sort_unstable();
        touched.dedup();

        for &row in &touched {
            let gradient = scratch.as_slice()[row];
            scratch.accumulate(row, -gradient);
            if gradient == Vec2::splat(0.0) {
                continue;
            }
            relation_field.accumulate(row, gradient);
            contributions.push((row, sampled.relation, gradient));
        }
    }

    let mut outcomes: Vec<Option<ClippedRelation>> = vec![None; rows];
    let mut combined = Vec::with_capacity(rows * 2);
    for (row, (&semantic, &relation)) in semantic_field
        .as_slice()
        .iter()
        .zip(relation_field.as_slice())
        .enumerate()
    {
        let applied = if relation == Vec2::splat(0.0) {
            semantic
        } else {
            let outcome = options.budget.clip(semantic, relation);
            metrics.record_node(deciles.decile(batch.rows[row].usize()), &outcome);
            outcomes[row] = Some(outcome);
            semantic + outcome.gradient
        };

        combined.extend([applied.x(), applied.y()]);
    }

    for (row, relation, gradient) in contributions {
        // A row whose per-type contributions cancelled exactly has no
        // budget outcome: no relation force was applied there.
        let Some(outcome) = outcomes[row] else {
            continue;
        };

        let factor = outcome.positive_factor * outcome.total_factor;
        metrics.record_type(
            relation,
            &ClippedRelation {
                gradient: gradient * factor,
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

/// Reads the detached coordinate frame back to the host and checks
/// that every point is finite.
///
/// Returns the raw row-major components; view them through
/// [`Vec2::from_slice`] rather than copying.
fn read_frame<B: Backend<FloatElem = f32>>(
    coordinates: Tensor<B, 2>,
    rows: &[NodeRowId],
) -> Result<Vec<f32>, StepError> {
    let values = coordinates
        .into_data()
        .to_vec::<f32>()
        .expect("the projector's coordinates are an f32 tensor");
    let frame = Vec2::from_slice(&values).expect("a [rows, 2] tensor reads back an even length");
    for (index, point) in frame.iter().enumerate() {
        if !point.is_finite() {
            return Err(StepError::Diverged { row: rows[index] });
        }
    }
    Ok(values)
}

/// Flattens per-node gradients into the tensor's row-major layout.
fn flatten(gradients: &[Vec2]) -> Vec<f32> {
    let mut flat = Vec::with_capacity(gradients.len() * 2);
    for gradient in gradients {
        flat.extend([gradient.x(), gradient.y()]);
    }
    flat
}
