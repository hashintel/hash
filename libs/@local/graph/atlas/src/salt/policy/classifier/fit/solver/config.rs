//! Validated solver-loop configuration.
//!
//! [`SolverConfig`] carries every knob of the trust-region exact-Newton loop: the radius
//! domain, shrink and expansion factors, acceptance thresholds, convergence tolerances, ulp
//! counts, and the inclusive work budgets. Per-field domains travel in the field types - the
//! validated scalars of [`math`](crate::math) and the non-zero integers of [`core::num`] - so a
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

use core::num::NonZero;

use super::prepare::PreparationSettings;
use crate::math::{DNonNegative, DPositive, GreaterThanOne, OpenUnitFraction};

/// A cross-field constraint failed; per-field domains hold by construction.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum SolverConfigError {
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

/// Trust-region exact-Newton loop configuration.
///
/// Every field carries a default; `SolverConfig { .. }` is the deployment configuration and
/// satisfies [`validate`](Self::validate). The budget defaults sit an order beyond the
/// predicted need at annotation-corpus scale, so termination is by tolerance and a budget
/// terminal reports as a failure.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SolverConfig {
    /// Preparation knobs: regularization, target-sum tolerance, and curvature floor.
    pub preparation: PreparationSettings = PreparationSettings { .. },
    /// Smallest admissible trust radius `Δ_min`.
    pub radius_minimum: DPositive = const {
        DPositive::new(1.0e-8).expect("the radius floor is positive")
    },
    /// Starting trust radius `Δ_initial`.
    pub radius_initial: DPositive = DPositive::ONE,
    /// Largest admissible trust radius `Δ_max`.
    pub radius_maximum: DPositive = const {
        DPositive::new(1.0e4).expect("the radius cap is positive")
    },
    /// Radius contraction factor on rejection.
    pub shrink_factor: OpenUnitFraction = const {
        OpenUnitFraction::new(0.25).expect("a quarter is interior")
    },
    /// Radius growth factor on an expanded boundary step.
    pub expansion_factor: GreaterThanOne = const {
        GreaterThanOne::new(2.0).expect("doubling expands")
    },
    /// Acceptance ratio threshold `η_accept`; equality accepts.
    pub eta_accept: OpenUnitFraction = const {
        OpenUnitFraction::new(0.1).expect("a tenth is interior")
    },
    /// Expansion ratio threshold `η_expand`; equality expands a tagged boundary step.
    pub eta_expand: OpenUnitFraction = const {
        OpenUnitFraction::new(0.75).expect("three quarters is interior")
    },
    /// Gradient-certificate tolerance relative to the initial scaled gradient norm.
    pub relative_scaled_gradient_tolerance: OpenUnitFraction = const {
        OpenUnitFraction::new(1.0e-6).expect("the relative tolerance is interior")
    },
    /// Absolute floor of the gradient certificate; zero disables it.
    pub absolute_scaled_gradient_tolerance: DNonNegative = const {
        DNonNegative::new(1.0e-10).expect("the absolute floor is non-negative")
    },
    /// Objective-resolution width in ulps of the accepted objective's spacing.
    pub objective_resolution_ulps: NonZero<u32> = const {
        NonZero::<u32>::new(4).expect("four is nonzero")
    },
    /// Dogleg Cauchy-curvature guard width in ulps of the gradient-scale product `‖g‖·‖Hg‖`.
    pub curvature_guard_ulps: NonZero<u32> = const {
        NonZero::<u32>::new(16).expect("sixteen is nonzero")
    },
    /// Inclusive maximum of started outer iterations.
    pub maximum_outer_iterations: NonZero<u64> = const {
        NonZero::<u64>::new(500).expect("five hundred is nonzero")
    },
    /// Inclusive maximum of Hessian-vector-product requests.
    pub maximum_hvp_requests: NonZero<u64> = const {
        NonZero::<u64>::new(50_000).expect("fifty thousand is nonzero")
    },
    /// Inclusive maximum of objective requests; at least two.
    pub maximum_objective_requests: u64 = 2_000,
    /// Inclusive maximum of gradient requests; at least two.
    pub maximum_gradient_requests: u64 = 2_000,
    /// Inclusive maximum of started row traversals; at least three.
    pub maximum_row_traversals: u64 = 500_000,
}

impl SolverConfig {
    /// Admits the configuration or names the first violated cross-field constraint.
    ///
    /// # Errors
    ///
    /// Returns the [`SolverConfigError`] of the first violated ordering or floor, in declared
    /// field order.
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    pub(crate) fn validate(&self) -> Result<(), SolverConfigError> {
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
