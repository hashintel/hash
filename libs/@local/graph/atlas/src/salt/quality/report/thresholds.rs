//! Validated quality controls and their override document.

use core::fmt;

use crate::math::{NonNegative, UnitFraction, narrow_f32};

// The degradation factor is normative: no important subgroup may suffer more than twice the overall
// degradation. The anchor floor bounds single-anchor leverage on a subgroup reading to one eighth,
// which is a sampling-noise floor and says nothing about which subgroups matter.
const DEFAULT_DEGRADATION_FACTOR: f64 = 2.0;
const DEFAULT_MINIMUM_SUBGROUP_ANCHORS: usize = 8;

/// The maximally permissive density-spread ceiling.
///
/// A few hundred bounds the spread of `ln` radius ratios over f32 radii, so the f32 maximum imposes
/// no practical ceiling while the type keeps the value finite and non-negative by construction.
const PERMISSIVE_DENSITY_SPREAD: NonNegative =
    NonNegative::new(f32::MAX).expect("the f32 maximum is finite and non-negative");

/// A quality-thresholds override document.
///
/// Each of the six absolute controls takes an optional field. A present field overrides its source
/// default after domain validation, an absent field keeps that default, and an unknown field
/// refuses the whole document.
#[derive(Debug, Copy, Clone, Default, serde::Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ThresholdOverrides {
    /// Overriding recall floor, in `[0, 1]`.
    pub minimum_recall: Option<f64>,
    /// Overriding trustworthiness floor, in `[0, 1]`.
    pub minimum_trustworthiness: Option<f64>,
    /// Overriding continuity floor, in `[0, 1]`.
    pub minimum_continuity: Option<f64>,
    /// Overriding intrusion-rate ceiling, in `[0, 1]`.
    pub maximum_intrusion_rate: Option<f64>,
    /// Overriding density-spread ceiling, finite and non-negative.
    pub maximum_density_spread: Option<f64>,
    /// Overriding triplet-agreement floor, in `[0, 1]`.
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
/// Every control is a concrete validated value. Floors and ceilings apply to the corpus
/// map-versus-representation grid at every neighbourhood size, and every control stays pinned
/// because [`QualityReport::passes`](super::QualityReport::passes) compares all six controls and
/// demands their evidence.
///
/// Every default is the most permissive value in its control's domain, so the default verdict gates
/// evidence presence rather than fidelity. Deployments impose measured bounds through an override
/// document that replaces individual defaults after domain validation ([`ThresholdOverrides`]).
// No serde derives. The derive macros cannot parse default field values, so the report carries the
// applied thresholds as typed fields instead of embedding this struct.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct QualityThresholds {
    /// Minimum recall floor.
    ///
    /// The permissive zero imposes none.
    pub minimum_recall: UnitFraction = UnitFraction::ZERO,
    /// Minimum trustworthiness floor.
    ///
    /// The permissive zero imposes none.
    pub minimum_trustworthiness: UnitFraction = UnitFraction::ZERO,
    /// Minimum continuity floor.
    ///
    /// The permissive zero imposes none.
    pub minimum_continuity: UnitFraction = UnitFraction::ZERO,
    /// Maximum intrusion-rate ceiling.
    ///
    /// The permissive one imposes none.
    pub maximum_intrusion_rate: UnitFraction = UnitFraction::ONE,
    /// Maximum density-distortion spread.
    ///
    /// The permissive `f32` maximum imposes no ceiling. The ceiling fails when the reading is
    /// absent - a demand for evidence that was never produced is a configuration contradiction,
    /// surfaced at the verdict.
    pub maximum_density_spread: NonNegative = PERMISSIVE_DENSITY_SPREAD,
    /// Minimum map-versus-representation triplet agreement floor.
    ///
    /// The permissive zero imposes no floor. The control still fails when triplet sampling is off.
    pub minimum_triplet_agreement: UnitFraction = UnitFraction::ZERO,
    /// A subgroup flags when its degradation exceeds this factor times the overall degradation.
    ///
    /// `2` is the normative subgroup rule: no important subgroup may suffer more than twice the
    /// overall degradation.
    pub subgroup_degradation_factor: f64 = DEFAULT_DEGRADATION_FACTOR,
    /// Subgroups with fewer anchors never flag.
    pub minimum_subgroup_anchors: usize = DEFAULT_MINIMUM_SUBGROUP_ANCHORS,
}

impl QualityThresholds {
    /// Applies an override document over these thresholds.
    ///
    /// A present field replaces its default after domain validation, and an absent field keeps the
    /// default.
    ///
    /// # Errors
    ///
    /// Returns the first override whose value lies outside its control's domain.
    pub(crate) fn with_overrides(
        mut self,
        overrides: &ThresholdOverrides,
    ) -> Result<Self, ThresholdDomainError> {
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
            // The domain check runs on the f64 value before narrowing. A negative underflow narrows
            // to -0.0 and a value barely above the f32 maximum rounds down onto it, so both must
            // refuse as written rather than as rounded.
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
