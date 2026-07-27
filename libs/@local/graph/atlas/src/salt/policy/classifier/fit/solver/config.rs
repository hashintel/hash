//! Validated solver-loop configuration.
//!
//! [`SolverConfig`] carries every knob of the trust-region Newton-CG loop: the radius domain,
//! shrink and expansion factors, acceptance thresholds, convergence tolerances, ulp counts, and
//! the inclusive work budgets. [`validate`](SolverConfig::validate) admits a configuration only
//! when every value lies in its documented domain, checking fields in declared order and
//! reporting the first violation; NaN fails every domain it appears in. The preparation-side
//! knobs ride along as [`PreparationSettings`], so one validated configuration covers the whole
//! fit.
//!
//! Work budgets are inclusive maxima: equality with a budget is allowed and a request fails only
//! when it would exceed its maximum. The objective, gradient, and row-traversal budgets have
//! floors of two, two, and three - one initialized joint evaluation, one reserved final
//! certificate, and the preparation traversal are the least work any valid fit performs.

use core::num::NonZeroU32;

use super::prepare::PreparationSettings;

/// A configuration value lies outside its documented domain.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum SolverConfigError {
    /// The radius domain violates `0 < minimum ≤ initial ≤ maximum` with a finite maximum.
    RadiusDomain {
        minimum: f64,
        initial: f64,
        maximum: f64,
    },
    /// The shrink factor lies outside `(0, 1)`.
    ShrinkFactor { value: f64 },
    /// The expansion factor is not finite and greater than one.
    ExpansionFactor { value: f64 },
    /// The acceptance thresholds violate `0 < accept < expand < 1`.
    AcceptanceThresholds { accept: f64, expand: f64 },
    /// The relative CG residual tolerance lies outside `(0, 1)`.
    CgResidualTolerance { value: f64 },
    /// The relative scaled-gradient tolerance lies outside `(0, 1)`.
    RelativeGradientTolerance { value: f64 },
    /// The absolute scaled-gradient tolerance is not finite and non-negative.
    AbsoluteGradientTolerance { value: f64 },
    /// The curvature floor is not positive and finite.
    CurvatureFloor { value: f64 },
    /// The outer-iteration budget is zero.
    OuterIterationBudget,
    /// The per-outer CG-iteration budget is zero.
    CgIterationBudget,
    /// The Hessian-vector-product budget is zero.
    HvpBudget,
    /// The consecutive-rejection budget is zero.
    RejectionBudget,
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
    pub radius_minimum: f64,
    /// Starting trust radius `Δ_initial`.
    pub radius_initial: f64,
    /// Largest admissible trust radius `Δ_max`.
    pub radius_maximum: f64,
    /// Radius contraction factor on rejection, in `(0, 1)`.
    pub shrink_factor: f64,
    /// Radius growth factor on an expanded boundary step, greater than one.
    pub expansion_factor: f64,
    /// Acceptance ratio threshold `η_accept`; equality accepts.
    pub eta_accept: f64,
    /// Expansion ratio threshold `η_expand`; equality expands a tagged boundary step.
    pub eta_expand: f64,
    /// CG residual tolerance relative to the initial residual norm, in `(0, 1)`.
    pub relative_cg_residual_tolerance: f64,
    /// Gradient-certificate tolerance relative to the initial scaled gradient norm, in `(0, 1)`.
    pub relative_scaled_gradient_tolerance: f64,
    /// Absolute floor of the gradient certificate; zero disables it.
    pub absolute_scaled_gradient_tolerance: f64,
    /// Objective-resolution width in ulps of the accepted objective's spacing.
    pub objective_resolution_ulps: NonZeroU32,
    /// Curvature-guard width in ulps of the direction-scale product.
    pub curvature_guard_ulps: NonZeroU32,
    /// Boundary-residual tolerance in ulps of one.
    pub boundary_residual_ulps: NonZeroU32,
    /// Inclusive maximum of started outer iterations.
    pub maximum_outer_iterations: u64,
    /// Inclusive maximum of CG iterations per outer solve.
    pub maximum_cg_iterations: u64,
    /// Inclusive maximum of Hessian-vector-product requests.
    pub maximum_hvp_requests: u64,
    /// Inclusive maximum of objective requests; at least two.
    pub maximum_objective_requests: u64,
    /// Inclusive maximum of gradient requests; at least two.
    pub maximum_gradient_requests: u64,
    /// Inclusive maximum of started row traversals; at least three.
    pub maximum_row_traversals: u64,
    /// Inclusive maximum of consecutive rejected candidates.
    pub maximum_consecutive_rejections: u64,
}

impl SolverConfig {
    /// Admits the configuration or names the first out-of-domain field.
    ///
    /// # Errors
    ///
    /// Returns the [`SolverConfigError`] of the first violated domain, in declared field order.
    pub(super) fn validate(&self) -> Result<(), SolverConfigError> {
        let floor_valid =
            self.preparation.curvature_floor.is_finite() && self.preparation.curvature_floor > 0.0;
        if !floor_valid {
            return Err(SolverConfigError::CurvatureFloor {
                value: self.preparation.curvature_floor,
            });
        }

        let radius_ordered = self.radius_minimum > 0.0
            && self.radius_minimum <= self.radius_initial
            && self.radius_initial <= self.radius_maximum
            && self.radius_maximum.is_finite();
        if !radius_ordered {
            return Err(SolverConfigError::RadiusDomain {
                minimum: self.radius_minimum,
                initial: self.radius_initial,
                maximum: self.radius_maximum,
            });
        }

        let shrink_valid = self.shrink_factor > 0.0 && self.shrink_factor < 1.0;
        if !shrink_valid {
            return Err(SolverConfigError::ShrinkFactor {
                value: self.shrink_factor,
            });
        }

        let expansion_valid = self.expansion_factor > 1.0 && self.expansion_factor.is_finite();
        if !expansion_valid {
            return Err(SolverConfigError::ExpansionFactor {
                value: self.expansion_factor,
            });
        }

        let acceptance_ordered =
            self.eta_accept > 0.0 && self.eta_accept < self.eta_expand && self.eta_expand < 1.0;
        if !acceptance_ordered {
            return Err(SolverConfigError::AcceptanceThresholds {
                accept: self.eta_accept,
                expand: self.eta_expand,
            });
        }

        let residual_valid =
            self.relative_cg_residual_tolerance > 0.0 && self.relative_cg_residual_tolerance < 1.0;
        if !residual_valid {
            return Err(SolverConfigError::CgResidualTolerance {
                value: self.relative_cg_residual_tolerance,
            });
        }

        let relative_valid = self.relative_scaled_gradient_tolerance > 0.0
            && self.relative_scaled_gradient_tolerance < 1.0;
        if !relative_valid {
            return Err(SolverConfigError::RelativeGradientTolerance {
                value: self.relative_scaled_gradient_tolerance,
            });
        }

        let absolute_valid = self.absolute_scaled_gradient_tolerance.is_finite()
            && self.absolute_scaled_gradient_tolerance >= 0.0;
        if !absolute_valid {
            return Err(SolverConfigError::AbsoluteGradientTolerance {
                value: self.absolute_scaled_gradient_tolerance,
            });
        }

        if self.maximum_outer_iterations == 0 {
            return Err(SolverConfigError::OuterIterationBudget);
        }
        if self.maximum_cg_iterations == 0 {
            return Err(SolverConfigError::CgIterationBudget);
        }
        if self.maximum_hvp_requests == 0 {
            return Err(SolverConfigError::HvpBudget);
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
        if self.maximum_consecutive_rejections == 0 {
            return Err(SolverConfigError::RejectionBudget);
        }

        Ok(())
    }

    /// The gradient-certificate threshold `max(absolute, relative·‖gζ,0‖₂)`, derived once from
    /// the initial scaled gradient norm.
    ///
    /// A zero threshold is valid: with the absolute floor disabled and an exactly-zero initial
    /// norm, only an exactly-zero gradient certifies. Returns [`None`] for a non-finite initial
    /// norm or threshold; the caller maps [`None`] onto its overflow outcome.
    pub(super) fn gradient_threshold(&self, initial_norm: f64) -> Option<f64> {
        if !initial_norm.is_finite() {
            return None;
        }

        let threshold = self
            .absolute_scaled_gradient_tolerance
            .max(self.relative_scaled_gradient_tolerance * initial_norm);
        threshold.is_finite().then_some(threshold)
    }
}
