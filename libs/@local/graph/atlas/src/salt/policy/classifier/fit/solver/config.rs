//! Validated solver-loop configuration.
//!
//! [`SolverConfig`] carries every knob of the trust-region Newton-CG loop: the radius domain,
//! shrink and expansion factors, acceptance thresholds, convergence tolerances, ulp counts, and
//! the inclusive work budgets. Per-field domains travel in the field types - the validated
//! scalars of [`math`](crate::math) and the non-zero integers of [`core::num`] - so a
//! configuration value that exists is in domain. [`validate`](SolverConfig::validate) checks
//! only what no field type can carry alone: the radius ordering, the acceptance-threshold
//! ordering, and the reserved-work floors, in declared order, reporting the first violation.
//! The preparation-side knobs ride along as [`PreparationSettings`], so one validated
//! configuration covers the whole fit.
//!
//! Work budgets are inclusive maxima: equality with a budget is allowed and a request fails only
//! when it would exceed its maximum. The objective, gradient, and row-traversal budgets have
//! floors of two, two, and three - one initialized joint evaluation, one reserved final
//! certificate, and the preparation traversal are the least work any valid fit performs.

use core::num::{NonZeroU32, NonZeroU64};

use super::prepare::PreparationSettings;
use crate::math::{DNonNegative, DPositive, GreaterThanOne, OpenUnitFraction};

/// A cross-field constraint failed; per-field domains hold by construction.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum SolverConfigError {
    /// The radius domain violates `minimum ≤ initial ≤ maximum`.
    RadiusDomain {
        minimum: DPositive,
        initial: DPositive,
        maximum: DPositive,
    },
    /// The acceptance thresholds violate `accept < expand`.
    AcceptanceThresholds {
        accept: OpenUnitFraction,
        expand: OpenUnitFraction,
    },
    /// The objective-request budget is below its floor of two.
    ObjectiveBudget { value: u64 },
    /// The gradient-request budget is below its floor of two.
    GradientBudget { value: u64 },
    /// The row-traversal budget is below its floor of three.
    TraversalBudget { value: u64 },
}

/// Trust-region Newton-CG loop configuration.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct SolverConfig {
    /// Preparation knobs: regularization, target-sum tolerance, and curvature floor.
    pub preparation: PreparationSettings,
    /// Smallest admissible trust radius `Δ_min`.
    pub radius_minimum: DPositive,
    /// Starting trust radius `Δ_initial`.
    pub radius_initial: DPositive,
    /// Largest admissible trust radius `Δ_max`.
    pub radius_maximum: DPositive,
    /// Radius contraction factor on rejection.
    pub shrink_factor: OpenUnitFraction,
    /// Radius growth factor on an expanded boundary step.
    pub expansion_factor: GreaterThanOne,
    /// Acceptance ratio threshold `η_accept`; equality accepts.
    pub eta_accept: OpenUnitFraction,
    /// Expansion ratio threshold `η_expand`; equality expands a tagged boundary step.
    pub eta_expand: OpenUnitFraction,
    /// CG residual tolerance relative to the initial residual norm.
    pub relative_cg_residual_tolerance: OpenUnitFraction,
    /// Gradient-certificate tolerance relative to the initial scaled gradient norm.
    pub relative_scaled_gradient_tolerance: OpenUnitFraction,
    /// Absolute floor of the gradient certificate; zero disables it.
    pub absolute_scaled_gradient_tolerance: DNonNegative,
    /// Objective-resolution width in ulps of the accepted objective's spacing.
    pub objective_resolution_ulps: NonZeroU32,
    /// Curvature-guard width in ulps of the direction-scale product.
    pub curvature_guard_ulps: NonZeroU32,
    /// Boundary-residual tolerance in ulps of one.
    pub boundary_residual_ulps: NonZeroU32,
    /// Inclusive maximum of started outer iterations.
    pub maximum_outer_iterations: NonZeroU64,
    /// Inclusive maximum of CG iterations per outer solve.
    pub maximum_cg_iterations: NonZeroU64,
    /// Inclusive maximum of Hessian-vector-product requests.
    pub maximum_hvp_requests: NonZeroU64,
    /// Inclusive maximum of objective requests; at least two.
    pub maximum_objective_requests: u64,
    /// Inclusive maximum of gradient requests; at least two.
    pub maximum_gradient_requests: u64,
    /// Inclusive maximum of started row traversals; at least three.
    pub maximum_row_traversals: u64,
    /// Inclusive maximum of consecutive rejected candidates.
    pub maximum_consecutive_rejections: NonZeroU64,
}

impl SolverConfig {
    /// Admits the configuration or names the first violated cross-field constraint.
    ///
    /// # Errors
    ///
    /// Returns the [`SolverConfigError`] of the first violated ordering or floor, in declared
    /// field order.
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    pub(super) fn validate(&self) -> Result<(), SolverConfigError> {
        let radius_ordered = self.radius_minimum <= self.radius_initial
            && self.radius_initial <= self.radius_maximum;

        if !radius_ordered {
            return Err(SolverConfigError::RadiusDomain {
                minimum: self.radius_minimum,
                initial: self.radius_initial,
                maximum: self.radius_maximum,
            });
        }

        if self.eta_accept >= self.eta_expand {
            return Err(SolverConfigError::AcceptanceThresholds {
                accept: self.eta_accept,
                expand: self.eta_expand,
            });
        }

        if self.maximum_objective_requests < 2 {
            return Err(SolverConfigError::ObjectiveBudget {
                value: self.maximum_objective_requests,
            });
        }

        if self.maximum_gradient_requests < 2 {
            return Err(SolverConfigError::GradientBudget {
                value: self.maximum_gradient_requests,
            });
        }

        if self.maximum_row_traversals < 3 {
            return Err(SolverConfigError::TraversalBudget {
                value: self.maximum_row_traversals,
            });
        }

        Ok(())
    }

    /// The gradient-certificate threshold `max(absolute, relative·‖gζ,0‖₂)`, derived once from
    /// the initial scaled gradient norm.
    ///
    /// A zero threshold is valid: with the absolute floor disabled and an exactly-zero initial
    /// norm, only an exactly-zero gradient certifies. Returns [`None`] for a non-finite initial
    /// norm; a finite norm keeps the threshold finite, since the relative tolerance lies below
    /// one and the absolute floor is finite by construction.
    pub(super) fn gradient_threshold(&self, initial_norm: f64) -> Option<f64> {
        if !initial_norm.is_finite() {
            return None;
        }

        Some(
            self.absolute_scaled_gradient_tolerance
                .get()
                .max(self.relative_scaled_gradient_tolerance.get() * initial_norm),
        )
    }
}
