//! Per-node relation-gradient budgets in coordinate space.
//!
//! The relation objective must never overpower the semantic layout at
//! any single node: before the relation gradient reaches shared model
//! parameters, each node's relation contribution is scaled down to a
//! budget proportional to that node's semantic gradient. The clip is
//! pure 2D vector algebra over detached values:
//!
//! ```text
//! baseline = max(|semantic|, floor)
//! clipped  = relation * min(1, positive * baseline / (|relation| + epsilon))
//! final    = clipped  * min(1, total * baseline / (|clipped| + epsilon))
//! ```
//!
//! The budgeted gradients re-enter the parameter graph through
//! [`surrogate`]: one backward pass through the returned scalar deposits
//! exactly the requested per-node coordinate gradient, and the clip
//! factors stay constants the optimizer cannot differentiate through.
//!
//! With a single attractive relation branch, the trailing
//! total-variation factor binds only when the positive factor also
//! binds, and then shaves at most an `epsilon`-order amount; it is kept
//! because its activation rate is a required training metric and a
//! future signed branch would make it load-bearing.

#[cfg(test)]
mod tests;

use burn::tensor::{Tensor, backend::AutodiffBackend};

use crate::math::Vec2;

/// Validated budget coefficients.
///
/// `positive` bounds the relation gradient against the per-node
/// semantic baseline, `total` bounds the relation contribution that is
/// finally applied, `floor` keeps the baseline positive where the
/// semantic gradient vanishes, and `epsilon` guards the norm
/// divisions. The positive coefficient never exceeds the total one.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BudgetOptions {
    positive: f32,
    total: f32,
    floor: f32,
    epsilon: f32,
}

impl BudgetOptions {
    /// Validates budget coefficients.
    ///
    /// Returns [`None`] unless every value is finite and strictly
    /// positive and `positive <= total`.
    #[must_use]
    pub(crate) const fn new(positive: f32, total: f32, floor: f32, epsilon: f32) -> Option<Self> {
        let coefficients_valid = positive.is_finite()
            && positive > 0.0
            && total.is_finite()
            && total > 0.0
            && positive <= total;

        let guards_valid = floor.is_finite() && floor > 0.0 && epsilon.is_finite() && epsilon > 0.0;
        if !(coefficients_valid && guards_valid) {
            return None;
        }
        Some(Self {
            positive,
            total,
            floor,
            epsilon,
        })
    }

    /// Returns the positive-branch coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn positive(self) -> f32 {
        self.positive
    }

    /// Returns the total-variation coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn total(self) -> f32 {
        self.total
    }

    /// Returns the semantic baseline floor.
    #[inline]
    #[must_use]
    pub(crate) const fn floor(self) -> f32 {
        self.floor
    }

    /// Returns the norm-division guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> f32 {
        self.epsilon
    }

    /// Clips one node's relation gradient against its semantic budget.
    ///
    /// Both inputs are coordinate-space gradients of the same node:
    /// `semantic` from the semantic-side terms, already scaled by their
    /// loss coefficients, and `relation` from the relation term
    /// likewise. The returned gradient satisfies both budget bounds:
    /// its norm stays within `total * baseline`, and the intermediate
    /// positive step stays within `positive * baseline`.
    #[must_use]
    pub(crate) fn clip(self, semantic: Vec2, relation: Vec2) -> ClippedRelation {
        let semantic_norm = semantic.length();
        let baseline = semantic_norm.max(self.floor);
        let relation_norm = relation.length();
        let positive_factor = (self.positive * baseline / (relation_norm + self.epsilon)).min(1.0);
        let clipped = relation * positive_factor;
        let total_factor = (self.total * baseline / (clipped.length() + self.epsilon)).min(1.0);

        ClippedRelation {
            gradient: clipped * total_factor,
            baseline,
            semantic_norm,
            relation_norm,
            positive_factor,
            total_factor,
        }
    }
}

/// One node's budget outcome: the applied gradient and its diagnostics.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClippedRelation {
    /// The budgeted relation gradient, ready to add to the semantic one.
    pub gradient: Vec2,
    /// The semantic baseline `max(|semantic|, floor)`.
    pub baseline: f32,
    /// The semantic gradient norm before flooring.
    pub semantic_norm: f32,
    /// The relation gradient norm before clipping.
    pub relation_norm: f32,
    /// The positive-branch factor; below one exactly when that clip bound.
    pub positive_factor: f32,
    /// The trailing total-variation factor; below one when the cap bound.
    pub total_factor: f32,
}

/// Streaming aggregation of budget outcomes for the training metrics.
///
/// One summary aggregates the nodes recorded into it; the training loop
/// keeps one per reporting bucket (overall, per relation type, per
/// degree decile) and records each node's outcome into every bucket it
/// belongs to. Ratio means are accumulated in double precision.
#[derive(Debug, Default)]
pub(crate) struct BudgetSummary {
    nodes: usize,
    clipped: usize,
    capped: usize,
    unclipped_ratio: f64,
    clipped_ratio: f64,
    cap_factor: f64,
}

impl BudgetSummary {
    /// Creates an empty summary.
    #[inline]
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self {
            nodes: 0,
            clipped: 0,
            capped: 0,
            unclipped_ratio: 0.0,
            clipped_ratio: 0.0,
            cap_factor: 0.0,
        }
    }

    /// Records one node's outcome.
    pub(crate) fn record(&mut self, outcome: &ClippedRelation) {
        self.nodes += 1;
        if outcome.positive_factor < 1.0 {
            self.clipped += 1;
        }

        if outcome.total_factor < 1.0 {
            self.capped += 1;
        }

        let baseline = f64::from(outcome.baseline);
        self.unclipped_ratio += f64::from(outcome.relation_norm) / baseline;
        self.clipped_ratio += f64::from(outcome.gradient.length()) / baseline;
        self.cap_factor += f64::from(outcome.total_factor);
    }

    /// Returns the recorded node count.
    #[inline]
    #[must_use]
    pub(crate) const fn nodes(&self) -> usize {
        self.nodes
    }

    /// Returns the fraction of nodes whose positive clip bound.
    #[must_use]
    pub(crate) fn clipped_fraction(&self) -> Option<f32> {
        self.fraction(self.clipped)
    }

    /// Returns the fraction of nodes whose total-variation cap bound.
    ///
    /// With equal positive and total coefficients this coincides with
    /// [`clipped_fraction`](Self::clipped_fraction) by arithmetic: a
    /// positively clipped gradient lands within one epsilon of the
    /// shared budget, so the trailing factor dips just below one.
    /// Read it against [`mean_cap_factor`](Self::mean_cap_factor),
    /// which separates that epsilon signature from real capping.
    #[must_use]
    pub(crate) fn capped_fraction(&self) -> Option<f32> {
        self.fraction(self.capped)
    }

    /// Returns the mean total-variation cap factor.
    ///
    /// One minus this mean is the fraction of relation-gradient mass
    /// the cap actually removed: near one, cap activations are the
    /// epsilon shave; materially below one, the cap is load-bearing.
    #[must_use]
    pub(crate) fn mean_cap_factor(&self) -> Option<f32> {
        self.mean(self.cap_factor)
    }

    /// Returns the mean unclipped relation-to-baseline norm ratio.
    #[must_use]
    pub(crate) fn mean_unclipped_ratio(&self) -> Option<f32> {
        self.mean(self.unclipped_ratio)
    }

    /// Returns the mean applied relation-to-baseline norm ratio.
    #[must_use]
    pub(crate) fn mean_clipped_ratio(&self) -> Option<f32> {
        self.mean(self.clipped_ratio)
    }

    fn fraction(&self, count: usize) -> Option<f32> {
        if self.nodes == 0 {
            return None;
        }

        #[expect(
            clippy::cast_precision_loss,
            reason = "node counts stay far below the f64 integer bound"
        )]
        let fraction = count as f64 / self.nodes as f64;
        #[expect(
            clippy::cast_possible_truncation,
            reason = "narrowing the double-precision fraction is the accessor's contract"
        )]
        let fraction = fraction as f32;
        Some(fraction)
    }

    fn mean(&self, total: f64) -> Option<f32> {
        if self.nodes == 0 {
            return None;
        }

        #[expect(
            clippy::cast_precision_loss,
            reason = "node counts stay far below the f64 integer bound"
        )]
        let mean = total / self.nodes as f64;
        #[expect(
            clippy::cast_possible_truncation,
            reason = "narrowing the double-precision mean is the accessor's contract"
        )]
        let mean = mean as f32;
        Some(mean)
    }
}

/// Builds the scalar whose backward pass carries budgeted coordinate
/// gradients into the model parameters.
///
/// The returned value is `sum_i <coordinates[i], gradient[i]>`: its
/// gradient with respect to `coordinates` is exactly `gradient`, so a
/// single backward pass propagates the caller's per-node vectors
/// through the projector's Jacobian. `gradient` lives on the inner
/// backend and enters the graph as a constant - the model cannot
/// differentiate through the budget's clip factors.
pub(crate) fn surrogate<B: AutodiffBackend>(
    coordinates: Tensor<B, 2>,
    gradient: Tensor<B::InnerBackend, 2>,
) -> Tensor<B, 1> {
    (Tensor::from_inner(gradient) * coordinates).sum()
}
