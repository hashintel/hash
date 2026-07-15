use core::{error::Error, fmt};

use super::{ConditionDomain, ConditionEvidence, ConditionLadder, EvaluationError};
use crate::salt::{
    alignment::{AlignmentError, SimilarityTransform, fit_similarity},
    graph::KnnTable,
    hash::{ContentHash, ContentHasher},
    projector::{LocalScales, RelationEnergy, local_scales},
    relation::AttractionEdge,
};

/// Disposable coordinate field and externally computed map-quality evidence.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ConditionField<'field> {
    pub condition: f64,
    pub coordinates: &'field [[f64; 2]],
    pub upstream_report: ContentHash,
}

/// Cross-condition numerical thresholds.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ConditionMeasurementConfig {
    pub distinguishability_floor: f64,
    pub monotonicity_tolerance: f64,
}

/// Measured disposable evidence for one condition.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ConditionMeasurement {
    pub condition: f64,
    pub relation_loss: f64,
    /// RMS movement after alignment to the first condition.
    pub aligned_rms_movement: f64,
    /// RMS movement after alignment to the immediately preceding condition.
    pub adjacent_rms_movement: f64,
    pub alignment: Option<SimilarityTransform>,
    pub report: ContentHash,
}

/// Invalid coordinate ladder or relation measurement.
#[derive(Debug)]
pub(crate) enum ConditionMeasurementError {
    TooFewFields,
    InvalidConfig {
        field: &'static str,
        value: f64,
    },
    CoordinateRows {
        expected: usize,
        actual: usize,
        index: usize,
    },
    RelationRow {
        row: u32,
        rows: usize,
    },
    Alignment(AlignmentError),
    Objective(crate::salt::projector::ObjectiveError),
    Ladder(EvaluationError),
}

impl fmt::Display for ConditionMeasurementError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooFewFields => {
                formatter.write_str("condition measurement requires at least two fields")
            }
            Self::InvalidConfig { field, value } => {
                write!(
                    formatter,
                    "condition measurement field {field} is invalid: {value}"
                )
            }
            Self::CoordinateRows {
                expected,
                actual,
                index,
            } => write!(
                formatter,
                "condition field {index} has {actual} coordinate rows; expected {expected}"
            ),
            Self::RelationRow { row, rows } => {
                write!(
                    formatter,
                    "relation row {row} is outside {rows} coordinates"
                )
            }
            Self::Alignment(error) => error.fmt(formatter),
            Self::Objective(error) => error.fmt(formatter),
            Self::Ladder(error) => error.fmt(formatter),
        }
    }
}

impl Error for ConditionMeasurementError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Alignment(error) => Some(error),
            Self::Objective(error) => Some(error),
            Self::Ladder(error) => Some(error),
            Self::TooFewFields
            | Self::InvalidConfig { .. }
            | Self::CoordinateRows { .. }
            | Self::RelationRow { .. } => None,
        }
    }
}

impl From<AlignmentError> for ConditionMeasurementError {
    #[inline]
    fn from(error: AlignmentError) -> Self {
        Self::Alignment(error)
    }
}

impl From<crate::salt::projector::ObjectiveError> for ConditionMeasurementError {
    #[inline]
    fn from(error: crate::salt::projector::ObjectiveError) -> Self {
        Self::Objective(error)
    }
}

impl From<EvaluationError> for ConditionMeasurementError {
    #[inline]
    fn from(error: EvaluationError) -> Self {
        Self::Ladder(error)
    }
}

/// Aligns and measures a bounded condition ladder.
///
/// Relation monotonicity compares total frozen attraction energy with the
/// preceding rung. Distinguishability is the all-row RMS movement after proper
/// similarity alignment to the immediately preceding field; movement from the
/// first field is retained separately for diagnostics.
///
/// # Errors
///
/// This returns an error for inconsistent shapes, invalid thresholds, relation
/// endpoints outside the field, alignment failure, objective failure, or an
/// invalid condition ladder.
pub(crate) fn measure_condition_ladder(
    domain: ConditionDomain,
    fields: &[ConditionField<'_>],
    relations: &[AttractionEdge],
    semantic: &KnnTable,
    relation_energy: RelationEnergy,
    config: ConditionMeasurementConfig,
) -> Result<(ConditionLadder, Vec<ConditionMeasurement>), ConditionMeasurementError> {
    if fields.len() < 2 {
        return Err(ConditionMeasurementError::TooFewFields);
    }
    for (field, value, positive) in [
        (
            "distinguishability-floor",
            config.distinguishability_floor,
            true,
        ),
        (
            "monotonicity-tolerance",
            config.monotonicity_tolerance,
            false,
        ),
    ] {
        if !value.is_finite() || value.is_sign_negative() || (positive && value == 0.0) {
            return Err(ConditionMeasurementError::InvalidConfig { field, value });
        }
    }
    let rows = fields[0].coordinates.len();
    for (index, field) in fields.iter().enumerate() {
        if field.coordinates.len() != rows {
            return Err(ConditionMeasurementError::CoordinateRows {
                expected: rows,
                actual: field.coordinates.len(),
                index,
            });
        }
    }
    for relation in relations {
        for row in [relation.left, relation.right] {
            if row.as_usize() >= rows {
                return Err(ConditionMeasurementError::RelationRow {
                    row: row.as_u32(),
                    rows,
                });
            }
        }
    }
    let weights = vec![1.0; rows];
    let baseline = fields[0].coordinates;
    let mut previous_loss = None;
    let mut candidates = Vec::with_capacity(fields.len());
    let mut measurements = Vec::with_capacity(fields.len());
    for (index, field) in fields.iter().enumerate() {
        let (alignment, movement) = if index == 0 {
            (None, 0.0)
        } else {
            let alignment = fit_similarity(field.coordinates, baseline, &weights)?;
            let movement = aligned_rms(field.coordinates, baseline, alignment);
            (Some(alignment), movement)
        };
        let adjacent_movement = if index == 0 {
            0.0
        } else {
            let previous = fields[index - 1].coordinates;
            aligned_rms(
                field.coordinates,
                previous,
                fit_similarity(field.coordinates, previous, &weights)?,
            )
        };
        let relation_loss = relation_loss(
            field.coordinates,
            relations,
            &local_scales(field.coordinates, semantic)?,
            relation_energy,
        )?;
        let monotonicity = previous_loss
            .is_none_or(|previous| relation_loss <= previous + config.monotonicity_tolerance);
        let distinguishability = index == 0 || adjacent_movement >= config.distinguishability_floor;
        let report = measurement_hash(MeasurementIdentity {
            domain,
            config,
            relation_energy,
            field,
            relation_loss,
            aligned_movement: movement,
            adjacent_movement,
            alignment,
            monotonicity,
            distinguishability,
        });
        candidates.push((
            field.condition,
            ConditionEvidence {
                monotonicity,
                distinguishability,
                report,
            },
        ));
        measurements.push(ConditionMeasurement {
            condition: field.condition,
            relation_loss,
            aligned_rms_movement: movement,
            adjacent_rms_movement: adjacent_movement,
            alignment,
            report,
        });
        previous_loss = Some(relation_loss);
    }
    Ok((ConditionLadder::new(domain, candidates)?, measurements))
}

/// Measures relation energy over one materialization-ready coordinate field.
///
/// Local semantic scales are recomputed from the supplied coordinates, so the
/// result describes that exact field rather than an earlier projector output.
///
/// # Errors
///
/// This returns an error for a relation endpoint outside the field or when the
/// scale or relation objective produces a non-finite value.
pub(crate) fn measure_persisted_relation_loss(
    coordinates: &[[f64; 2]],
    relations: &[AttractionEdge],
    semantic: &KnnTable,
    energy: RelationEnergy,
) -> Result<f64, ConditionMeasurementError> {
    for relation in relations {
        for row in [relation.left, relation.right] {
            if row.as_usize() >= coordinates.len() {
                return Err(ConditionMeasurementError::RelationRow {
                    row: row.as_u32(),
                    rows: coordinates.len(),
                });
            }
        }
    }
    relation_loss(
        coordinates,
        relations,
        &local_scales(coordinates, semantic)?,
        energy,
    )
    .map_err(Into::into)
}

fn relation_loss(
    coordinates: &[[f64; 2]],
    relations: &[AttractionEdge],
    local_scales: &LocalScales,
    energy: RelationEnergy,
) -> Result<f64, crate::salt::projector::ObjectiveError> {
    relations.iter().try_fold(0.0, |total, edge| {
        let left = coordinates[edge.left.as_usize()];
        let right = coordinates[edge.right.as_usize()];
        let distance = (left[0] - right[0]).hypot(left[1] - right[1]);
        let normalized = energy.normalized_distance(
            distance,
            local_scales.as_slice()[edge.left.as_usize()],
            local_scales.as_slice()[edge.right.as_usize()],
        )?;
        let total = total + energy.attraction_loss(normalized, *edge)?;
        if total.is_finite() {
            Ok(total)
        } else {
            Err(crate::salt::projector::ObjectiveError::NonFiniteLoss)
        }
    })
}

struct MeasurementIdentity<'field> {
    domain: ConditionDomain,
    config: ConditionMeasurementConfig,
    relation_energy: RelationEnergy,
    field: &'field ConditionField<'field>,
    relation_loss: f64,
    aligned_movement: f64,
    adjacent_movement: f64,
    alignment: Option<SimilarityTransform>,
    monotonicity: bool,
    distinguishability: bool,
}

fn measurement_hash(identity: MeasurementIdentity<'_>) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.condition-measurement.v3");
    hasher.update(identity.domain.version().as_bytes());
    hasher.update(
        &identity
            .config
            .distinguishability_floor
            .to_bits()
            .to_le_bytes(),
    );
    hasher.update(
        &identity
            .config
            .monotonicity_tolerance
            .to_bits()
            .to_le_bytes(),
    );
    hasher.update(identity.relation_energy.content_hash().as_bytes());
    hasher.update(&identity.field.condition.to_bits().to_le_bytes());
    hasher.update(&identity.relation_loss.to_bits().to_le_bytes());
    hasher.update(&identity.aligned_movement.to_bits().to_le_bytes());
    hasher.update(&identity.adjacent_movement.to_bits().to_le_bytes());
    hasher.update(&[
        u8::from(identity.monotonicity),
        u8::from(identity.distinguishability),
    ]);
    if let Some(alignment) = identity.alignment {
        for value in [
            alignment.scale(),
            alignment.rotation()[0],
            alignment.rotation()[1],
            alignment.translation()[0],
            alignment.translation()[1],
        ] {
            hasher.update(&value.to_bits().to_le_bytes());
        }
    }
    hasher.update(identity.field.upstream_report.as_bytes());
    hasher.finish()
}

#[expect(
    clippy::cast_precision_loss,
    reason = "generation row counts remain exactly representable for RMS normalization"
)]
fn aligned_rms(source: &[[f64; 2]], target: &[[f64; 2]], alignment: SimilarityTransform) -> f64 {
    let squared = source
        .iter()
        .zip(target)
        .map(|(&source, &target)| {
            let aligned = alignment.apply(source);
            (aligned[0] - target[0])
                .mul_add(aligned[0] - target[0], (aligned[1] - target[1]).powi(2))
        })
        .sum::<f64>();
    (squared / source.len() as f64).sqrt()
}
