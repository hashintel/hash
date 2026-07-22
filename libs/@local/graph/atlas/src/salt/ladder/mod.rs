//! The condition ladder.
//!
//! One projected layout per relation-lens condition, aligned and measured against its neighbours.
//!
//! A generation may publish several coordinate fields, one per value of the relation-strength
//! condition; the ladder is that schedule with its cross-condition evidence. [`Conditions`] carries
//! the schedule, valid by construction: the first rung is the exact semantic baseline `0.0`, the
//! rungs ascend strictly, and every value is finite. The rung count is deliberately unbounded -
//! each rung costs one projection pass plus four alignment passes, so the schedule length is
//! configuration, not a format limit.
//!
//! [`measure_ladder`] derives each rung's evidence. Every rung aligns onto the baseline and onto
//! its predecessor with the unweighted Procrustes fit ([`Similarity::fit_uniform_par`]); the RMS
//! movement the alignment cannot explain is the rung's real geometric change, invariant under the
//! scale, rotation, and translation freedom the projector never promises to pin down. Two signals
//! summarize the ladder's health:
//!
//! - **monotonicity**: a rung's relation loss may exceed its predecessor's by at most the
//!   configured tolerance - strengthening the lens must not worsen how well relations are honoured;
//! - **distinguishability**: a rung's aligned movement against its predecessor must reach the
//!   configured floor - rungs that collapse onto their neighbour buy nothing.
//!
//! [`select_canonical`] names the rung that publishes as the canonical field: the configured
//! condition must be an exact member of the measured schedule and must have passed both criteria.
//! The canonical field itself is the rung's coordinates with its baseline alignment applied - all
//! rungs publish in one shared frame, the baseline's, so clients interpolate between conditions
//! without per-rung frame bookkeeping.
//!
//! Projection itself is the conditioned projector's inference (`salt/projector`), and the per-rung
//! relation loss is its frozen objective; both enter here as plain values, so the seam between the
//! stages stays artifact-level.

use alloc::borrow::Cow;
use core::{error::Error, fmt};

use crate::math::{Similarity, Vec2};

#[cfg(test)]
mod tests;

/// A rejected condition schedule.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ConditionsError {
    /// Fewer than two rungs: nothing to compare across.
    TooFew {
        /// Rungs offered.
        count: usize,
    },
    /// The first rung is not the exact semantic baseline `0.0`.
    BaselineNotZero {
        /// The offered first rung.
        value: f32,
    },
    /// A rung is not a finite number.
    NonFinite {
        /// Position of the rejected rung.
        index: usize,
        /// The offered value.
        value: f32,
    },
    /// A rung does not exceed its predecessor.
    Unordered {
        /// Position of the rejected rung.
        index: usize,
        /// The predecessor it fails to exceed.
        previous: f32,
        /// The offered value.
        value: f32,
    },
}

impl fmt::Display for ConditionsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::TooFew { count } => {
                write!(
                    formatter,
                    "a condition schedule needs at least two rungs, got {count}"
                )
            }
            Self::BaselineNotZero { value } => {
                write!(
                    formatter,
                    "the first rung must be the exact semantic baseline 0.0, got {value}"
                )
            }
            Self::NonFinite { index, value } => {
                write!(formatter, "rung {index} is not finite: {value}")
            }
            Self::Unordered {
                index,
                previous,
                value,
            } => {
                write!(
                    formatter,
                    "rung {index} ({value}) does not exceed its predecessor ({previous})"
                )
            }
        }
    }
}

impl Error for ConditionsError {}

/// A rejected ladder measurement input.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum LadderError {
    /// The field count does not match the schedule.
    FieldCount {
        /// Rungs in the schedule.
        conditions: usize,
        /// Fields offered.
        fields: usize,
    },
    /// A field's row count differs from the baseline field's.
    RowMismatch {
        /// Position of the rejected field.
        index: usize,
        /// The rejected field's row count.
        rows: usize,
        /// The baseline field's row count.
        expected: usize,
    },
    /// A field's relation loss is not finite.
    NonFiniteLoss {
        /// Position of the rejected field.
        index: usize,
        /// The offered loss.
        value: f64,
    },
    /// The distinguishability floor is not a positive finite number.
    InvalidFloor {
        /// The offered floor.
        value: f64,
    },
    /// The monotonicity tolerance is not a non-negative finite number.
    InvalidTolerance {
        /// The offered tolerance.
        value: f64,
    },
    /// A rung's field has no Procrustes alignment onto the compared field.
    ///
    /// Its points are coincident or the covariance cancels exactly.
    Degenerate {
        /// Position of the unalignable field.
        index: usize,
        /// Position of the field it was aligned against.
        against: usize,
    },
}

impl fmt::Display for LadderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::FieldCount { conditions, fields } => {
                write!(
                    formatter,
                    "the schedule has {conditions} rungs but {fields} fields were offered"
                )
            }
            Self::RowMismatch {
                index,
                rows,
                expected,
            } => {
                write!(
                    formatter,
                    "field {index} has {rows} rows; the baseline has {expected}"
                )
            }
            Self::NonFiniteLoss { index, value } => {
                write!(formatter, "field {index} has a non-finite loss: {value}")
            }
            Self::InvalidFloor { value } => {
                write!(
                    formatter,
                    "the distinguishability floor must be positive and finite, got {value}"
                )
            }
            Self::InvalidTolerance { value } => {
                write!(
                    formatter,
                    "the monotonicity tolerance must be non-negative and finite, got {value}"
                )
            }
            Self::Degenerate { index, against } => {
                write!(
                    formatter,
                    "field {index} has no similarity alignment onto field {against}"
                )
            }
        }
    }
}

impl Error for LadderError {}

/// A rejected canonical selection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum CanonicalError {
    /// The requested value is not a rung of the measured ladder.
    UnknownRung {
        /// The requested condition.
        value: f32,
    },
    /// The rung's relation loss rose beyond tolerance.
    ///
    /// Publishing it would worsen how well relations are honoured.
    Monotonicity {
        /// The requested condition.
        value: f32,
    },
    /// The rung collapsed onto its predecessor.
    ///
    /// Publishing it buys nothing over the neighbouring condition.
    Distinguishability {
        /// The requested condition.
        value: f32,
    },
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::UnknownRung { value } => {
                write!(formatter, "condition {value} is not a rung of the ladder")
            }
            Self::Monotonicity { value } => {
                write!(formatter, "rung {value} failed the monotonicity criterion")
            }
            Self::Distinguishability { value } => {
                write!(
                    formatter,
                    "rung {value} failed the distinguishability criterion"
                )
            }
        }
    }
}

impl Error for CanonicalError {}

/// A validated relation-lens condition schedule.
///
/// The invariants hold by construction: at least two rungs, the first bit-exactly `0.0` (the
/// semantic baseline every other rung is measured against; `-0.0` is rejected because the value
/// conditions the projector and enters reproducibility records bit-for-bit), strictly ascending,
/// every value finite. The values sit behind a [`Cow`] so the reference schedule is a constant.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Conditions {
    values: Cow<'static, [f32]>,
}

impl Conditions {
    /// The reference schedule: the baseline plus four evenly spaced rungs.
    ///
    /// An unvalidated starting point carried over from the legacy pipeline; the ladder's own
    /// distinguishability evidence revises it.
    pub(crate) const REFERENCE: Self = Self {
        values: Cow::Borrowed(&[0.0, 0.25, 0.5, 0.75, 1.0]),
    };

    /// Validates a condition schedule.
    ///
    /// # Errors
    ///
    /// Returns an error when fewer than two rungs are offered, the first rung is not bit-exactly
    /// `0.0`, a rung is not finite, or a rung does not strictly exceed its predecessor.
    pub(crate) fn new(values: impl Into<Cow<'static, [f32]>>) -> Result<Self, ConditionsError> {
        let values = values.into();
        if values.len() < 2 {
            return Err(ConditionsError::TooFew {
                count: values.len(),
            });
        }
        if values[0].to_bits() != 0.0_f32.to_bits() {
            return Err(ConditionsError::BaselineNotZero { value: values[0] });
        }

        let mut previous = None;
        for (index, &value) in values.iter().enumerate() {
            if !value.is_finite() {
                return Err(ConditionsError::NonFinite { index, value });
            }
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
    pub(crate) fn values(&self) -> &[f32] {
        &self.values
    }

    /// Returns the rung count; at least two by construction.
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
    pub relation_loss: f64,
}

/// Cross-condition measurement thresholds.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct MeasurementOptions {
    /// Minimum RMS movement against the preceding rung for a rung to count as distinguishable.
    ///
    /// Defaults to `1e-8`.
    // The default is an unvalidated starting point (legacy required the
    // value as config, setting no precedent); the canonical-selection
    // criteria revise it from evidence.
    pub distinguishability_floor: f64 = 1.0e-8,
    /// Slack by which a rung's relation loss may exceed its predecessor's.
    ///
    /// Within it the rung still counts as monotonic. Defaults to `0.05`.
    // Same provenance as the floor.
    pub monotonicity_tolerance: f64 = 0.05,
}

const impl Default for MeasurementOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// One fit's whole ladder configuration.
///
/// The schedule, the cross-condition thresholds, and the rung that publishes.
///
/// The canonical value names a schedule member bit-exactly ([`select_canonical`]); a value outside
/// the schedule is a configuration contradiction and fails the fit at selection.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LadderOptions {
    /// The condition schedule the ladder projects.
    pub conditions: Conditions = Conditions::REFERENCE,
    /// The cross-condition measurement thresholds.
    pub measurement: MeasurementOptions = MeasurementOptions::default(),
    /// The condition whose aligned field publishes as the canonical coordinates.
    ///
    /// Defaults to `1.0`, the full-strength lens, matching the reference pipeline's canonical
    /// condition.
    pub canonical: f32 = 1.0,
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
    pub condition: f32,
    /// The field's frozen relation loss, echoed from the input.
    pub relation_loss: f64,
    /// The similarity aligning the rung's field onto the baseline field.
    ///
    /// The identity for the baseline itself.
    pub alignment: Similarity,
    /// RMS movement against the baseline field after alignment.
    pub baseline_movement: f64,
    /// RMS movement against the preceding field after alignment.
    pub adjacent_movement: f64,
    /// Whether the relation loss stayed within tolerance of the preceding rung's.
    ///
    /// The baseline is monotonic by definition.
    pub monotonic: bool,
    /// Whether the adjacent movement reached the floor.
    ///
    /// The baseline is distinguishable by definition.
    pub distinguishable: bool,
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
/// Returns an error when a threshold is invalid, the field count does not match the schedule, a
/// field's rows differ from the baseline's, a relation loss is not finite, or a field admits no
/// similarity alignment (coincident points or an exactly cancelling covariance).
pub(crate) fn measure_ladder(
    conditions: &Conditions,
    fields: &[Field<'_>],
    options: MeasurementOptions,
) -> Result<Vec<RungMeasurement>, LadderError> {
    if !options.distinguishability_floor.is_finite() || options.distinguishability_floor <= 0.0 {
        return Err(LadderError::InvalidFloor {
            value: options.distinguishability_floor,
        });
    }
    if !options.monotonicity_tolerance.is_finite() || options.monotonicity_tolerance < 0.0 {
        return Err(LadderError::InvalidTolerance {
            value: options.monotonicity_tolerance,
        });
    }

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
        if !field.relation_loss.is_finite() {
            return Err(LadderError::NonFiniteLoss {
                index,
                value: field.relation_loss,
            });
        }
    }

    let baseline = fields[0].coordinates;
    let mut measurements = Vec::with_capacity(fields.len());
    let mut previous_loss = None;
    for (index, (&condition, field)) in conditions.values().iter().zip(fields).enumerate() {
        let (alignment, baseline_movement, adjacent_movement) = if index == 0 {
            (Similarity::IDENTITY, 0.0, 0.0)
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

        let monotonic = previous_loss.is_none_or(|previous: f64| {
            field.relation_loss <= previous + options.monotonicity_tolerance
        });
        let distinguishable = index == 0 || adjacent_movement >= options.distinguishability_floor;

        measurements.push(RungMeasurement {
            condition,
            relation_loss: field.relation_loss,
            alignment,
            baseline_movement,
            adjacent_movement,
            monotonic,
            distinguishable,
        });
        previous_loss = Some(field.relation_loss);
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
/// The value must be an exact (bit-level) member of the measured schedule - the canonical condition
/// is configuration naming a rung, not an interpolation point - and the rung's evidence must pass
/// both cross-condition criteria. The baseline rung always passes: both criteria hold for it by
/// definition.
///
/// # Errors
///
/// Returns an error when the value names no rung or the named rung failed monotonicity or
/// distinguishability.
pub(crate) fn select_canonical(
    measurements: &[RungMeasurement],
    value: f32,
) -> Result<CanonicalSelection<'_>, CanonicalError> {
    let (index, measurement) = measurements
        .iter()
        .enumerate()
        .find(|(_, measurement)| measurement.condition.to_bits() == value.to_bits())
        .ok_or(CanonicalError::UnknownRung { value })?;

    if !measurement.monotonic {
        return Err(CanonicalError::Monotonicity { value });
    }
    if !measurement.distinguishable {
        return Err(CanonicalError::Distinguishability { value });
    }

    Ok(CanonicalSelection { index, measurement })
}

/// Fits the alignment of `source` onto `target` and measures the RMS movement it cannot explain.
///
/// Returns [`None`] when the fit rejects the pair (coincident points or an exactly cancelling
/// covariance); the residual of a successful fit over validated fields is always finite.
fn aligned_movement(source: &[Vec2], target: &[Vec2]) -> Option<(Similarity, f64)> {
    let alignment = Similarity::fit_uniform_par(source, target)?;
    let movement = alignment
        .rms_residual_par(source, target)
        .expect("residuals of a fitted alignment over finite fields are finite");

    Some((alignment, movement))
}
