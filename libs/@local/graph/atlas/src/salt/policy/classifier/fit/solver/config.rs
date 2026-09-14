//! Validated solver-loop configuration.
//!
//! `SolverOptions` carries every knob of the trust-region exact-Newton loop: the radius domain,
//! shrink and expansion factors, acceptance thresholds, convergence tolerances, ulp counts, and the
//! inclusive outer-iteration budget. Per-field domains are carried by the field types, the
//! validated scalars of [`math`](crate::math) and the non-zero integers of [`core::num`].
//! `SolverConfig::new` checks the radius and acceptance-threshold orderings that no field type
//! can carry alone. A [`SolverConfig`] value is therefore in domain. [`PreparationSettings`]
//! supplies the preparation-side knobs within the same configuration.
//!
//! The outer-iteration budget is an inclusive maximum: equality is allowed and starting one more
//! iteration fails the solve. It is the loop's only work limit. Per-request work is bounded by the
//! iteration structure itself, at a small fixed number of evaluations and traversals per outer
//! iteration.

use core::num::NonZero;

use super::prepare::PreparationSettings;
use crate::math::{DNonNegative, DPositive, GreaterThanOne, OpenUnitFraction};

/// A cross-field constraint failed.
///
/// Per-field domains hold by construction.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum SolverConfigError {
    /// The radius domain violates `minimum ≤ initial ≤ maximum`.
    RadiusDomain {
        /// The configured minimum radius.
        minimum: DPositive,
        /// The configured initial radius.
        initial: DPositive,
        /// The configured maximum radius.
        maximum: DPositive,
    },
    /// The acceptance thresholds violate `accept < expand`.
    AcceptanceThresholds {
        /// The configured acceptance threshold.
        accept: OpenUnitFraction,
        /// The configured expansion threshold.
        expand: OpenUnitFraction,
    },
}

/// Trust-region exact-Newton loop configuration.
///
/// Every field carries a default; `SolverConfig { .. }` is the deployment configuration and
/// satisfies [`validate`](Self::validate). The outer-iteration cap sits well beyond the measured
/// demand at annotation-corpus scale, so termination is by tolerance and the budget terminal
/// reports as a failure.
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
    /// Absolute floor of the gradient certificate. Zero disables it.
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
}

impl SolverConfig {
    /// Admits raw solver options after checking their cross-field orderings.
    ///
    /// # Errors
    ///
    /// Returns the [`SolverConfigError`] of the first violated ordering, in declared field order.
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

        Ok(())
    }

    /// Derives the gradient-certificate threshold from the initial scaled gradient norm.
    ///
    /// The threshold is `max(absolute, relative·‖gζ,0‖₂)`.
    ///
    /// A zero threshold is valid. With the absolute floor at zero and an exactly-zero initial norm,
    /// only an exactly-zero gradient certifies. The derivation is total: the relative tolerance
    /// lies below one, and the scaled term never exceeds the norm. The maximum of two in-domain
    /// values therefore stays in domain.
    pub(super) const fn gradient_threshold(&self, initial_norm: DNonNegative) -> DNonNegative {
        self.absolute_scaled_gradient_tolerance
            .max(self.relative_scaled_gradient_tolerance * initial_norm)
    }
}
