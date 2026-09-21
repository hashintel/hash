//! Validated solver-loop configuration.
//!
//! [`SolverOptions`] carries every knob of the trust-region exact-Newton loop: the radius domain,
//! shrink and expansion factors, acceptance thresholds, convergence tolerances, ulp counts, and the
//! inclusive outer-iteration budget. Per-field domains are carried by the field types, the
//! validated scalars of [`math`](crate::math) and the non-zero integers of [`core::num`].
//! [`SolverConfig::new`] checks the radius and acceptance-threshold orderings that no field type
//! can carry alone. A [`SolverConfig`] value is therefore in domain. [`PreparationSettings`]
//! supplies the preparation-side knobs within the same configuration.
//!
//! The outer-iteration budget is an inclusive maximum: equality is allowed and starting one more
//! iteration fails the solve. It is the loop's only work limit. Per-request work is bounded by the
//! iteration structure itself, at a small fixed number of evaluations and traversals per outer
//! iteration.

use core::{fmt, num::NonZero};

use super::prepare::PreparationSettings;
use crate::math::{
    DNonNegative, DPositive, GreaterThanOne, OpenUnitFraction, d_non_negative, d_positive,
    greater_than_one, nz, open_unit_fraction,
};

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

impl fmt::Display for SolverConfigError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RadiusDomain {
                minimum,
                initial,
                maximum,
            } => write!(
                fmt,
                "trust radii must satisfy minimum <= initial <= maximum: minimum={minimum}, \
                 initial={initial}, maximum={maximum}",
            ),
            Self::AcceptanceThresholds { accept, expand } => write!(
                fmt,
                "acceptance thresholds must satisfy accept < expand: accept={accept}, \
                 expand={expand}",
            ),
        }
    }
}

impl core::error::Error for SolverConfigError {}

/// Default preparation knobs.
const DEFAULT_PREPARATION: PreparationSettings = PreparationSettings { .. };

/// Default smallest admissible trust radius `Δ_min`.
const DEFAULT_RADIUS_MINIMUM: DPositive = d_positive!(1.0e-8);

/// Default starting trust radius `Δ_initial`.
const DEFAULT_RADIUS_INITIAL: DPositive = DPositive::ONE;

/// Default largest admissible trust radius `Δ_max`.
const DEFAULT_RADIUS_MAXIMUM: DPositive = d_positive!(1.0e4);

/// Default radius contraction factor on rejection.
const DEFAULT_SHRINK_FACTOR: OpenUnitFraction = open_unit_fraction!(0.25);

/// Default radius growth factor on an expanded boundary step.
const DEFAULT_EXPANSION_FACTOR: GreaterThanOne = greater_than_one!(2.0);

/// Default acceptance ratio threshold `η_accept`.
const DEFAULT_ETA_ACCEPT: OpenUnitFraction = open_unit_fraction!(0.1);

/// Default expansion ratio threshold `η_expand`.
const DEFAULT_ETA_EXPAND: OpenUnitFraction = open_unit_fraction!(0.75);

/// Default gradient-certificate tolerance relative to the initial scaled gradient norm.
const DEFAULT_RELATIVE_SCALED_GRADIENT_TOLERANCE: OpenUnitFraction = open_unit_fraction!(1.0e-6);

/// Default absolute floor of the gradient certificate.
const DEFAULT_ABSOLUTE_SCALED_GRADIENT_TOLERANCE: DNonNegative = d_non_negative!(1.0e-10);

/// Default objective-resolution width in ulps.
const DEFAULT_OBJECTIVE_RESOLUTION_ULPS: NonZero<u32> = nz!(4);

/// Default dogleg Cauchy-curvature guard width in ulps.
const DEFAULT_CURVATURE_GUARD_ULPS: NonZero<u32> = nz!(16);

/// Default inclusive maximum of started outer iterations.
const DEFAULT_MAXIMUM_OUTER_ITERATIONS: NonZero<u64> = nz!(500);

/// Raw solver knobs admitted by [`SolverConfig::new`].
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SolverOptions {
    /// Preparation knobs: regularization, target-sum tolerance, and curvature floor.
    ///
    /// By default, uses [`PreparationSettings`]' defaults.
    pub preparation: PreparationSettings = DEFAULT_PREPARATION,
    /// Smallest admissible trust radius `Δ_min`.
    ///
    /// By default, this is `1e-8`.
    pub radius_minimum: DPositive = DEFAULT_RADIUS_MINIMUM,
    /// Starting trust radius `Δ_initial`.
    ///
    /// By default, this is `1`.
    pub radius_initial: DPositive = DEFAULT_RADIUS_INITIAL,
    /// Largest admissible trust radius `Δ_max`.
    ///
    /// By default, this is `1e4`.
    pub radius_maximum: DPositive = DEFAULT_RADIUS_MAXIMUM,
    /// Radius contraction factor on rejection.
    ///
    /// By default, this is `0.25`.
    pub shrink_factor: OpenUnitFraction = DEFAULT_SHRINK_FACTOR,
    /// Radius growth factor on an expanded boundary step.
    ///
    /// By default, this is `2`.
    pub expansion_factor: GreaterThanOne = DEFAULT_EXPANSION_FACTOR,
    /// Acceptance ratio threshold `η_accept`. Equality accepts.
    ///
    /// By default, this is `0.1`.
    pub eta_accept: OpenUnitFraction = DEFAULT_ETA_ACCEPT,
    /// Expansion ratio threshold `η_expand`. Equality expands a tagged boundary step.
    ///
    /// By default, this is `0.75`.
    pub eta_expand: OpenUnitFraction = DEFAULT_ETA_EXPAND,
    /// Gradient-certificate tolerance relative to the initial scaled gradient norm.
    ///
    /// By default, this is `1e-6`.
    pub relative_scaled_gradient_tolerance: OpenUnitFraction =
        DEFAULT_RELATIVE_SCALED_GRADIENT_TOLERANCE,
    /// Absolute floor of the gradient certificate. Zero disables it.
    ///
    /// By default, this is `1e-10`.
    pub absolute_scaled_gradient_tolerance: DNonNegative =
        DEFAULT_ABSOLUTE_SCALED_GRADIENT_TOLERANCE,
    /// Objective-resolution width in ulps of the accepted objective's spacing.
    ///
    /// By default, this is `4`.
    pub objective_resolution_ulps: NonZero<u32> = DEFAULT_OBJECTIVE_RESOLUTION_ULPS,
    /// Dogleg Cauchy-curvature guard width in ulps of the gradient-scale product `‖g‖·‖Hg‖`.
    ///
    /// By default, this is `16`.
    pub curvature_guard_ulps: NonZero<u32> = DEFAULT_CURVATURE_GUARD_ULPS,
    /// Inclusive maximum of started outer iterations.
    ///
    /// By default, this is `500`.
    pub maximum_outer_iterations: NonZero<u64> = DEFAULT_MAXIMUM_OUTER_ITERATIONS,
}

impl TryFrom<SolverOptions> for SolverConfig {
    type Error = SolverConfigError;

    fn try_from(options: SolverOptions) -> Result<Self, Self::Error> {
        Self::new(options)
    }
}

/// Trust-region exact-Newton loop configuration.
///
/// [`SolverOptions`] supplies every field. [`SolverConfig::default`] is the deployment
/// configuration. Its outer-iteration cap lies well beyond the measured demand at
/// annotation-corpus scale. Termination is therefore by tolerance, and the budget terminal reports
/// as a failure.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "SolverOptions")]
pub(crate) struct SolverConfig {
    /// Preparation knobs: regularization, target-sum tolerance, and curvature floor.
    pub preparation: PreparationSettings,
    /// Smallest admissible trust radius `Δ_min`.
    radius_minimum: DPositive,
    /// Starting trust radius `Δ_initial`.
    radius_initial: DPositive,
    /// Largest admissible trust radius `Δ_max`.
    radius_maximum: DPositive,
    /// Radius contraction factor on rejection.
    shrink_factor: OpenUnitFraction,
    /// Radius growth factor on an expanded boundary step.
    expansion_factor: GreaterThanOne,
    /// Acceptance ratio threshold `η_accept`. Equality accepts.
    eta_accept: OpenUnitFraction,
    /// Expansion ratio threshold `η_expand`. Equality expands a tagged boundary step.
    eta_expand: OpenUnitFraction,
    /// Gradient-certificate tolerance relative to the initial scaled gradient norm.
    relative_scaled_gradient_tolerance: OpenUnitFraction,
    /// Absolute floor of the gradient certificate. Zero disables it.
    absolute_scaled_gradient_tolerance: DNonNegative,
    /// Objective-resolution width in ulps of the accepted objective's spacing.
    objective_resolution_ulps: NonZero<u32>,
    /// Dogleg Cauchy-curvature guard width in ulps of the gradient-scale product `‖g‖·‖Hg‖`.
    curvature_guard_ulps: NonZero<u32>,
    /// Inclusive maximum of started outer iterations.
    maximum_outer_iterations: NonZero<u64>,
}

impl SolverConfig {
    /// Admits raw solver options after checking their cross-field orderings.
    ///
    /// # Errors
    ///
    /// Returns [`SolverConfigError`] for misordered radii or acceptance thresholds.
    pub(crate) const fn new(
        SolverOptions {
            preparation,
            radius_minimum,
            radius_initial,
            radius_maximum,
            shrink_factor,
            expansion_factor,
            eta_accept,
            eta_expand,
            relative_scaled_gradient_tolerance,
            absolute_scaled_gradient_tolerance,
            objective_resolution_ulps,
            curvature_guard_ulps,
            maximum_outer_iterations,
        }: SolverOptions,
    ) -> Result<Self, SolverConfigError> {
        let radius_ordered = radius_minimum <= radius_initial && radius_initial <= radius_maximum;

        if !radius_ordered {
            return Err(SolverConfigError::RadiusDomain {
                minimum: radius_minimum,
                initial: radius_initial,
                maximum: radius_maximum,
            });
        }

        if eta_accept >= eta_expand {
            return Err(SolverConfigError::AcceptanceThresholds {
                accept: eta_accept,
                expand: eta_expand,
            });
        }

        Ok(Self {
            preparation,
            radius_minimum,
            radius_initial,
            radius_maximum,
            shrink_factor,
            expansion_factor,
            eta_accept,
            eta_expand,
            relative_scaled_gradient_tolerance,
            absolute_scaled_gradient_tolerance,
            objective_resolution_ulps,
            curvature_guard_ulps,
            maximum_outer_iterations,
        })
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

    /// Returns the smallest admissible trust radius.
    pub(crate) const fn radius_minimum(&self) -> DPositive {
        self.radius_minimum
    }

    /// Returns the starting trust radius.
    pub(crate) const fn radius_initial(&self) -> DPositive {
        self.radius_initial
    }

    /// Returns the largest admissible trust radius.
    pub(crate) const fn radius_maximum(&self) -> DPositive {
        self.radius_maximum
    }

    /// Returns the radius contraction factor.
    pub(crate) const fn shrink_factor(&self) -> OpenUnitFraction {
        self.shrink_factor
    }

    /// Returns the radius expansion factor.
    pub(crate) const fn expansion_factor(&self) -> GreaterThanOne {
        self.expansion_factor
    }

    /// Returns the acceptance ratio threshold.
    pub(crate) const fn eta_accept(&self) -> OpenUnitFraction {
        self.eta_accept
    }

    /// Returns the expansion ratio threshold.
    pub(crate) const fn eta_expand(&self) -> OpenUnitFraction {
        self.eta_expand
    }

    /// Returns the objective-resolution width in ulps.
    pub(crate) const fn objective_resolution_ulps(&self) -> NonZero<u32> {
        self.objective_resolution_ulps
    }

    /// Returns the dogleg curvature-guard width in ulps.
    pub(crate) const fn curvature_guard_ulps(&self) -> NonZero<u32> {
        self.curvature_guard_ulps
    }

    /// Returns the inclusive outer-iteration budget.
    pub(crate) const fn maximum_outer_iterations(&self) -> NonZero<u64> {
        self.maximum_outer_iterations
    }
}

const impl Default for SolverConfig {
    fn default() -> Self {
        const DEFAULT: SolverConfig =
            const { SolverConfig::new(SolverOptions { .. }).ok().unwrap() };

        DEFAULT
    }
}
