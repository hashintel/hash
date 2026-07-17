use burn::tensor::{Int, Tensor, backend::AutodiffBackend};

use super::super::ProjectorInput;

/// Batch-local endpoint pairs and scalar objective weights.
#[derive(Clone)]
pub(crate) struct WeightedEdges<B: AutodiffBackend> {
    pub left: Tensor<B, 1, Int>,
    pub right: Tensor<B, 1, Int>,
    pub weight: Tensor<B, 2>,
}

/// Batch-local relation endpoints and frozen factorized coefficients.
#[derive(Clone)]
pub(crate) struct RelationEdges<B: AutodiffBackend> {
    pub left: Tensor<B, 1, Int>,
    pub right: Tensor<B, 1, Int>,
    /// `c * ν * stopgrad(h)`, with each factor applied exactly once.
    pub weight: Tensor<B, 2>,
    /// `κ_C * p*_C`.
    pub coincident: Tensor<B, 2>,
    /// `κ_P * p*_P`.
    pub proximal: Tensor<B, 2>,
    /// Detached semantic radius `ρ_i`.
    pub left_scale: Tensor<B, 2>,
    /// Detached semantic radius `ρ_j`.
    pub right_scale: Tensor<B, 2>,
}

/// Robust coordinate support for prior anchors or fitted landmarks.
#[derive(Clone)]
pub(crate) struct CoordinateSupport<B: AutodiffBackend> {
    pub rows: Tensor<B, 1, Int>,
    pub target: Tensor<B, 2>,
    pub radius: Tensor<B, 2>,
    pub weight: Tensor<B, 2>,
}

/// One model batch with independently sampled objective families.
pub(crate) struct ProjectorTrainingBatch<B: AutodiffBackend> {
    pub input: ProjectorInput<B>,
    pub semantic_positive: Option<WeightedEdges<B>>,
    pub ordinary_negative: Option<WeightedEdges<B>>,
    pub hard_negative: Option<WeightedEdges<B>>,
    pub relation: Option<RelationEdges<B>>,
    pub anchors: Option<CoordinateSupport<B>>,
    pub landmarks: Option<CoordinateSupport<B>>,
    /// Global relation-lens multiplier associated with `input.condition`.
    pub relation_condition: f64,
}
