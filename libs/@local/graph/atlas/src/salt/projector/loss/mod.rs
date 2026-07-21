//! The composite training objective over a prepared batch.
//!
//! The objective splits along the budget seam. The budget-governed
//! terms - semantic attraction, ordinary and hard-negative repulsion,
//! and relation attraction - evaluate value and coordinate gradient in
//! one fused pass over their edge lists, with every derivative
//! hand-derived in [`energy`] and certified against finite differences;
//! their gradients accumulate into [`GradientField`]s the budget clips
//! per node before anything reaches shared parameters. The support
//! term rides ordinary autodiff on the coordinate tensor: it is outside
//! the budget, so nothing needs its gradient ahead of the backward
//! pass.
//!
//! Every term takes a premultiplied `scale`: the term's loss
//! coefficient times any estimator normalization (the semantic term's
//! total-weight-over-batch-size factor, the relation term's lens
//! factor). The terms speak the batch-local row domain: pairs, edges,
//! and anchors carry [`BatchRowId`] positions into the coordinate
//! slice they are evaluated against, a key deliberately distinct from
//! the corpus's `NodeRowId` - the assembly that re-indexes corpus
//! draws into a batch owns the conversion, and the two domains cannot
//! be mixed by type.
//!
//! Pairs at exactly zero distance contribute their value but no
//! gradient: a coincident pair has no direction to move along, and
//! every energy here is either at its minimum or plateaued there.

mod energy;
#[cfg(test)]
mod tests;

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};

pub(crate) use self::energy::{AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy};
use crate::{
    dataset::OntologyRowId,
    math::{DVec2, Vec2},
    salt::{projector::scale::LocalScales, relation::attraction::AttractionWeights},
};

/// A batch-local row position.
///
/// Batch assembly re-indexes one step's drawn corpus rows into a
/// dense local domain; this key names positions in that domain and
/// nothing else. It is deliberately distinct from the corpus's
/// `NodeRowId`: a corpus row and its batch-local position are
/// different keys, and confusing them is the wiring defect this type
/// exists to prevent. The `u32` width is a representation bound: a
/// batch indexes one step's participating rows.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BatchRowId(u32);

impl BatchRowId {
    /// Creates a batch-local row key from its position.
    #[inline]
    #[must_use]
    pub(crate) const fn new(position: u32) -> Self {
        Self(position)
    }

    /// Returns the position's numeric value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u32 {
        self.0
    }

    /// Returns the position as a slice index.
    #[inline]
    #[must_use]
    pub(crate) const fn usize(self) -> usize {
        self.0 as usize
    }
}

/// An unordered pair of batch-local rows in canonical order.
///
/// The two positions are stored with [`first`](Self::first) at most
/// [`second`](Self::second), so a pair equals itself however its rows
/// arrive - the batch-domain twin of the corpus's `NodePair`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BatchPair {
    first: BatchRowId,
    second: BatchRowId,
}

impl BatchPair {
    /// Creates the canonical pair of two positions, in either order.
    #[inline]
    #[must_use]
    pub(crate) const fn new(one: BatchRowId, other: BatchRowId) -> Self {
        if one.get() <= other.get() {
            Self {
                first: one,
                second: other,
            }
        } else {
            Self {
                first: other,
                second: one,
            }
        }
    }

    /// Returns the smaller position.
    #[inline]
    #[must_use]
    pub(crate) const fn first(self) -> BatchRowId {
        self.first
    }

    /// Returns the larger position.
    #[inline]
    #[must_use]
    pub(crate) const fn second(self) -> BatchRowId {
        self.second
    }
}

/// One relation type's drawn instances, re-indexed to the batch.
///
/// The batch-domain twin of the sampler's corpus draw, slimmed to what
/// the relation term consumes: endpoints as batch positions,
/// per-instance weight factors as plain values, and the group's shared
/// factors inline rather than borrowed from the attraction index.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct BatchRelationEdges {
    /// The relation type the instances share.
    pub relation: OntologyRowId,
    /// The relation's shared weight factors.
    pub weights: AttractionWeights,
    /// The drawn instances, in group storage order.
    pub edges: Vec<BatchRelationEdge>,
}

/// One relation instance with batch-local endpoints.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BatchRelationEdge {
    /// The instance's source position.
    pub source: BatchRowId,
    /// The instance's target position.
    pub target: BatchRowId,
    /// The effective confidence `c`, in `(0, 1]`; validated where the
    /// corpus edge was scored.
    pub confidence: f32,
    /// The degree normalization `nu`, in `(0, 1]`.
    pub normalization: f32,
}

/// A per-node coordinate gradient accumulator.
///
/// One field accumulates every term on one side of the budget seam;
/// the budget then clips the relation field against the semantic field
/// node by node. Contributions arrive in the working precision and
/// accumulate in double precision; consumers narrow once at the
/// working-precision seam. Reset and reuse the field across steps
/// rather than reallocating.
#[derive(Debug)]
pub(crate) struct GradientField(Box<[DVec2]>);

impl GradientField {
    /// Creates a zeroed field over `rows` nodes.
    #[must_use]
    pub(crate) fn new(rows: usize) -> Self {
        Self(vec![DVec2::ZERO; rows].into_boxed_slice())
    }

    /// Zeroes every entry, keeping the allocation.
    pub(crate) fn reset(&mut self) {
        self.0.fill(DVec2::ZERO);
    }

    /// Adds a gradient contribution to one node.
    #[inline]
    pub(crate) fn accumulate(&mut self, row: usize, gradient: Vec2) {
        self.0[row] += DVec2::from(gradient);
    }

    /// Adds a double-precision contribution moved from another field.
    #[inline]
    pub(crate) fn add(&mut self, row: usize, gradient: DVec2) {
        self.0[row] += gradient;
    }

    /// Reads one node's accumulated gradient, zeroing the entry.
    #[inline]
    #[must_use]
    pub(crate) fn take(&mut self, row: usize) -> DVec2 {
        core::mem::replace(&mut self.0[row], DVec2::ZERO)
    }

    /// Borrows the accumulated per-node gradients.
    #[inline]
    #[must_use]
    pub(crate) fn as_slice(&self) -> &[DVec2] {
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
/// Adds `scale * weight * -ln(q(d^2) + epsilon)` per pair to the
/// returned value and the matching hand-derived gradients to `field`.
/// Weight-proportional sampling emits unit weights; the weight slot
/// exists for capped explicit weights.
///
/// # Panics
///
/// Panics when a pair references a row outside `coordinates` or
/// `field`; pairs and coordinates come from one batch assembly, so a
/// mismatch is a wiring defect.
pub(crate) fn attraction_term(
    coordinates: &[Vec2],
    pairs: impl IntoIterator<Item = (BatchPair, f32)>,
    energy: AffinityEnergy,
    scale: f32,
    field: &mut GradientField,
) -> f32 {
    affinity_term(coordinates, pairs, scale, field, |distance_squared| {
        energy.attraction(distance_squared)
    })
}

/// Evaluates a repulsion term over weighted negative pairs.
///
/// Adds `scale * weight * -ln(1 - q(d^2) + epsilon)` per pair to the
/// returned value and the matching hand-derived gradients to `field`.
/// Ordinary negatives carry unit weights; mined hard negatives carry
/// their bounded rank weights.
///
/// # Panics
///
/// Panics when a pair references a row outside `coordinates` or
/// `field`; pairs and coordinates come from one batch assembly, so a
/// mismatch is a wiring defect.
pub(crate) fn repulsion_term(
    coordinates: &[Vec2],
    pairs: impl IntoIterator<Item = (BatchPair, f32)>,
    energy: AffinityEnergy,
    scale: f32,
    field: &mut GradientField,
) -> f32 {
    affinity_term(coordinates, pairs, scale, field, |distance_squared| {
        energy.repulsion(distance_squared)
    })
}

/// The shared affinity-term loop: value plus chain rule through the
/// squared distance.
fn affinity_term(
    coordinates: &[Vec2],
    pairs: impl IntoIterator<Item = (BatchPair, f32)>,
    scale: f32,
    field: &mut GradientField,
    evaluate: impl Fn(f32) -> (f32, f32),
) -> f32 {
    // Accumulated in double precision, products included.
    let mut total = 0.0_f64;

    for (pair, weight) in pairs {
        let (left, right) = (pair.first().usize(), pair.second().usize());
        let difference = coordinates[left] - coordinates[right];
        let (value, derivative) = evaluate(difference.length_squared());
        let factor = scale * weight;

        total = f64::from(factor).mul_add(f64::from(value), total);

        // d(d^2)/dy_left = 2 * (y_left - y_right); the pair energy's
        // derivative is taken in the squared distance, so no division
        // by the distance appears and coincident pairs need no branch
        // beyond the energy's own zero-derivative contract.
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
/// Per instance the contribution is `scale * confidence *
/// normalization * strength` times the weighted class mixture at
/// the locally normalized distance `z = d / sqrt((rho_i + eps)(rho_j +
/// eps))`. The local scales are detached measurements: the gradient
/// flows through `d` only, so `dz/dd` is a per-pair constant.
///
/// # Panics
///
/// Panics when the scales do not cover the coordinate rows, or when an
/// edge references a row outside them; all three come from one batch
/// assembly, so a mismatch is a wiring defect.
pub(crate) fn relation_term(
    coordinates: &[Vec2],
    scales: &LocalScales,
    batch: &[BatchRelationEdges],
    energy: RelationEnergy,
    scale: f32,
    field: &mut GradientField,
) -> f32 {
    assert_eq!(
        scales.len(),
        coordinates.len(),
        "local scales and coordinates should cover the same rows"
    );

    let epsilon = energy.epsilon();

    // Accumulated in double precision, products included.
    let mut total = 0.0_f64;
    for sampled in batch {
        let weights = sampled.weights;
        for edge in &sampled.edges {
            let (source, target) = (edge.source.usize(), edge.target.usize());
            let difference = coordinates[source] - coordinates[target];
            let distance = difference.length();
            let normalization = scales.normalization(source, target, epsilon);
            let (value, derivative) = energy.mixture(
                distance / normalization,
                weights.coincident,
                weights.proximal,
            );
            let factor = scale * edge.confidence * edge.normalization * weights.strength;

            total = f64::from(factor).mul_add(f64::from(value), total);
            if distance <= 0.0 {
                continue;
            }

            // dz/dy_source = (y_source - y_target) / (d * normalization).
            let gradient = difference * (factor * derivative / (distance * normalization));
            field.accumulate(source, gradient);
            field.accumulate(target, -gradient);
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
/// `row` positions the anchor in the coordinate tensor the term
/// evaluates against; `target` is the prior or skeleton coordinate the
/// node is held to, `radius` the local scale the residual is
/// normalized by, and `weight` the anchor's mass in the sum.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BatchAnchor {
    pub row: BatchRowId,
    pub target: Vec2,
    pub radius: f32,
    pub weight: f32,
}

/// Validated support-term constants.
///
/// `threshold` is the Huber threshold on the normalized residual;
/// `epsilon` both guards the radius division and smooths the distance
/// at coincidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SupportOptions {
    threshold: f32,
    epsilon: f32,
}

impl SupportOptions {
    /// Validates support constants.
    ///
    /// Returns [`None`] unless both are finite and strictly positive.
    #[must_use]
    pub(crate) const fn new(threshold: f32, epsilon: f32) -> Option<Self> {
        let valid =
            threshold.is_finite() && threshold > 0.0 && epsilon.is_finite() && epsilon > 0.0;
        if !valid {
            return None;
        }
        Some(Self { threshold, epsilon })
    }

    /// Returns the Huber threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn threshold(self) -> f32 {
        self.threshold
    }

    /// Returns the radius guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> f32 {
        self.epsilon
    }
}

/// The materialized anchor set of one support term, on one device.
///
/// Anchors and landmarks share this shape: the temporal-anchor term
/// materializes prior coordinates, the landmark term the skeleton
/// layout. A first generation without prior coordinates has no
/// temporal anchors and simply builds no target set.
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
    /// Returns [`None`] when `anchors` is empty or any anchor carries a
    /// non-finite target, a non-finite or negative radius, or a
    /// non-finite or negative weight.
    #[must_use]
    pub(crate) fn new(anchors: &[BatchAnchor], device: &B::Device) -> Option<Self> {
        if anchors.is_empty() {
            return None;
        }
        let valid = anchors.iter().all(|anchor| {
            anchor.target.is_finite()
                && anchor.radius.is_finite()
                && anchor.radius >= 0.0
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
            .map(|anchor| anchor.radius)
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
/// The value is `scale * sum_i weight_i * huber(||y_i - target_i|| /
/// (radius_i + epsilon), threshold)`, differentiable through
/// `coordinates`. The Euclidean distance is smoothed as
/// `sqrt(d^2 + epsilon^2) - epsilon`: exact at zero, within `epsilon`
/// of the true distance everywhere, and with a well-defined zero
/// gradient at coincidence - anchored nodes start exactly on their
/// targets, so the unsmoothed square root would differentiate at its
/// singular point on the very first step.
///
/// Every anchor row must index into `coordinates`; anchors and
/// coordinates come from one batch assembly, so an out-of-range row is
/// a wiring defect the backend's row selection rejects.
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
