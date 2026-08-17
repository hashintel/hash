//! The condition ladder.
//!
//! One projected layout per relation-lens condition, aligned and measured against its neighbours.
//!
//! A generation publishes one coordinate field, the configured canonical rung's layout aligned into
//! the baseline frame. Every other rung is a measurement counterfactual (the same jointly trained
//! model projected at a different lens strength) that persists as evidence and never publishes as
//! the coordinate field.
//!
//! [`Conditions`] carries the schedule, valid by construction. The first rung is the zero-condition
//! value `0.0`, the jointly trained model with the lens off rather than a relation-free model
//! trained on its own. The rungs ascend strictly and every value is finite. The rung count has no
//! upper bound. Each rung costs one projection pass plus four alignment passes, so the schedule
//! length is configuration rather than a format limit.
//!
//! [`measure_ladder`] derives each rung's evidence. Every rung aligns onto the baseline and onto
//! its predecessor with the unweighted Procrustes fit ([`Similarity::fit_uniform_par`]); the RMS
//! movement the alignment cannot explain is the rung's real geometric change, invariant under the
//! scale, rotation, and translation freedom the projector never promises to pin down. The
//! measurements are diagnostics: they persist as evidence and surface as structured log events, and
//! they never gate publication.
//!
//! [`select_canonical`] names the rung that publishes as the canonical field. The configured
//! condition names an exact member of the measured schedule, so configuration picks a rung rather
//! than an interpolation point.
//!
//! Projection itself is the conditioned projector's inference (`salt/projector`), and the per-rung
//! relation loss is its frozen objective; both enter here as constructed domain values, so the
//! seam between the stages stays artifact-level.

use alloc::borrow::Cow;

use crate::math::{DNonNegative, NonNegative, Similarity, Vec2};

mod error;
pub(crate) mod paired;
pub(crate) mod report;
#[cfg(test)]
mod tests;

pub(crate) use self::error::{CanonicalError, ConditionsError, LadderError};

/// A validated relation-lens condition schedule.
///
/// Construction validates the schedule. A schedule has at least two rungs. The first rung is the
/// zero-condition rung that every other rung measures against. The rungs ascend strictly, and
/// every value is finite and non-negative with a canonical sign of zero by construction
/// ([`NonNegative`]), so a rung's bits identify its value in reproducibility records with no
/// `-0.0` alias to guard against. A [`Cow`] carries the values so the reference schedule is a
/// constant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Conditions {
    values: Cow<'static, [NonNegative]>,
}

impl Conditions {
    /// The reference schedule, the baseline plus four evenly spaced rungs.
    ///
    /// An unvalidated starting point carried over from the legacy pipeline. The ladder's own
    /// movement evidence revises it.
    pub(crate) const REFERENCE: Self = Self {
        values: Cow::Borrowed(&[
            NonNegative::new_unchecked(0.0),
            NonNegative::new_unchecked(0.25),
            NonNegative::new_unchecked(0.5),
            NonNegative::new_unchecked(0.75),
            NonNegative::new_unchecked(1.0),
        ]),
    };

    /// Validates a condition schedule.
    ///
    /// # Errors
    ///
    /// Returns an error when the schedule has fewer than two rungs, the first rung is not zero,
    /// or a rung does not strictly exceed its predecessor.
    pub(crate) fn new(
        values: impl Into<Cow<'static, [NonNegative]>>,
    ) -> Result<Self, ConditionsError> {
        let values = values.into();
        if values.len() < 2 {
            return Err(ConditionsError::TooFew {
                count: values.len(),
            });
        }

        if !values[0].is_zero() {
            return Err(ConditionsError::BaselineNotZero { value: values[0] });
        }

        let mut previous = None;
        for (index, &value) in values.iter().enumerate() {
            if let Some(previous) = previous
                && value <= previous
            {
                return Err(ConditionsError::Unordered {
                    index,
                    previous,
                    value,
                });
            }

            previous = Some(value);
        }

        Ok(Self { values })
    }

    /// Returns the rungs in ascending order, the baseline first.
    #[inline]
    #[must_use]
    pub(crate) fn values(&self) -> &[NonNegative] {
        &self.values
    }

    /// Returns the rung count, which is at least two by construction.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.values.len()
    }
}

const impl Default for Conditions {
    fn default() -> Self {
        Self::REFERENCE
    }
}

/// One rung's projected field with its frozen relation loss.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Field<'coordinates> {
    /// The rung's projected coordinates, row-aligned with every other rung's.
    pub coordinates: &'coordinates [Vec2],
    /// The field's frozen attraction-energy loss.
    ///
    /// Computed by the projector objective at projection time.
    pub relation_loss: DNonNegative,
}

/// One fit's whole ladder configuration.
///
/// The schedule and the rung that publishes.
///
/// The canonical value names a schedule member exactly ([`select_canonical`]): equality on
/// [`NonNegative`] is bit equality. A value outside the schedule is a configuration
/// contradiction, and [`Self::canonical_index`] decides the membership from the options alone,
/// so a fit refuses the contradiction before it trains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LadderOptions {
    /// The condition schedule the ladder projects.
    pub conditions: Conditions = Conditions::REFERENCE,
    /// The condition whose aligned field publishes as the canonical coordinates.
    ///
    /// `1.0` is the full-strength lens, matching the reference pipeline's canonical condition.
    pub canonical: NonNegative = NonNegative::ONE,
}

impl LadderOptions {
    /// Returns the canonical rung's position in the schedule.
    ///
    /// The canonical value names a schedule member exactly, so the index exists exactly when
    /// the configuration is self-consistent. The membership is a property of the options alone,
    /// decidable before any rung projects.
    ///
    /// # Errors
    ///
    /// Returns an error when the canonical value names no rung of the schedule.
    pub(crate) fn canonical_index(&self) -> Result<usize, CanonicalError> {
        self.conditions
            .values()
            .iter()
            .position(|&condition| condition == self.canonical)
            .ok_or(CanonicalError::UnknownRung {
                value: self.canonical,
            })
    }
}

const impl Default for LadderOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// One rung's cross-condition evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RungMeasurement {
    /// The rung's condition value.
    pub condition: NonNegative,
    /// The field's frozen relation loss, echoed from the input.
    pub relation_loss: DNonNegative,
    /// The similarity aligning the rung's field onto the baseline field.
    ///
    /// The identity for the baseline itself.
    pub alignment: Similarity,
    /// RMS movement against the baseline field after alignment.
    pub baseline_movement: DNonNegative,
    /// RMS movement against the preceding field after alignment.
    pub adjacent_movement: DNonNegative,
}

/// Aligns and measures a condition ladder.
///
/// `fields[i]` is the projection of the whole corpus at `conditions.values()[i]`; rows correspond
/// across fields. Each non-baseline rung fits its alignment onto the baseline and onto its
/// predecessor in parallel, and the returned measurements carry one entry per rung in schedule
/// order.
///
/// # Errors
///
/// Returns an error when the field count does not match the schedule, a field's rows differ from
/// the baseline's, or a field admits no similarity alignment (coincident points or an exactly
/// cancelling covariance).
pub(crate) fn measure_ladder(
    conditions: &Conditions,
    fields: &[Field<'_>],
) -> Result<Vec<RungMeasurement>, LadderError> {
    if fields.len() != conditions.len() {
        return Err(LadderError::FieldCount {
            conditions: conditions.len(),
            fields: fields.len(),
        });
    }

    let rows = fields[0].coordinates.len();
    for (index, field) in fields.iter().enumerate() {
        if field.coordinates.len() != rows {
            return Err(LadderError::RowMismatch {
                index,
                rows: field.coordinates.len(),
                expected: rows,
            });
        }
    }

    let baseline = fields[0].coordinates;
    let mut measurements = Vec::with_capacity(fields.len());
    for (index, (&condition, field)) in conditions.values().iter().zip(fields).enumerate() {
        let (alignment, baseline_movement, adjacent_movement) = if index == 0 {
            (Similarity::IDENTITY, DNonNegative::ZERO, DNonNegative::ZERO)
        } else {
            let against_baseline = aligned_movement(field.coordinates, baseline)
                .ok_or(LadderError::Degenerate { index, against: 0 })?;
            let against_previous =
                aligned_movement(field.coordinates, fields[index - 1].coordinates).ok_or(
                    LadderError::Degenerate {
                        index,
                        against: index - 1,
                    },
                )?;
            (against_baseline.0, against_baseline.1, against_previous.1)
        };

        measurements.push(RungMeasurement {
            condition,
            relation_loss: field.relation_loss,
            alignment,
            baseline_movement,
            adjacent_movement,
        });
    }

    Ok(measurements)
}

/// The rung authorized to publish as the canonical field.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CanonicalSelection<'ladder> {
    /// The rung's position in the schedule.
    ///
    /// The index of its coordinate field among the ladder's per-rung artifacts.
    pub index: usize,
    /// The rung's measurement.
    ///
    /// Its [`RungMeasurement::alignment`] maps the field into the baseline frame, and applying it
    /// row by row is the canonical field's production.
    pub measurement: &'ladder RungMeasurement,
}

/// Selects the rung publishing as the canonical field.
///
/// The value must be an exact member of the measured schedule, so the canonical condition names
/// an existing rung. Equality on [`NonNegative`] is bit equality.
///
/// # Errors
///
/// Returns an error when the value names no rung.
pub(crate) fn select_canonical(
    measurements: &[RungMeasurement],
    value: NonNegative,
) -> Result<CanonicalSelection<'_>, CanonicalError> {
    let (index, measurement) = measurements
        .iter()
        .enumerate()
        .find(|(_, measurement)| measurement.condition == value)
        .ok_or(CanonicalError::UnknownRung { value })?;

    Ok(CanonicalSelection { index, measurement })
}

/// Fits the alignment of `source` onto `target` and measures the RMS movement it cannot explain.
///
/// Returns [`None`] when the fit rejects the pair (coincident points or an exactly cancelling
/// covariance). The residual of a successful fit over validated fields is always finite.
fn aligned_movement(source: &[Vec2], target: &[Vec2]) -> Option<(Similarity, DNonNegative)> {
    let alignment = Similarity::fit_uniform_par(source, target)?;
    let movement = alignment
        .rms_residual_par(source, target)
        .expect("an RMS residual of a fitted alignment over finite fields is finite");

    Some((alignment, movement))
}
