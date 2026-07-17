use burn::tensor::{Tensor, backend::AutodiffBackend};

use super::{
    batch::{CoordinateSupport, RelationEdges, WeightedEdges},
    config::ProjectorLossConfig,
};

pub(super) fn semantic_loss<B: AutodiffBackend>(
    coordinates: &Tensor<B, 2>,
    positive: Option<&WeightedEdges<B>>,
    ordinary_negative: Option<&WeightedEdges<B>>,
    hard_negative: Option<&WeightedEdges<B>>,
    config: ProjectorLossConfig,
) -> Option<Tensor<B, 1>> {
    let mut loss = None;
    if let Some(edges) = positive
        && config.weights.semantic_positive != 0.0
    {
        append(
            &mut loss,
            semantic_edge_loss(coordinates, edges, config, true) * config.weights.semantic_positive,
        );
    }
    if let Some(edges) = ordinary_negative
        && config.weights.ordinary_negative != 0.0
    {
        append(
            &mut loss,
            semantic_edge_loss(coordinates, edges, config, false)
                * config.weights.ordinary_negative,
        );
    }
    if let Some(edges) = hard_negative
        && config.weights.hard_negative != 0.0
    {
        append(
            &mut loss,
            semantic_edge_loss(coordinates, edges, config, false) * config.weights.hard_negative,
        );
    }
    loss
}

fn semantic_edge_loss<B: AutodiffBackend>(
    coordinates: &Tensor<B, 2>,
    edges: &WeightedEdges<B>,
    config: ProjectorLossConfig,
    positive: bool,
) -> Tensor<B, 1> {
    let parameters = config.semantic.parameters();
    let difference = coordinates.clone().select(0, edges.left.clone())
        - coordinates.clone().select(0, edges.right.clone());
    let squared_distance = difference.powi_scalar(2).sum_dim(1);
    let smoothing = parameters.epsilon * parameters.epsilon;
    let distance_power = ((squared_distance + smoothing).powf_scalar(parameters.b)
        - smoothing.powf(parameters.b))
    .clamp_min(0.0);
    let affinity = (distance_power * parameters.a + 1.0).recip();
    let maximum_weight = if positive {
        parameters.maximum_positive_weight
    } else {
        parameters.maximum_negative_weight
    };
    let weight = edges.weight.clone().clamp_max(maximum_weight);
    let probability = if positive {
        affinity
    } else {
        affinity * -1.0 + 1.0
    };
    (weight * (probability + parameters.epsilon).log()).sum() * -1.0
}

pub(super) fn relation_loss<B: AutodiffBackend>(
    coordinates: &Tensor<B, 2>,
    edges: &RelationEdges<B>,
    config: ProjectorLossConfig,
    condition: f64,
) -> Tensor<B, 1> {
    let parameters = config.relation.parameters();
    let difference = coordinates.clone().select(0, edges.left.clone())
        - coordinates.clone().select(0, edges.right.clone());
    let distance = stable_distance(difference.powi_scalar(2).sum_dim(1), parameters.epsilon);
    let local_scale = (edges.left_scale.clone() + parameters.epsilon).sqrt()
        * (edges.right_scale.clone() + parameters.epsilon).sqrt();
    let normalized = distance / local_scale;

    let excess = (normalized.clone() - parameters.coincident_radius).clamp_min(0.0);
    let clipped = excess.clone().clamp_max(parameters.coincident_huber_delta);
    let coincident = clipped.clone().powi_scalar(2) * 0.5
        + (excess - clipped) * parameters.coincident_huber_delta;

    let proximal_argument =
        (normalized - parameters.proximal_radius) / parameters.proximal_temperature;
    let proximal = (proximal_argument.clone().clamp_min(0.0)
        + (proximal_argument.abs() * -1.0).exp().log1p())
        * parameters.proximal_temperature;
    let mixture = edges.coincident.clone() * coincident + edges.proximal.clone() * proximal;
    (edges.weight.clone() * mixture).sum() * (config.weights.relation * condition)
}

pub(super) fn support_loss<B: AutodiffBackend>(
    coordinates: &Tensor<B, 2>,
    support: &CoordinateSupport<B>,
    config: ProjectorLossConfig,
    weight: f64,
) -> Tensor<B, 1> {
    let selected = coordinates.clone().select(0, support.rows.clone());
    let difference = selected - support.target.clone();
    let distance = stable_distance(difference.powi_scalar(2).sum_dim(1), config.support.epsilon);
    let normalized = distance / (support.radius.clone().clamp_min(0.0) + config.support.epsilon);
    let clipped = normalized.clone().clamp_max(config.support.huber_delta);
    let huber =
        clipped.clone().powi_scalar(2) * 0.5 + (normalized - clipped) * config.support.huber_delta;
    (support.weight.clone().clamp_min(0.0) * huber).sum() * weight
}

#[inline]
fn append<B: AutodiffBackend>(accumulator: &mut Option<Tensor<B, 1>>, value: Tensor<B, 1>) {
    *accumulator = Some(match accumulator.take() {
        Some(current) => current + value,
        None => value,
    });
}

#[inline]
fn stable_distance<B: AutodiffBackend>(
    squared_distance: Tensor<B, 2>,
    epsilon: f64,
) -> Tensor<B, 2> {
    ((squared_distance + epsilon * epsilon).sqrt() - epsilon).clamp_min(0.0)
}
