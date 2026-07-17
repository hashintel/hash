use burn::tensor::{
    Tensor,
    backend::{AutodiffBackend, Backend},
    linalg::l2_norm,
};

use super::{super::GradientBudget, ProjectorTrainingError};

/// Detached per-node diagnostics from one coordinate-gradient budget.
pub(crate) struct CoordinateGradientDiagnostics<B: Backend> {
    pub semantic_norm: Tensor<B, 2>,
    pub semantic_baseline: Tensor<B, 2>,
    pub relation_norm: Tensor<B, 2>,
    pub positive_factor: Tensor<B, 2>,
    pub total_factor: Tensor<B, 2>,
}

pub(super) fn coordinate_surrogate<B: AutodiffBackend>(
    coordinates: Tensor<B, 2>,
    leaf: &Tensor<B, 2>,
    semantic_loss: &Tensor<B, 1>,
    relation_loss: Option<&Tensor<B, 1>>,
    budget: GradientBudget,
) -> Result<(Tensor<B, 1>, CoordinateGradientDiagnostics<B::InnerBackend>), ProjectorTrainingError>
{
    // Compute each objective against the same detached coordinate leaf. Keeping
    // the backward passes separate is what makes the relation budget
    // independent of the semantic objective's scalar weighting and graph size.
    let semantic_gradient = leaf
        .grad(&semantic_loss.backward())
        .ok_or(ProjectorTrainingError::MissingSemanticGradient)?;
    let relation_gradient = if let Some(relation_loss) = relation_loss {
        leaf.grad(&relation_loss.backward())
            .ok_or(ProjectorTrainingError::MissingRelationGradient)?
    } else {
        semantic_gradient.clone() * 0.0
    };
    let (combined, diagnostics) = clip_gradients(semantic_gradient, relation_gradient, budget);
    // `combined` belongs to the inner backend, so converting it back creates a
    // constant coefficient. The model sees the requested coordinate gradient
    // but cannot differentiate through the clipping factors themselves.
    let coefficient = Tensor::<B, 2>::from_inner(combined);
    Ok(((coefficient * coordinates).sum(), diagnostics))
}

fn clip_gradients<B: Backend>(
    semantic: Tensor<B, 2>,
    relation: Tensor<B, 2>,
    budget: GradientBudget,
) -> (Tensor<B, 2>, CoordinateGradientDiagnostics<B>) {
    let parameters = budget.parameters();
    let semantic_norm = l2_norm(semantic.clone(), 1);
    let relation_norm = l2_norm(relation.clone(), 1);
    let baseline = semantic_norm.clone().clamp_min(parameters.semantic_floor);
    // First cap raw relation pressure relative to the semantic baseline.
    let positive_factor = (baseline.clone() * parameters.positive
        / (relation_norm.clone() + parameters.epsilon))
        .clamp_max(1.0);
    let positive = relation * positive_factor.clone();
    let positive_norm = l2_norm(positive.clone(), 1);
    // The second cap applies after the first and constrains the relation term
    // that is finally added to the untouched semantic gradient.
    let total_factor =
        (baseline.clone() * parameters.total / (positive_norm + parameters.epsilon)).clamp_max(1.0);
    let combined = semantic + positive * total_factor.clone();
    (
        combined,
        CoordinateGradientDiagnostics {
            semantic_norm,
            semantic_baseline: baseline,
            relation_norm,
            positive_factor,
            total_factor,
        },
    )
}
