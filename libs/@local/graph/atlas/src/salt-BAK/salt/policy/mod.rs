//! Relation-policy precedence and attraction-side applicability.
//!
//! [`resolve`] selects exactly one policy source in this order:
//!
//! 1. explicit human override;
//! 2. human-reviewed posterior;
//! 3. direct synthetic posterior;
//! 4. calibrated classifier posterior; and
//! 5. Overlay fallback.
//!
//! A selected posterior `p = [p_C, p_P, p_O]` and applicability `a` produce
//! the attraction distribution:
//!
//! ```text
//! attraction = a * p + (1 - a) * [0, 0, 1]
//! ```
//!
//! The generation-wide Coincident gate then either retains Coincident mass or
//! transfers all of it to Overlay. It never transfers Coincident mass to
//! Proximal:
//!
//! ```text
//! admitted = enabled
//!     && attraction_C >= minimum_probability
//!     && a >= minimum_applicability
//!
//! effective_C = admitted ? attraction_C : 0
//! effective_P = attraction_P
//! effective_O = attraction_O + (admitted ? 0 : attraction_C)
//! ```
//!
//! [`ResolvedPolicy`] preserves the selected posterior, applicability-mixed
//! posterior and post-gate posterior as distinct values. Downstream force and
//! protection code can therefore use the appropriate channel without
//! reconstructing or conflating policy state.

use core::{error::Error, fmt};

use crate::salt::classifier::ClassifierOutput;

const POSTERIOR_SUM_TOLERANCE: f64 = 1.0e-12;

/// A finite value in the closed unit interval with canonical positive zero.
///
/// Arithmetic that combines validated probabilities clamps only a
/// one-ULP boundary overshoot caused by floating-point rounding.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, Default)]
#[repr(transparent)]
pub(crate) struct Probability(f64);

impl Probability {
    pub(crate) const ONE: Self = Self(1.0);
    pub(crate) const ZERO: Self = Self(0.0);

    /// Validates a probability.
    ///
    /// # Errors
    ///
    /// This returns an error when `value` is non-finite, has a negative sign
    /// bit, or exceeds one.
    pub(crate) fn new(value: f64) -> Result<Self, ProbabilityError> {
        if !value.is_finite() {
            return Err(ProbabilityError::NonFinite);
        }
        if value.is_sign_negative() || value > 1.0 {
            return Err(ProbabilityError::OutsideUnitInterval);
        }
        Ok(Self(value))
    }

    /// Returns the validated value.
    #[must_use]
    #[inline]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }

    #[inline]
    fn from_calculation(value: f64) -> Self {
        debug_assert!(value.is_finite());
        debug_assert!((-f64::EPSILON..=1.0 + f64::EPSILON).contains(&value));
        Self(value.clamp(0.0, 1.0))
    }
}

/// An invalid probability.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ProbabilityError {
    NonFinite,
    OutsideUnitInterval,
}

impl fmt::Display for ProbabilityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonFinite => formatter.write_str("probability is not finite"),
            Self::OutsideUnitInterval => {
                formatter.write_str("probability is outside the closed unit interval")
            }
        }
    }
}

impl Error for ProbabilityError {}

/// The three placement classes in model order.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub(crate) enum PlacementClass {
    Coincident = 0,
    Proximal = 1,
    Overlay = 2,
}

/// A normalized Coincident, Proximal and Overlay distribution.
///
/// Components are ordered explicitly and must sum to one within
/// `1e-12`. [`Self::top_class`] resolves ties in class order.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PlacementPosterior {
    pub coincident: Probability,
    pub proximal: Probability,
    pub overlay: Probability,
}

impl PlacementPosterior {
    pub(crate) const OVERLAY: Self = Self {
        coincident: Probability::ZERO,
        proximal: Probability::ZERO,
        overlay: Probability::ONE,
    };

    /// Validates a normalized placement distribution.
    ///
    /// # Errors
    ///
    /// This returns an error when a component is not a probability or the
    /// components do not sum to one.
    pub(crate) fn new(
        coincident: f64,
        proximal: f64,
        overlay: f64,
    ) -> Result<Self, PosteriorError> {
        Probability::new(coincident).map_err(|error| PosteriorError::Probability {
            class: PlacementClass::Coincident,
            error,
        })?;
        Probability::new(proximal).map_err(|error| PosteriorError::Probability {
            class: PlacementClass::Proximal,
            error,
        })?;
        Probability::new(overlay).map_err(|error| PosteriorError::Probability {
            class: PlacementClass::Overlay,
            error,
        })?;
        let sum = coincident + proximal + overlay;
        if (sum - 1.0).abs() > POSTERIOR_SUM_TOLERANCE {
            return Err(PosteriorError::NotNormalized);
        }
        let coincident = coincident / sum;
        let proximal = proximal / sum;
        Ok(Self {
            coincident: Probability::from_calculation(coincident),
            proximal: Probability::from_calculation(proximal),
            overlay: Probability::from_calculation(1.0 - coincident - proximal),
        })
    }

    /// Returns the first maximum in coincident, proximal, overlay order.
    #[must_use]
    pub(crate) fn top_class(self) -> PlacementClass {
        if self.coincident >= self.proximal && self.coincident >= self.overlay {
            PlacementClass::Coincident
        } else if self.proximal >= self.overlay {
            PlacementClass::Proximal
        } else {
            PlacementClass::Overlay
        }
    }

    /// Mixes unsupported policy mass toward Overlay.
    ///
    /// For applicability `a`, this mixes `self` and [`Self::OVERLAY`] with
    /// weights `a` and `1 - a`, respectively.
    #[must_use]
    pub(crate) fn with_applicability(self, applicability: Probability) -> Self {
        let weight = applicability.get();
        Self {
            coincident: Probability::from_calculation(self.coincident.get() * weight),
            proximal: Probability::from_calculation(self.proximal.get() * weight),
            overlay: Probability::from_calculation(self.overlay.get() * weight + (1.0 - weight)),
        }
    }

    /// Moves all Coincident mass to Overlay.
    #[must_use]
    pub(crate) fn without_coincident(self) -> Self {
        Self {
            coincident: Probability::ZERO,
            proximal: self.proximal,
            overlay: Probability::from_calculation(self.overlay.get() + self.coincident.get()),
        }
    }
}

/// An invalid placement distribution.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum PosteriorError {
    Probability {
        class: PlacementClass,
        error: ProbabilityError,
    },
    NotNormalized,
}

impl fmt::Display for PosteriorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Probability { class, error } => {
                write!(formatter, "{class:?} {error}")
            }
            Self::NotNormalized => formatter.write_str("placement probabilities do not sum to one"),
        }
    }
}

impl Error for PosteriorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Probability { error, .. } => Some(error),
            Self::NotNormalized => None,
        }
    }
}

/// Identifies the selected policy evidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum PolicySource {
    HumanOverride,
    HumanReviewed,
    Synthetic,
    Classifier,
    OverlayFallback,
}

/// Policy evidence ordered from highest to lowest precedence.
///
/// [`resolve`] selects the first populated field. A classifier prediction is
/// used only when no explicit, reviewed or synthetic posterior is available.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct PolicyEvidence {
    pub human_override: Option<PlacementPosterior>,
    pub human_reviewed: Option<PlacementPosterior>,
    pub synthetic: Option<PlacementPosterior>,
    pub classifier: Option<ClassifierOutput>,
}

/// Generation-wide admission thresholds for Coincident attraction.
///
/// The default disables Coincident attraction and uses zero thresholds.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct CoincidentGate {
    pub enabled: bool,
    pub minimum_probability: Probability,
    pub minimum_applicability: Probability,
}

/// A selected and attraction-adjusted policy.
///
/// Each field represents a distinct stage of policy resolution. In particular,
/// `selected`, `attraction` and `effective_attraction` must not be substituted
/// for one another.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ResolvedPolicy {
    pub source: PolicySource,
    pub selected: PlacementPosterior,
    pub applicability: Probability,
    pub attraction: PlacementPosterior,
    pub effective_attraction: PlacementPosterior,
    pub coincident_admitted: bool,
}

/// Resolves precedence, applicability, and the global Coincident gate.
///
/// This function performs no allocation.
#[must_use]
pub(crate) fn resolve(evidence: PolicyEvidence, gate: CoincidentGate) -> ResolvedPolicy {
    let (source, selected, applicability) = if let Some(posterior) = evidence.human_override {
        (PolicySource::HumanOverride, posterior, Probability::ONE)
    } else if let Some(posterior) = evidence.human_reviewed {
        (PolicySource::HumanReviewed, posterior, Probability::ONE)
    } else if let Some(posterior) = evidence.synthetic {
        (PolicySource::Synthetic, posterior, Probability::ONE)
    } else if let Some(prediction) = evidence.classifier {
        (
            PolicySource::Classifier,
            prediction.calibrated,
            prediction.applicability,
        )
    } else {
        (
            PolicySource::OverlayFallback,
            PlacementPosterior::OVERLAY,
            Probability::ZERO,
        )
    };

    let attraction = selected.with_applicability(applicability);
    let coincident_admitted = gate.enabled
        && attraction.coincident >= gate.minimum_probability
        && applicability >= gate.minimum_applicability;
    let effective_attraction = if coincident_admitted {
        attraction
    } else {
        attraction.without_coincident()
    };

    ResolvedPolicy {
        source,
        selected,
        applicability,
        attraction,
        effective_attraction,
        coincident_admitted,
    }
}

#[cfg(test)]
mod tests;
