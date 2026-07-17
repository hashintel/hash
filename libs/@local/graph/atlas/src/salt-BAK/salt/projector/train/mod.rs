//! Coordinate-budgeted training for the conditioned projector.
//!
//! Training combines semantic neighborhood preservation, relation attraction,
//! sampled repulsion, and coordinate support without allowing any one relation
//! channel to dominate a node merely because that node has high degree.
//! Sampling, objective construction, gradient budgeting, optimization, and
//! checkpoint publication are separate modules so each contract can be tested
//! independently.
//!
//! # Semantic objective
//!
//! For a projected distance `d`, [`SemanticAffinity`] defines
//!
//! ```text
//! q(d) = 1 / (1 + a * max(0, (d^2 + epsilon^2)^b - epsilon^(2b)))
//! ```
//!
//! Positive fuzzy edges contribute `-w log(q + epsilon)`. Ordinary and hard
//! negatives contribute `-w log(1 - q + epsilon)`. Each family has its own
//! scalar weight and maximum per-edge weight. At least one semantic family
//! must remain active because semantic gradients establish the local scale
//! against which relation updates are budgeted.
//!
//! # Relation objective
//!
//! Relation distance is normalized by the geometric mean of the endpoints'
//! frozen local semantic scales:
//!
//! ```text
//! d_normalized = d / sqrt((scale_i + epsilon) * (scale_j + epsilon))
//! ```
//!
//! Coincident mass pays a Huber penalty only outside its coincidence radius.
//! Proximal mass pays a temperature-smoothed softplus penalty around its
//! proximal radius. Overlay mass has no attractive term. The complete
//! relation loss is multiplied by the global condition `eta`, so `eta = 0`
//! removes relation attraction while leaving architecture, sampling, and
//! semantic evidence unchanged.
//!
//! # Coordinate-gradient budget
//!
//! Semantic and relation losses are first differentiated with respect to a
//! detached coordinate leaf. For each node, let `g_s` and `g_r` be those
//! two-dimensional gradients and let
//!
//! ```text
//! baseline = max(norm(g_s), semantic_floor)
//! alpha = min(1, positive_budget * baseline / (norm(g_r) + epsilon))
//! beta  = min(1, total_budget * baseline / (norm(alpha * g_r) + epsilon))
//! g     = g_s + beta * alpha * g_r
//! ```
//!
//! The scalar surrogate `sum_i dot(g_i, y_i)` has exactly `g_i` as its
//! coordinate gradient, so backpropagating it updates the shared projector
//! without differentiating through the clipping decision. Anchor and landmark
//! support losses use the model coordinates directly and therefore remain
//! outside the relation budget.
//!
//! # Sampling and hard negatives
//!
//! A prepared batch contains the induced node set for sampled semantic edges,
//! admitted relation instances, ordinary negatives, mined spatial hard
//! negatives, and optional support rows. Ordinary negatives respect semantic
//! and relation protection exclusions. Hard negatives are rebuilt from the
//! current detached coordinate field, then filtered by the same exclusions
//! before entering the batch.
//!
//! # Optimization and reproducibility
//!
//! [`fit_conditioned_projector_adaptive`] initializes all model parameters from
//! a local seeded generator, asks the batch factory for exactly one batch per
//! step, and runs Adam with a cosine learning-rate schedule. The checkpoint
//! identity binds architecture, every loss coefficient, optimizer schedule,
//! seed, and batch-factory evidence identity. Training metrics report wall
//! time and both clipping stages; they are diagnostics rather than inputs to
//! model identity.
//!
//! [`SemanticAffinity`]: crate::salt::projector::SemanticAffinity
//! [`fit_conditioned_projector_adaptive`]: self::fit_conditioned_projector_adaptive

mod artifact;
mod assemble;
mod batch;
mod budget;
mod config;
mod error;
mod r#loop;
mod loss;
mod miner;
mod plan;
mod sample;

use burn::tensor::{Tensor, backend::AutodiffBackend};

pub(crate) use self::{
    artifact::{
        ProjectorCheckpointError, PublishedProjectorCheckpoint, load_projector_checkpoint,
        load_projector_checkpoint_bytes, publish_projector_checkpoint,
    },
    assemble::{
        CoordinateSupportRow, PreparedProjectorBatch, ProjectorBatchError, ProjectorBatchSource,
        TypeContextDropout, prepare_projector_batch,
    },
    batch::{CoordinateSupport, ProjectorTrainingBatch, RelationEdges, WeightedEdges},
    budget::CoordinateGradientDiagnostics,
    config::{LossWeights, ProjectorLossConfig, ProjectorOptimizerConfig, SupportEnergy},
    error::{HardNegativeError, ProjectorFitError, ProjectorSamplingError, ProjectorTrainingError},
    r#loop::{
        FittedConditionedProjector, ProjectorTrainingMetrics, fit_conditioned_projector,
        fit_conditioned_projector_adaptive,
    },
    miner::{
        HardNegativeConfig, HardNegativeMiner, SpatialNeighbor, SpatialNeighborIndex,
        USearchSpatialIndex,
    },
    plan::{
        AdaptiveProjectorBatchFactory, AdaptiveProjectorSource, ProjectorBatchFactory,
        ProjectorBatchPlanConfig,
    },
    sample::{OrdinaryNegativeSampler, RelationEdgeSampler, SampledEdge, sample_semantic_edges},
};
use self::{
    budget::coordinate_surrogate,
    loss::{relation_loss, semantic_loss, support_loss},
};
use super::ConditionedProjector;

/// Surrogate scalar whose model gradient is the budgeted coordinate update.
pub(crate) struct ProjectorTrainingStep<B: AutodiffBackend> {
    pub surrogate: Tensor<B, 1>,
    pub diagnostics: CoordinateGradientDiagnostics<B::InnerBackend>,
}

/// Computes one exact coordinate-budgeted projector training step.
///
/// Semantic and relation objectives are differentiated independently against
/// a detached coordinate leaf. The resulting per-node gradients are clipped
/// before a surrogate dot product propagates their sum through the shared
/// projector. Anchor and landmark support remain outside the relation budget.
///
/// # Errors
///
/// This returns an error for invalid model input, a negative or non-finite
/// relation condition, a batch without active semantic evidence, or a missing
/// coordinate gradient.
pub(crate) fn training_step<B: AutodiffBackend>(
    model: &ConditionedProjector<B>,
    batch: ProjectorTrainingBatch<B>,
    config: ProjectorLossConfig,
) -> Result<ProjectorTrainingStep<B>, ProjectorTrainingError> {
    if !batch.relation_condition.is_finite() || batch.relation_condition.is_sign_negative() {
        return Err(ProjectorTrainingError::InvalidRelationCondition {
            value: batch.relation_condition,
        });
    }
    let coordinates = model.forward(batch.input)?;
    if coordinates.dims()[0] == 0 {
        return Err(ProjectorTrainingError::EmptyTrainingBatch);
    }
    let leaf = coordinates.clone().detach().require_grad();
    let semantic = semantic_loss(
        &leaf,
        batch.semantic_positive.as_ref(),
        batch.ordinary_negative.as_ref(),
        batch.hard_negative.as_ref(),
        config,
    )
    .ok_or(ProjectorTrainingError::NoSemanticLoss)?;
    let relation = batch.relation.as_ref().and_then(|edges| {
        (config.weights.relation != 0.0 && batch.relation_condition != 0.0)
            .then(|| relation_loss(&leaf, edges, config, batch.relation_condition))
    });
    let (mut surrogate, diagnostics) = coordinate_surrogate(
        coordinates.clone(),
        &leaf,
        &semantic,
        relation.as_ref(),
        config.budget,
    )?;
    if let Some(anchors) = &batch.anchors
        && config.weights.anchor != 0.0
    {
        surrogate = surrogate + support_loss(&coordinates, anchors, config, config.weights.anchor);
    }
    if let Some(landmarks) = &batch.landmarks
        && config.weights.landmark != 0.0
    {
        surrogate =
            surrogate + support_loss(&coordinates, landmarks, config, config.weights.landmark);
    }
    Ok(ProjectorTrainingStep {
        surrogate,
        diagnostics,
    })
}
