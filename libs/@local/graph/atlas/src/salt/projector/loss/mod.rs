//! The composite training objective over a prepared batch.
//!
//! The objective splits along the hand-gradient seam. The hand-gradient terms - semantic
//! attraction, ordinary and hard-negative repulsion, and relation attraction - evaluate value and
//! coordinate gradient in one fused pass over their edge lists, with every derivative hand-derived
//! in [`energy`] and certified against finite differences; their gradients accumulate into
//! [`GradientField`]s the budget measures per node before the combined field reaches shared
//! parameters. The support term rides ordinary autodiff on the coordinate tensor, so nothing needs
//! its gradient ahead of the backward pass.
//!
//! Every term takes a premultiplied `scale`: the term's loss coefficient times any estimator
//! normalization (the semantic term's total-weight-over-batch-size factor, the relation term's lens
//! factor). The terms speak the batch-local row domain: pairs, edges, and anchors carry
//! [`BatchRowId`] positions into the coordinate slice each term evaluates. That key is distinct
//! from the corpus's [`NodeRowId`](crate::identity::NodeRowId) by design. The assembly that
//! re-indexes corpus draws into a batch owns the conversion, and the type system keeps the two
//! domains apart.
//!
//! Pairs at exactly zero distance contribute their value but no gradient: a coincident pair has no
//! direction to move along. Coincidence is the attraction and relation energies' minimum and the
//! repulsion energy's maximum - a stationary point whose coordinate gradient vanishes as `d^(2b -
//! 1)` under the curve's `b ≥ 1/2` construction bound, so the zero is the continuous limit and any
//! separation restores the outward push.

mod contrast;
mod energy;
mod objective;
mod penalty;
#[cfg(test)]
mod tests;

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use hashql_core::id::{Id, IdSlice, IdVec};

pub(crate) use self::{
    contrast::ContrastEnergy,
    energy::{AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy},
    objective::{
        CappedDrawLaw, TargetEstimator, TargetUnit, UnitLaw, fan_scale_pull, released_weight,
    },
    penalty::Penalty,
};
use crate::{
    identity::OntologyRowId,
    math::{
        DVec2, FinitePointField, NonNegative, Positive, PositiveUnitFraction, UnitFraction, Vec2,
    },
    salt::{
        projector::scale::ScaledFrame,
        relation::{attraction::AttractionWeights, protection::NodePair},
    },
};

hashql_core::id::newtype! {
    /// A batch-local row position.
    ///
    /// Batch assembly re-indexes one step's drawn corpus rows into a dense local domain. This key names positions in that domain and nothing else. It is distinct by design from the corpus's `NodeRowId`: a corpus row and its batch-local position are different keys, and confusing them is the wiring defect this type exists to prevent. The `u32` width is a representation bound because a batch indexes one step's participating rows.
    pub(crate) struct BatchRowId(u32)
}

/// One relation type's drawn instances, re-indexed to the batch.
///
/// The batch-domain twin of the sampler's corpus draw, slimmed to what the relation term consumes:
/// endpoints as batch positions, per-instance weight factors in their validated domains, and the
/// group's shared factors inline rather than borrowed from the attraction index.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RelationEdges<N> {
    /// The relation type the instances share.
    pub relation: OntologyRowId,
    /// The relation's shared weight factors.
    pub weights: AttractionWeights,
    /// The drawn instances, in group storage order.
    pub edges: Vec<RelationEdge<N>>,
}

/// One relation instance with batch-local endpoints.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationEdge<N> {
    /// The instance's source position.
    pub source: N,
    /// The instance's target position.
    pub target: N,
    /// The effective confidence `c`.
    ///
    /// Zero is admissible: a scored-zero instance survives a zero pruning threshold and folds
    /// in as zero force.
    pub confidence: UnitFraction,
    /// The degree normalization `ν`.
    pub normalization: PositiveUnitFraction,
}

/// A per-node coordinate gradient accumulator.
///
/// One field accumulates every term on one side of the budget boundary; the budget then clips the
/// relation field against the semantic field node by node. Contributions arrive in either
/// precision and accumulate in double precision; consumers narrow once where a total leaves the
/// field for the working precision. Reset and reuse the field across steps rather than
/// reallocating.
#[derive(Debug)]
pub(crate) struct GradientField<N>(Box<IdSlice<N, DVec2>>);

impl<N> GradientField<N>
where
    N: Id,
{
    /// Creates a zeroed field over `rows` nodes.
    #[must_use]
    pub(crate) fn new(rows: usize) -> Self {
        Self(IdVec::from_elem(DVec2::ZERO, rows).into_boxed_slice())
    }

    /// Zeroes every entry, keeping the allocation.
    pub(crate) fn reset(&mut self) {
        self.0.fill(DVec2::ZERO);
    }

    /// Adds a gradient contribution to one node.
    #[inline]
    pub(crate) fn accumulate(&mut self, row: N, gradient: Vec2) {
        self.0[row] += DVec2::from(gradient);
    }

    /// Adds a double-precision contribution moved from another field.
    #[inline]
    pub(crate) fn add(&mut self, row: N, gradient: DVec2) {
        self.0[row] += gradient;
    }

    /// Reads one node's accumulated gradient, zeroing the entry.
    #[inline]
    #[must_use]
    pub(crate) fn take(&mut self, row: N) -> DVec2 {
        core::mem::replace(&mut self.0[row], DVec2::ZERO)
    }

    /// Borrows the accumulated per-node gradients.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &IdSlice<N, DVec2> {
        &self.0
    }

    /// Returns the node count the field covers.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.len()
    }
}

/// Evaluates the semantic attraction term over weighted positive pairs.
///
/// Adds `scale · weight · -ln(q(d^2) + ε)` per pair to the returned value and the matching
/// hand-derived gradients to `field`. Weight-proportional sampling emits unit weights; the weight
/// slot exists for capped explicit weights.
///
/// # Panics
///
/// This panics when a pair references a row outside `coordinates` or `field`. Pairs and coordinates
/// come from one batch assembly, so a mismatch is a wiring defect.
pub(crate) fn attraction_term<N>(
    coordinates: &FinitePointField<N>,
    pairs: impl IntoIterator<Item = (NodePair<N>, f32)>,
    energy: AffinityEnergy,
    scale: f32,
    field: &mut GradientField<N>,
) -> f32
where
    N: Id,
{
    affinity_term(coordinates, pairs, scale, field, |distance_squared| {
        energy.attraction(distance_squared)
    })
}

/// Evaluates a repulsion term over weighted negative pairs.
///
/// Adds `scale · weight · -ln(1 - q(d^2) + ε)` per pair to the returned value and the matching
/// hand-derived gradients to `field`. Ordinary negatives carry unit weights; mined hard negatives
/// carry their bounded rank weights.
///
/// # Panics
///
/// This panics when a pair references a row outside `coordinates` or `field`. Pairs and coordinates
/// come from one batch assembly, so a mismatch is a wiring defect.
pub(crate) fn repulsion_term<N>(
    coordinates: &FinitePointField<N>,
    pairs: impl IntoIterator<Item = (NodePair<N>, f32)>,
    energy: AffinityEnergy,
    scale: f32,
    field: &mut GradientField<N>,
) -> f32
where
    N: Id,
{
    affinity_term(coordinates, pairs, scale, field, |distance_squared| {
        energy.repulsion(distance_squared)
    })
}

/// Evaluates the shared affinity-term loop: value plus chain rule through the squared distance.
fn affinity_term<N>(
    coordinates: &FinitePointField<N>,
    pairs: impl IntoIterator<Item = (NodePair<N>, f32)>,
    scale: f32,
    field: &mut GradientField<N>,
    evaluate: impl Fn(NonNegative) -> (f32, f32),
) -> f32
where
    N: Id,
{
    // Accumulated in double precision, products included.
    let mut total = 0.0_f64;

    for (pair, weight) in pairs {
        let (left, right) = (pair.lhs(), pair.rhs());

        let difference = coordinates[left] - coordinates[right];
        let (value, derivative) = evaluate(difference.length_squared());
        let factor = scale * weight;

        total = f64::from(factor).mul_add(f64::from(value), total);

        // d(d^2)/dy_left = 2 · (y_left - y_right). The pair energy supplies its derivative in the
        // squared distance, so no division by the distance occurs and coincident pairs need no
        // branch beyond the energy's own zero-derivative contract.
        let gradient = difference * (2.0 * factor * derivative);
        field.accumulate(left, gradient);
        field.accumulate(right, -gradient);
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the double-precision batch sum is the term's contract"
    )]
    let total = total as f32;
    total
}

/// Evaluates the relation attraction term over a sampled batch.
///
/// Per instance the contribution is `scale · confidence · normalization · strength` times the
/// weighted class mixture at the locally normalized distance `z = d / √((ρ_i + ε)(ρ_j + ε))`. The
/// local scales enter as detached measurements. The gradient flows through `d` only, so `dz/dd` is
/// a per-pair constant.
///
/// # Panics
///
/// This panics when an edge references a row outside the frame. The batch and the frame come
/// from one assembly, so a mismatch is a wiring defect.
pub(crate) fn relation_term<N>(
    frame: ScaledFrame<'_, N>,
    batch: &[RelationEdges<N>],
    energy: RelationEnergy,
    scale: f32,
    field: &mut GradientField<N>,
) -> f32
where
    N: Id,
{
    let (coordinates, scales) = (frame.coordinates(), frame.scales());
    let epsilon = energy.epsilon();

    // Accumulated in double precision, products included.
    let mut total = 0.0_f64;
    for sampled in batch {
        let weights = sampled.weights;
        for edge in &sampled.edges {
            let (source, target) = (edge.source, edge.target);
            let difference = coordinates[source] - coordinates[target];

            let distance = difference.length();
            let normalization = scales.normalization(source, target, epsilon);
            // A non-negative distance over a positive normalization is never NaN and never
            // negative, and a quotient past the working range saturates where the class
            // energies saturate anyway.
            let normalized = distance.saturating_div(normalization);
            let (value, derivative) =
                energy.mixture(normalized, weights.coincident, weights.proximal);
            let factor = f64::from(scale)
                * ((edge.confidence * edge.normalization) * f64::from(weights.strength));

            total = factor.mul_add(value.into_raw(), total);
            if distance.is_zero() {
                continue;
            }

            // dz/dy_source = (y_source - y_target) / (d · normalization).
            let gradient = DVec2::from(difference)
                * (factor * derivative.into_raw()
                    / (f64::from(distance) * f64::from(normalization)));
            field.add(source, gradient);
            field.add(target, -gradient);
        }
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the double-precision batch sum is the term's contract"
    )]
    let total = total as f32;
    total
}

/// One anchored node for the support term, in the batch-local domain.
///
/// `row` positions the anchor in the coordinate tensor the term evaluates against. `target` is the
/// prior or skeleton coordinate the node anchors to, `radius` the local scale that normalizes the
/// residual, and `weight` the anchor's mass in the sum.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BatchAnchor {
    pub row: BatchRowId,
    pub target: Vec2,
    pub radius: NonNegative,
    pub weight: f32,
}

/// Validated support-term constants.
///
/// `threshold` is the Huber threshold on the normalized residual; `epsilon` both guards the radius
/// division and smooths the distance at coincidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SupportOptions {
    threshold: Positive,
    epsilon: Positive,
}

impl SupportOptions {
    /// Creates support constants.
    ///
    /// Both values carry their domain in the type, so construction validates nothing.
    #[must_use]
    pub(crate) const fn new(threshold: Positive, epsilon: Positive) -> Self {
        Self { threshold, epsilon }
    }

    /// Returns the Huber threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn threshold(self) -> Positive {
        self.threshold
    }

    /// Returns the radius guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> Positive {
        self.epsilon
    }
}

/// The materialized anchor set of one support term, on one device.
///
/// Anchors and landmarks share this shape: the temporal-anchor term materializes prior coordinates,
/// the landmark term the skeleton layout. A first generation without prior coordinates has no
/// temporal anchors and builds no target set.
#[derive(Debug)]
pub(crate) struct SupportTargets<B: Backend> {
    rows: Tensor<B, 1, Int>,
    targets: Tensor<B, 2>,
    radii: Tensor<B, 2>,
    weights: Tensor<B, 2>,
}

impl<B: Backend> SupportTargets<B> {
    /// Materializes an anchor set.
    ///
    /// Returns [`None`] when `anchors` is empty or any anchor carries a non-finite target, an
    /// escaped radius, or a non-finite or negative weight.
    #[must_use]
    pub(crate) fn new(anchors: &[BatchAnchor], device: &B::Device) -> Option<Self> {
        if anchors.is_empty() {
            return None;
        }
        let valid = anchors.iter().all(|anchor| {
            anchor.target.is_finite()
                && anchor.radius.is_finite()
                && anchor.weight.is_finite()
                && anchor.weight >= 0.0
        });
        if !valid {
            return None;
        }

        let count = anchors.len();
        let rows = anchors
            .iter()
            .map(|anchor| i64::from(anchor.row.get()))
            .collect::<Vec<_>>();
        let targets = anchors
            .iter()
            .flat_map(|anchor| [anchor.target.x(), anchor.target.y()])
            .collect::<Vec<_>>();
        let radii = anchors
            .iter()
            .map(|anchor| anchor.radius.get())
            .collect::<Vec<_>>();
        let weights = anchors
            .iter()
            .map(|anchor| anchor.weight)
            .collect::<Vec<_>>();
        Some(Self {
            rows: Tensor::from_data(TensorData::new(rows, [count]), device),
            targets: Tensor::from_data(TensorData::new(targets, [count, 2]), device),
            radii: Tensor::from_data(TensorData::new(radii, [count, 1]), device),
            weights: Tensor::from_data(TensorData::new(weights, [count, 1]), device),
        })
    }
}

/// Evaluates a support term against anchored coordinates.
///
/// The value is `scale · Σ_i weight_i · huber(‖y_i - target_i‖ / (radius_i + ε), threshold)`,
/// differentiable through `coordinates`.
///
/// Smoothing replaces the Euclidean distance with `√(d^2 + ε^2) - ε`. The smoothed form is exact at
/// zero and stays within `ε` of the true distance everywhere. Its gradient is well defined and zero
/// at coincidence. Anchored nodes start exactly on their targets, so the unsmoothed square root
/// would differentiate at its singular point on the first step.
///
/// Every anchor row must index into `coordinates`; anchors and coordinates come from one batch
/// assembly, so an out-of-range row is a wiring defect the backend's row selection rejects.
pub(crate) fn support_term<B: Backend>(
    coordinates: &Tensor<B, 2>,
    targets: &SupportTargets<B>,
    options: SupportOptions,
    scale: f32,
) -> Tensor<B, 1> {
    let epsilon = f64::from(options.epsilon);
    let threshold = f64::from(options.threshold);
    let selected = coordinates.clone().select(0, targets.rows.clone());
    let squared = (selected - targets.targets.clone())
        .powi_scalar(2)
        .sum_dim(1);
    let distance = (squared + epsilon * epsilon).sqrt() - epsilon;
    let normalized = distance / (targets.radii.clone() + epsilon);
    let clipped = normalized.clone().clamp_max(threshold);
    let huber = clipped.clone().powi_scalar(2) * 0.5 + (normalized - clipped) * threshold;

    (targets.weights.clone() * huber).sum() * f64::from(scale)
}
