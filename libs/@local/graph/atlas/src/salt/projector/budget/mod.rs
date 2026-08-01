//! Per-node relation-gradient diagnostics in coordinate space.
//!
//! The budget observes and never steers: relation gradients reach the shared model parameters
//! whole, and every relation-active node records how much the relation objective pushed it relative
//! to its semantic layout. The measurement is pure 2D vector algebra over detached values:
//!
//! ```text
//! baseline = max(‖semantic‖, floor)
//! ratio    = ‖relation‖ / baseline
//! ```
//!
//! The floor keeps the baseline positive where the semantic gradient vanishes, so the recorded
//! ratios stay finite and comparable across runs.
//!
//! The relation gradients re-enter the parameter graph through [`surrogate`]: one backward pass
//! through the returned scalar deposits exactly the requested per-node coordinate gradient.

#[cfg(test)]
mod tests;

use burn::tensor::{Tensor, backend::AutodiffBackend};

use crate::math::{Positive, Vec2};

/// The relation-gradient diagnostics' baseline convention.
///
/// Every outcome measures the relation gradient against `max(‖semantic‖, floor)`. The floor matches
/// the typical per-draw semantic gradient rather than ε: in a sampled batch most nodes' semantic
/// pairs are not co-drawn, and their baselines would otherwise vanish.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Budget {
    /// The semantic-baseline floor.
    pub floor: Positive,
}

impl Budget {
    /// Measures one node's relation gradient against its semantic baseline.
    ///
    /// Both inputs are coordinate-space gradients of the same node: `semantic` from the
    /// semantic-side terms, already scaled by their loss coefficients, and `relation` from the
    /// relation term likewise. The outcome is pure measurement over detached values.
    #[must_use]
    pub(crate) fn measure(self, semantic: Vec2, relation: Vec2) -> BudgetOutcome {
        let semantic_norm = semantic.length();
        BudgetOutcome {
            baseline: semantic_norm.max(self.floor.get()),
            semantic_norm,
            relation_norm: relation.length(),
        }
    }
}

/// One node's measured outcome.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BudgetOutcome {
    /// The semantic baseline `max(‖semantic‖, floor)`.
    pub baseline: f32,
    /// The semantic gradient norm before flooring.
    pub semantic_norm: f32,
    /// The relation gradient norm.
    pub relation_norm: f32,
}

/// Streaming aggregation of budget outcomes for the training metrics.
///
/// One summary aggregates the nodes recorded into it; the training loop keeps one per reporting
/// bucket (overall, per relation type, per degree decile) and records each node's outcome into
/// every bucket it belongs to. The summary accumulates the ratio mean in double precision.
#[derive(Debug, Default)]
pub(crate) struct BudgetSummary {
    nodes: usize,
    ratio: f64,
}

impl BudgetSummary {
    /// Creates an empty summary.
    #[inline]
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self {
            nodes: 0,
            ratio: 0.0,
        }
    }

    /// Records one node's outcome.
    pub(crate) fn record(&mut self, outcome: &BudgetOutcome) {
        self.nodes += 1;
        self.ratio += f64::from(outcome.relation_norm) / f64::from(outcome.baseline);
    }

    /// Returns the recorded node count.
    #[inline]
    #[must_use]
    pub(crate) const fn nodes(&self) -> usize {
        self.nodes
    }

    /// Returns the mean relation-to-baseline norm ratio.
    #[expect(
        clippy::cast_precision_loss,
        reason = "node counts stay far below the f64 integer bound"
    )]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the double-precision mean is the accessor's contract"
    )]
    #[must_use]
    pub(crate) fn mean_ratio(&self) -> Option<f32> {
        if self.nodes == 0 {
            return None;
        }

        Some((self.ratio / self.nodes as f64) as f32)
    }
}

/// Builds the backward-ready scalar of the hand-gradient objective.
///
/// Its backward pass carries the per-node coordinate gradients into the model parameters.
///
/// The returned value is `Σ_i ⟨coordinates[i], gradient[i]⟩`: its gradient with respect to
/// `coordinates` is exactly `gradient`, so a single backward pass propagates the caller's per-node
/// vectors through the projector's Jacobian. `gradient` lives on the inner backend and enters the
/// graph as a constant - the model cannot differentiate through the hand-gradient field.
pub(crate) fn surrogate<B: AutodiffBackend>(
    coordinates: Tensor<B, 2>,
    gradient: Tensor<B::InnerBackend, 2>,
) -> Tensor<B, 1> {
    (Tensor::from_inner(gradient) * coordinates).sum()
}
