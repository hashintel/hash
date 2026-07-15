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
