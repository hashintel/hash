//! Projected layouts across relation-lens conditions, aligned for comparison.
//!
//! A generation publishes one coordinate field: the configured canonical step's layout aligned into
//! the baseline frame. Every other step is a measurement counterfactual, the same jointly trained
//! [projector](crate::salt::projector) evaluated at a different lens strength. Its measurements
//! persist as evidence, and its coordinates never publish as the canonical field.
//!
//! [`Conditions`] defines the zero-condition step at `0.0`, with relation conditioning disabled in
//! the jointly trained model. This baseline is not a separately trained relation-free model. The
//! steps ascend strictly and every value is finite. The schedule has no configured step-count cap.
//! Projection evaluates every step. Each non-baseline measurement then traverses the paired fields
//! for two fits and two residuals. The baseline's alignment is the identity and both of its
//! movements are zero.
//!
//! [`measure_ladder`] fits each non-baseline field onto the baseline and separately onto its
//! predecessor using unweighted, orientation-preserving Procrustes alignment
//! ([`Similarity::fit_uniform_par`]). For source points sᵢ and target points tᵢ over N
//! corresponding rows, the model chooses scale a > 0, rotation R and translation b to minimize Σᵢ
//! ‖aR sᵢ + b − tᵢ‖². Movement is √(Σᵢ ‖aR sᵢ + b − tᵢ‖²/N). It measures residual deformation after
//! removing the source's global similarity freedom, in the target frame's units. Scaling the target
//! scales this residual, and reflections remain outside the fit family.
//!
//! Fits accumulate moments in `f64` and narrow their coefficients to `f32`. Residuals apply the
//! widened coefficients in `f64`. Rounding, cancellation and parallel summation limit exact
//! invariance and bitwise repeatability. A field can fail alignment despite having finite
//! coordinates. Measurement errors abort this operation. Successful movement and loss values are
//! diagnostics, with no acceptance threshold here.
//!
//! [`select_canonical`] selects the configured condition by exact membership, without interpolation
//! or a quality-based choice. Projection and frozen relation-loss evaluation happen before
//! [`Field`] construction. This module checks field counts and lengths, while row correspondence
//! and common model provenance remain input requirements.

use alloc::borrow::Cow;

use hashql_core::id::Id;

use crate::math::{DNonNegative, FinitePointField, NonNegative, Similarity};

mod error;
pub(crate) mod paired;
pub(crate) mod report;
#[cfg(test)]
mod tests;

pub(crate) use self::error::{CanonicalError, ConditionsError, LadderError};

/// A relation-lens schedule awaiting length, baseline and ordering checks.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct UnvalidatedConditions(Cow<'static, [NonNegative]>);

impl TryFrom<UnvalidatedConditions> for Conditions {
    type Error = ConditionsError;

    fn try_from(UnvalidatedConditions(values): UnvalidatedConditions) -> Result<Self, Self::Error> {
        Self::new(values)
    }
}

impl From<Conditions> for UnvalidatedConditions {
    fn from(conditions: Conditions) -> Self {
        Self(conditions.values)
    }
}

/// A validated relation-lens condition schedule.
///
/// A schedule has at least two steps and opens at the zero-condition step, `0.0`. Every later value
/// strictly exceeds its predecessor. [`NonNegative`] supplies finite, non-negative values with
/// canonical positive zero: a step's bits identify its value without a `-0.0` alias.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "UnvalidatedConditions", into = "UnvalidatedConditions")]
pub(crate) struct Conditions {
    values: Cow<'static, [NonNegative]>,
}

impl Conditions {
    /// The reference schedule, the baseline plus four evenly spaced steps.
    ///
    /// The values are structurally valid. Their spacing is an uncalibrated starting point to
    /// revisit using the ladder's movement evidence.
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
    /// Returns [`ConditionsError`] when the values violate the schedule's minimum length, baseline
    /// or ordering.
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

    /// Returns the steps in ascending order, the baseline first.
    #[inline]
    #[must_use]
    pub(crate) fn values(&self) -> &[NonNegative] {
        &self.values
    }

    /// Returns the step count, which is at least two by construction.
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

/// One step's projected field with its frozen relation loss.
///
/// `I` is the step frames' shared row domain. Coordinates must obey [`FinitePointField`]'s
/// finiteness contract, and each row must identify the same subject in every field. The field does
/// not validate the relationship between coordinates and loss.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Field<'coordinates, I> {
    /// The step's projected coordinates, row-aligned with every other step's.
    pub coordinates: &'coordinates FinitePointField<I>,
    /// The field's frozen attraction-energy loss.
    ///
    /// Computed by the projector objective at projection time.
    pub relation_loss: DNonNegative,
}

/// The projection schedule and the condition selected for canonical coordinates.
///
/// The canonical value must name a schedule member exactly: equality on [`NonNegative`] is bit
/// equality. Use [`Self::canonical_index`] to check membership before projection.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LadderOptions {
    /// The condition schedule, [`Conditions::REFERENCE`] by default.
    pub conditions: Conditions = Conditions::REFERENCE,
    /// The condition whose aligned field publishes as the canonical coordinates.
    ///
    /// The full-strength condition `1.0` by default.
    pub canonical: NonNegative = NonNegative::ONE,
}

const impl Default for LadderOptions {
    fn default() -> Self {
        Self { .. }
    }
}

impl LadderOptions {
    /// Returns the canonical step's position in the schedule.
    ///
    /// Membership depends only on these options and can be checked before projection.
    ///
    /// # Errors
    ///
    /// Returns [`CanonicalError`] when the canonical value names no schedule member.
    pub(crate) fn canonical_index(&self) -> Result<usize, CanonicalError> {
        canonical_position(self.conditions.values().iter().copied(), self.canonical)
    }
}

/// Returns the position of the canonical `value` among `conditions`.
///
/// Returns the first match using [`NonNegative`]'s bit equality.
///
/// # Errors
///
/// Returns [`CanonicalError`] when no condition matches `value`.
fn canonical_position(
    mut conditions: impl Iterator<Item = NonNegative>,
    value: NonNegative,
) -> Result<usize, CanonicalError> {
    conditions
        .position(|condition| condition == value)
        .ok_or(CanonicalError::UnknownStep { value })
}

/// One step's cross-condition evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct StepMeasurement {
    /// The step's condition value.
    pub condition: NonNegative,
    /// The field's frozen relation loss, echoed from the input.
    pub relation_loss: DNonNegative,
    /// The similarity aligning the step's field onto the baseline field.
    ///
    /// The identity for the baseline itself.
    pub alignment: Similarity,
    /// RMS movement after alignment onto the baseline, in baseline-frame units.
    pub baseline_movement: DNonNegative,
    /// RMS movement after alignment onto the predecessor, in predecessor-frame units.
    pub adjacent_movement: DNonNegative,
}

/// Aligns and measures a condition ladder.
///
/// `fields[i]` must be the whole-corpus projection at `conditions.values()[i]`, with corresponding
/// rows across every field. Non-baseline steps fit onto the baseline and then onto their
/// predecessor. Each fit and residual uses parallel reductions. The result has one measurement per
/// step in schedule order and echoes every supplied loss without recomputing it.
///
/// # Complexity
///
/// O(SN) work and O(S) result storage for S steps of N rows, excluding the already supplied
/// coordinate fields.
///
/// # Errors
///
/// Returns [`LadderError`] for field-count or row-count disagreement, or when a similarity fit
/// rejects a pair.
pub(crate) fn measure_ladder<I: Id>(
    conditions: &Conditions,
    fields: &[Field<'_, I>],
) -> Result<Vec<StepMeasurement>, LadderError> {
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

        measurements.push(StepMeasurement {
            condition,
            relation_loss: field.relation_loss,
            alignment,
            baseline_movement,
            adjacent_movement,
        });
    }

    Ok(measurements)
}

/// The selected step's position and baseline alignment.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CanonicalSelection<'ladder> {
    /// The step's position in the schedule.
    ///
    /// The index of its coordinate field among the ladder's per-step artifacts.
    pub index: usize,
    /// The step's measurement.
    ///
    /// Its [`StepMeasurement::alignment`] maps the field into the baseline frame, and applying it
    /// row by row is the canonical field's production.
    pub measurement: &'ladder StepMeasurement,
}

/// Selects the step publishing as the canonical field.
///
/// The value must be an exact member of `measurements`. Equality on [`NonNegative`] is bit
/// equality. This returns the first matching entry without checking schedule order, row
/// correspondence or measurement quality.
///
/// # Errors
///
/// Returns [`CanonicalError`] when the value names no step.
pub(crate) fn select_canonical(
    measurements: &[StepMeasurement],
    value: NonNegative,
) -> Result<CanonicalSelection<'_>, CanonicalError> {
    let index = canonical_position(
        measurements.iter().map(|measurement| measurement.condition),
        value,
    )?;

    Ok(CanonicalSelection {
        index,
        measurement: &measurements[index],
    })
}

/// Fits `source` onto `target` and measures the residual in target-frame units.
///
/// Returns [`None`] when [`Similarity::fit_uniform_par`] rejects the pair, including length
/// disagreement, fewer than two rows, unusable rounded moments or unrepresentable coefficients. A
/// successful fit establishes the equal, nonempty fields and finite coefficients required by the
/// residual.
fn aligned_movement<I: Id>(
    source: &FinitePointField<I>,
    target: &FinitePointField<I>,
) -> Option<(Similarity, DNonNegative)> {
    let alignment = Similarity::fit_uniform_par(source, target)?;
    let movement = alignment.rms_residual_par(source, target);

    Some((alignment, movement))
}
