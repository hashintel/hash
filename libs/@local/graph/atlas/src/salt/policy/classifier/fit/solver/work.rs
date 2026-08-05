//! Truthful accounting of every solver work unit.
//!
//! [`WorkCounters`] separates logical work from physical work. Logical work covers the objective,
//! gradient, and Hessian-vector-product requests a fit makes, together with the pass shape that
//! served each one. Physical work covers the row traversals a fit started and the individual rows
//! it visited, and preparation charges its own counters as well as the global ones. Every
//! increment happens when the work does. A request counts when the fit makes it, a traversal when
//! it accesses its first row, a visit per row it examines, and a completion once it has seen
//! every row.
//!
//! The increment rules live here as methods rather than at call sites, so a joint pass can never
//! forget that it serves one objective request and one gradient request with a single traversal,
//! and a preparation row visit can never reach the preparation counters without also charging the
//! global row-visit count.

/// Logical and physical work counters of one fit.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct WorkCounters {
    /// Objective evaluations requested.
    pub objective_requests: u64,
    /// Gradient evaluations requested.
    pub gradient_requests: u64,
    /// Hessian-vector products requested.
    pub hvp_requests: u64,
    /// Traversals serving an objective and a gradient request together.
    pub joint_passes: u64,
    /// Traversals serving one objective request alone.
    pub objective_only_passes: u64,
    /// Traversals serving one gradient request alone.
    pub gradient_only_passes: u64,
    /// Preparation runs requested.
    pub preparation_requests: u64,
    /// Preparation traversals that accessed their first row.
    pub preparation_passes: u64,
    /// Rows examined by preparation traversals.
    pub preparation_row_visits: u64,
    /// Preparation traversals that visited every row.
    pub completed_preparation_traversals: u64,
    /// Row traversals of any category that accessed their first row.
    pub started_row_traversals: u64,
    /// Rows examined by traversals of any category.
    pub row_visits: u64,
    /// Joint traversals that visited every row.
    pub completed_joint_traversals: u64,
    /// Objective-only traversals that visited every row.
    pub completed_objective_traversals: u64,
    /// Gradient-only traversals that visited every row.
    pub completed_gradient_traversals: u64,
    /// Hessian-vector-product traversals that visited every row.
    pub completed_hvp_traversals: u64,
    /// Newton-assembly traversals that visited every row.
    pub completed_newton_traversals: u64,
    /// Gram matrices assembled over a corpus.
    pub gram_assemblies: u64,
    /// Capacitance Cholesky factorizations.
    pub factorizations: u64,
    /// Trial candidates rejected for a non-finite objective.
    pub candidate_non_finite_rejections: u64,
    /// Trial candidates rejected by their acceptance ratio.
    pub candidate_ratio_rejections: u64,
    /// Trial candidates accepted and committed.
    pub candidate_acceptances: u64,
    /// Ratio-accepted candidates recorded with a non-finite fresh gradient.
    pub accepted_by_ratio_gradient_non_finite: u64,
}

impl WorkCounters {
    /// Charges a preparation request, leaving the traversal itself to its first row access.
    pub(super) const fn request_preparation(&mut self) {
        self.preparation_requests += 1;
    }

    /// Charges the start of a preparation traversal at its first row access.
    pub(super) const fn start_preparation_traversal(&mut self) {
        self.preparation_passes += 1;
        self.started_row_traversals += 1;
    }

    /// Charges one examined preparation row.
    pub(super) const fn visit_preparation_row(&mut self) {
        self.preparation_row_visits += 1;
        self.row_visits += 1;
    }

    /// Records a preparation traversal that visited every row.
    pub(super) const fn complete_preparation_traversal(&mut self) {
        self.completed_preparation_traversals += 1;
    }

    /// Charges a joint request: one objective and one gradient request.
    ///
    /// The first row access charges the pass and its traversal on their own, so a request rejected
    /// before any row access (a non-finite input) still counts as requested work.
    pub(super) const fn request_joint(&mut self) {
        self.objective_requests += 1;
        self.gradient_requests += 1;
    }

    /// Charges one objective request.
    pub(super) const fn request_objective(&mut self) {
        self.objective_requests += 1;
    }

    /// Charges one gradient request.
    pub(super) const fn request_gradient(&mut self) {
        self.gradient_requests += 1;
    }

    /// Charges one Hessian-vector-product request.
    pub(super) const fn request_hvp(&mut self) {
        self.hvp_requests += 1;
    }

    /// Charges the start of a joint traversal at its first row access.
    pub(super) const fn start_joint_traversal(&mut self) {
        self.joint_passes += 1;
        self.started_row_traversals += 1;
    }

    /// Charges the start of an objective-only traversal at its first row access.
    pub(super) const fn start_objective_traversal(&mut self) {
        self.objective_only_passes += 1;
        self.started_row_traversals += 1;
    }

    /// Charges the start of a gradient-only traversal at its first row access.
    pub(super) const fn start_gradient_traversal(&mut self) {
        self.gradient_only_passes += 1;
        self.started_row_traversals += 1;
    }

    /// Charges the start of a Hessian-vector-product traversal at its first row access.
    pub(super) const fn start_hvp_traversal(&mut self) {
        self.started_row_traversals += 1;
    }

    /// Charges the start of a Newton-assembly traversal at its first row access.
    pub(super) const fn start_newton_traversal(&mut self) {
        self.started_row_traversals += 1;
    }

    /// Charges one examined row of an evaluation traversal.
    pub(super) const fn visit_row(&mut self) {
        self.row_visits += 1;
    }

    /// Records a joint traversal that visited every row.
    pub(super) const fn complete_joint_traversal(&mut self) {
        self.completed_joint_traversals += 1;
    }

    /// Records an objective-only traversal that visited every row.
    pub(super) const fn complete_objective_traversal(&mut self) {
        self.completed_objective_traversals += 1;
    }

    /// Records a gradient-only traversal that visited every row.
    pub(super) const fn complete_gradient_traversal(&mut self) {
        self.completed_gradient_traversals += 1;
    }

    /// Records a Hessian-vector-product traversal that visited every row.
    pub(super) const fn complete_hvp_traversal(&mut self) {
        self.completed_hvp_traversals += 1;
    }

    /// Records a Newton-assembly traversal that visited every row.
    pub(super) const fn complete_newton_traversal(&mut self) {
        self.completed_newton_traversals += 1;
    }

    /// Records one assembled Gram matrix.
    pub(super) const fn record_gram_assembly(&mut self) {
        self.gram_assemblies += 1;
    }

    /// Records one capacitance Cholesky factorization.
    pub(super) const fn record_factorization(&mut self) {
        self.factorizations += 1;
    }

    /// Records a trial candidate rejected for a non-finite objective.
    pub(super) const fn reject_non_finite_candidate(&mut self) {
        self.candidate_non_finite_rejections += 1;
    }

    /// Records a trial candidate rejected by its acceptance ratio.
    pub(super) const fn reject_finite_candidate(&mut self) {
        self.candidate_ratio_rejections += 1;
    }

    /// Records an accepted and committed trial candidate.
    pub(super) const fn accept_candidate(&mut self) {
        self.candidate_acceptances += 1;
    }

    /// Records a ratio-accepted candidate whose fresh gradient was not finite.
    pub(super) const fn record_accepted_by_ratio_gradient_non_finite(&mut self) {
        self.accepted_by_ratio_gradient_non_finite += 1;
    }
}
