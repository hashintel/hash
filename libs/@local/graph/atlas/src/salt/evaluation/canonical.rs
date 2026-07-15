use super::{
    CanonicalCondition, ConditionField, ConditionLadder, ConditionMeasurement, EvaluationError,
};
use crate::salt::{
    alignment::SimilarityTransform,
    hash::{ContentHash, ContentHasher},
};

/// One aligned coordinate field authorized for immutable materialization.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CanonicalField {
    selection: CanonicalCondition,
    coordinates: Vec<[f64; 2]>,
    alignment: Option<SimilarityTransform>,
    content_hash: ContentHash,
}

impl CanonicalField {
    /// Returns the selected condition and its evaluation authority.
    #[must_use]
    #[inline]
    pub(crate) const fn selection(&self) -> CanonicalCondition {
        self.selection
    }

    /// Borrows coordinates aligned to the zero-condition reference field.
    #[must_use]
    #[inline]
    pub(crate) fn coordinates(&self) -> &[[f64; 2]] {
        &self.coordinates
    }

    /// Returns the similarity transform applied before materialization.
    #[must_use]
    #[inline]
    pub(crate) const fn alignment(&self) -> Option<SimilarityTransform> {
        self.alignment
    }

    /// Returns the aligned coordinate-field identity.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Selects and aligns one passing field from an evaluated condition ladder.
///
/// The condition's measured similarity transform maps it into the reference
/// field's coordinate frame. Its evaluation report is checked against the
/// selection authority before any coordinates are copied.
///
/// # Errors
///
/// This returns an error when selection fails, the selected condition is
/// absent from the supplied fields or measurements, or its report differs
/// from the ladder's evidence.
pub(crate) fn canonical_field(
    ladder: &ConditionLadder,
    fields: &[ConditionField<'_>],
    measurements: &[ConditionMeasurement],
    value: f64,
) -> Result<CanonicalField, EvaluationError> {
    let selection = ladder.select_canonical(value)?;
    let field = fields
        .iter()
        .find(|field| field.condition.to_bits() == value.to_bits())
        .ok_or(EvaluationError::MissingCanonicalField { value })?;
    let measurement = measurements
        .iter()
        .find(|measurement| measurement.condition.to_bits() == value.to_bits())
        .ok_or(EvaluationError::MissingCanonicalMeasurement { value })?;
    if selection.evidence() != measurement.report {
        return Err(EvaluationError::CanonicalReportMismatch {
            expected: selection.evidence(),
            actual: measurement.report,
        });
    }

    let coordinates = field
        .coordinates
        .iter()
        .map(|&coordinate| {
            measurement
                .alignment
                .map_or(coordinate, |alignment| alignment.apply(coordinate))
        })
        .collect::<Vec<_>>();
    let content_hash = field_hash(selection, measurement.alignment, &coordinates);
    Ok(CanonicalField {
        selection,
        coordinates,
        alignment: measurement.alignment,
        content_hash,
    })
}

fn field_hash(
    selection: CanonicalCondition,
    alignment: Option<SimilarityTransform>,
    coordinates: &[[f64; 2]],
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.canonical-field.v1");
    hasher.update(&selection.condition().get().to_bits().to_le_bytes());
    hasher.update(selection.domain_version().as_bytes());
    hasher.update(selection.evidence().as_bytes());
    hasher.update(&[u8::from(alignment.is_some())]);
    for coordinate in coordinates {
        hasher.update(&coordinate[0].to_bits().to_le_bytes());
        hasher.update(&coordinate[1].to_bits().to_le_bytes());
    }
    hasher.finish()
}
