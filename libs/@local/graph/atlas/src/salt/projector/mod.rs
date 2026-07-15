//! Relation-conditioned parametric projection.
//!
//! The projector maps a normalized 512-component representation, optional
//! closed-type context, and learned entity-role embedding to two coordinates.
//! A single global relation condition modulates every residual block through
//! FiLM. Relation classifier outputs remain in the loss and never become model
//! conditions.

mod error;
mod infer;
mod model;
mod objective;
mod scale;
mod train;

#[allow(
    unused_imports,
    reason = "projector training and publication types form the generation adapter surface"
)]
pub(crate) use self::{
    error::{ObjectiveError, ProjectorError},
    infer::{ProjectorInferenceError, ProjectorTypeContext, project_generation},
    model::{
        ConditionedProjector, EntityRole, PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig,
        ProjectorInput,
    },
    objective::{ClippedGradient, GradientBudget, RelationEnergy, SemanticAffinity},
    scale::{LocalScales, local_scales},
    train::{
        AdaptiveProjectorBatchFactory, AdaptiveProjectorSource, CoordinateGradientDiagnostics,
        CoordinateSupport, CoordinateSupportRow, FittedConditionedProjector, HardNegativeConfig,
        HardNegativeError, HardNegativeMiner, LossWeights, OrdinaryNegativeSampler,
        PreparedProjectorBatch, ProjectorBatchError, ProjectorBatchFactory,
        ProjectorBatchPlanConfig, ProjectorBatchSource, ProjectorCheckpointError,
        ProjectorFitError, ProjectorLossConfig, ProjectorOptimizerConfig, ProjectorSamplingError,
        ProjectorTrainingBatch, ProjectorTrainingError, ProjectorTrainingMetrics,
        ProjectorTrainingStep, PublishedProjectorCheckpoint, RelationEdges, SampledEdge,
        SpatialNeighbor, SpatialNeighborIndex, SupportEnergy, TypeContextDropout,
        USearchSpatialIndex, WeightedEdges, fit_conditioned_projector,
        fit_conditioned_projector_adaptive, load_projector_checkpoint,
        load_projector_checkpoint_bytes, prepare_projector_batch, publish_projector_checkpoint,
        sample_semantic_edges, training_step,
    },
};

#[cfg(test)]
mod adaptive_tests;
#[cfg(test)]
mod artifact_tests;
#[cfg(test)]
mod tests;
