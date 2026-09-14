//! Admission bounds, subgroup flag settings and validated absolute-threshold overrides.

use core::fmt;

use crate::math::{NonNegative, UnitFraction, narrow_f32};

// the factor marks subgroups above twice the whole-probe degradation. With unique type memberships
// and at least eight anchors, each anchor contributes at most one eighth of subgroup recall. This
// limits leverage, not sampling uncertainty or subgroup importance.
/// The default ceiling on a subgroup's degradation relative to the overall degradation.
const DEFAULT_DEGRADATION_FACTOR: f64 = 2.0;
/// The default anchor floor below which a subgroup reading is not judged.
const DEFAULT_MINIMUM_SUBGROUP_ANCHORS: usize = 8;

/// The maximally permissive density-spread ceiling.
///
/// Positive finite f32 radii lie between 2⁻¹⁴⁹ and 2¹²⁸. Their log ratios have magnitude below 277
/// · ln(2), and deviations from a median are below twice that bound. Therefore `f32::MAX` exceeds
/// every spread obtained from such radii while keeping the ceiling finite.
const PERMISSIVE_DENSITY_SPREAD: NonNegative =
    NonNegative::new(f32::MAX).expect("the f32 maximum is finite and non-negative");

/// A quality-thresholds override document.
///
/// Every absolute control takes an optional field, absent by default. A present field replaces the
/// current threshold after [`QualityThresholds::with_overrides`] validates its domain. An absent or
/// null field keeps the current value. Deserialization rejects unknown fields.
#[derive(Debug, Copy, Clone, Default, serde::Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ThresholdOverrides {
    /// Recall floor in `[0, 1]`, absent by default.
    pub minimum_recall: Option<f64>,
    /// Trustworthiness floor in `[0, 1]`, absent by default.
    pub minimum_trustworthiness: Option<f64>,
    /// Continuity floor in `[0, 1]`, absent by default.
    pub minimum_continuity: Option<f64>,
    /// Intrusion-rate ceiling in `[0, 1]`, absent by default.
    pub maximum_intrusion_rate: Option<f64>,
    /// Density-spread ceiling in the finite non-negative f32 range, absent by default.
    ///
    /// The input validates as f64 before rounding to f32.
    pub maximum_density_spread: Option<f64>,
    /// Triplet-agreement floor in `[0, 1]`, absent by default.
    pub minimum_triplet_agreement: Option<f64>,
}

/// An override value outside its control's domain.
#[derive(Debug)]
pub struct ThresholdDomainError {
    /// The refused field.
    pub field: &'static str,
    /// The refused value.
    pub value: f64,
    /// The domain the field demands.
    pub domain: &'static str,
}

impl fmt::Display for ThresholdDomainError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the {} override {} lies outside {}",
            self.field, self.value, self.domain,
        )
    }
}

impl core::error::Error for ThresholdDomainError {}

/// The thresholds of one assessment.
///
/// Absolute neighbourhood bounds apply to every step of the corpus map-versus-representation grid.
/// The remaining admission controls check density spread and sampled map-versus-representation
/// triplet agreement. [`QualityReport::passes`](super::QualityReport::passes) requires all controls
/// to have readings within their inclusive bounds.
///
/// Absolute defaults accept every in-domain metric value while requiring readings.
/// [`ThresholdOverrides`] replaces selected bounds after domain validation. Subgroup settings
/// govern report-only flags, and their raw factor and count fields have no validation here.
// serde derives cannot parse default field values; QualityReport serializes applied thresholds as
// individual fields
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct QualityThresholds {
    /// Minimum recall floor.
    ///
    /// Uses zero by default, accepting every in-domain recall.
    pub minimum_recall: UnitFraction = UnitFraction::ZERO,
    /// Minimum trustworthiness floor.
    ///
    /// Uses zero by default, accepting every in-domain trustworthiness reading.
    pub minimum_trustworthiness: UnitFraction = UnitFraction::ZERO,
    /// Minimum continuity floor.
    ///
    /// Uses zero by default, accepting every in-domain continuity reading.
    pub minimum_continuity: UnitFraction = UnitFraction::ZERO,
    /// Maximum intrusion-rate ceiling.
    ///
    /// Uses one by default, accepting every in-domain rate.
    pub maximum_intrusion_rate: UnitFraction = UnitFraction::ONE,
    /// Maximum density-distortion spread.
    ///
    /// Uses `f32::MAX` by default, accepting every spread from finite positive f32 radii. The control still fails when any density step has no reading.
    pub maximum_density_spread: NonNegative = PERMISSIVE_DENSITY_SPREAD,
    /// Minimum map-versus-representation triplet agreement floor.
    ///
    /// Uses zero by default, accepting every in-domain agreement. The control still fails when triplet sampling is off.
    pub minimum_triplet_agreement: UnitFraction = UnitFraction::ZERO,
    /// Subgroup degradation multiplier for report-only flags.
    ///
    /// Uses 2 by default. A subgroup meeting the anchor floor flags unless its degradation is at most this factor times whole-probe degradation. The factor has no domain validation, and a NaN comparison therefore flags.
    pub subgroup_degradation_factor: f64 = DEFAULT_DEGRADATION_FACTOR,
    /// Subgroups with fewer anchors never flag.
    ///
    /// Uses 8 by default.
    pub minimum_subgroup_anchors: usize = DEFAULT_MINIMUM_SUBGROUP_ANCHORS,
}

impl QualityThresholds {
    /// Applies an override document over these thresholds.
    ///
    /// A present field replaces the current value after domain validation, and an absent field
    /// preserves it. The density ceiling rounds to f32 after validation in f64, including positive
    /// underflow to zero.
    ///
    /// # Errors
    ///
    /// Returns [`ThresholdDomainError`] for the first out-of-domain override. Validation order is
    /// recall, trustworthiness, continuity, intrusion rate, triplet agreement and density spread.
    pub(crate) fn with_overrides(
        mut self,
        overrides: &ThresholdOverrides,
    ) -> Result<Self, ThresholdDomainError> {
        /// Overrides `into` with `value` when one is given.
        ///
        /// # Errors
        ///
        /// Returns a [`ThresholdDomainError`] attributed to `field` when `value` lies outside the
        /// closed unit interval.
        const fn fraction(
            field: &'static str,
            value: Option<f64>,
            into: &mut UnitFraction,
        ) -> Result<(), ThresholdDomainError> {
            if let Some(value) = value {
                *into = UnitFraction::new(value).ok_or(ThresholdDomainError {
                    field,
                    value,
                    domain: "the closed unit interval",
                })?;
            }

            Ok(())
        }

        fraction(
            "minimum_recall",
            overrides.minimum_recall,
            &mut self.minimum_recall,
        )?;
        fraction(
            "minimum_trustworthiness",
            overrides.minimum_trustworthiness,
            &mut self.minimum_trustworthiness,
        )?;
        fraction(
            "minimum_continuity",
            overrides.minimum_continuity,
            &mut self.minimum_continuity,
        )?;
        fraction(
            "maximum_intrusion_rate",
            overrides.maximum_intrusion_rate,
            &mut self.maximum_intrusion_rate,
        )?;
        fraction(
            "minimum_triplet_agreement",
            overrides.minimum_triplet_agreement,
            &mut self.minimum_triplet_agreement,
        )?;
        if let Some(value) = overrides.maximum_density_spread {
            // Rounding can map a negative underflow to -0.0 or a value above f32::MAX onto that
            // boundary. The check uses the original f64 value before narrowing. Therefore both
            // out-of-domain cases refuse even if their rounded values would pass.
            let admitted = (value.is_finite() && value >= 0.0 && value <= f64::from(f32::MAX))
                .then(|| narrow_f32(value))
                .flatten()
                .and_then(NonNegative::new);
            self.maximum_density_spread = admitted.ok_or(ThresholdDomainError {
                field: "maximum_density_spread",
                value,
                domain: "the finite non-negative f32 range",
            })?;
        }
        Ok(self)
    }
}

const impl Default for QualityThresholds {
    fn default() -> Self {
        Self { .. }
    }
}
