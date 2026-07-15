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

/// Measured saturation from canonical coordinate quantization.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct CanonicalQuantization {
    clamp_count: u64,
    component_count: u64,
}

/// Canonical coordinates proven quantized for immutable materialization.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct QuantizedCanonicalField {
    field: CanonicalField,
    step: f64,
}

impl QuantizedCanonicalField {
    /// Returns the selected condition and its evaluation authority.
    #[must_use]
    #[inline]
    pub(crate) const fn selection(&self) -> CanonicalCondition {
        self.field.selection()
    }

    /// Borrows exact quantized coordinates in generation-row order.
    #[must_use]
    #[inline]
    pub(crate) fn coordinates(&self) -> &[[f64; 2]] {
        self.field.coordinates()
    }

    /// Returns the similarity transform applied before quantization.
    #[must_use]
    #[inline]
    pub(crate) const fn alignment(&self) -> Option<SimilarityTransform> {
        self.field.alignment()
    }

    /// Returns the quantized coordinate-field identity.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.field.content_hash()
    }

    /// Returns the lattice step applied to every coordinate component.
    #[must_use]
    #[inline]
    pub(crate) const fn quantization_step(&self) -> f64 {
        self.step
    }
}

impl CanonicalQuantization {
    /// Returns the number of coordinate components clamped to the extent.
    #[must_use]
    #[inline]
    pub(crate) const fn clamp_count(self) -> u64 {
        self.clamp_count
    }

    /// Returns the clamped fraction of all coordinate components.
    #[must_use]
    #[inline]
    #[expect(
        clippy::cast_precision_loss,
        reason = "M0 caps component counts below 2^33, which f64 represents exactly"
    )]
    pub(crate) fn clamp_rate(self) -> f64 {
        self.clamp_count as f64 / self.component_count as f64
    }
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

    /// Quantizes coordinates onto one lattice and clamps them to the extent.
    ///
    /// Each component is rounded to the nearest multiple of `step`, with
    /// halfway values rounded away from zero, clamped to the corresponding
    /// inclusive axis extent, and narrowed to the exact persisted `f32` value.
    /// The returned content identity binds both `step` and those persisted
    /// coordinates.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid step or extent, a non-finite input, an
    /// overflowing quantization operation, or an unrepresentable component
    /// count.
    ///
    /// # Complexity
    ///
    /// This runs in `O(self.coordinates().len())` time and does not allocate.
    pub(crate) fn quantize(
        mut self,
        step: f64,
        minimum: [f64; 2],
        maximum: [f64; 2],
    ) -> Result<(QuantizedCanonicalField, CanonicalQuantization), EvaluationError> {
        if !step.is_finite() || step <= 0.0 {
            return Err(EvaluationError::InvalidQuantizationStep { step });
        }
        for axis in 0..2 {
            if !minimum[axis].is_finite()
                || !maximum[axis].is_finite()
                || minimum[axis] >= maximum[axis]
            {
                return Err(EvaluationError::InvalidQuantizationBounds {
                    axis,
                    minimum: minimum[axis],
                    maximum: maximum[axis],
                });
            }
        }
        let component_count = u64::try_from(self.coordinates.len())
            .ok()
            .and_then(|rows| rows.checked_mul(2))
            .filter(|&components| components != 0 && components <= 2 * u64::from(u32::MAX))
            .ok_or(EvaluationError::QuantizationSize {
                rows: self.coordinates.len(),
            })?;
        let mut clamp_count = 0_u64;
        for (row, coordinate) in self.coordinates.iter_mut().enumerate() {
            for axis in 0..2 {
                let value = coordinate[axis];
                if !value.is_finite() {
                    return Err(EvaluationError::NonFiniteCanonicalCoordinate { row, axis, value });
                }
                let quantized = (value / step).round() * step;
                if !quantized.is_finite() {
                    return Err(EvaluationError::QuantizationOverflow {
                        row,
                        axis,
                        value,
                        step,
                    });
                }
                let clamped = quantized.clamp(minimum[axis], maximum[axis]);
                clamp_count += u64::from(clamped.to_bits() != quantized.to_bits());
                coordinate[axis] = persisted_coordinate(row, axis, clamped)?;
            }
        }
        self.content_hash =
            quantized_field_hash(self.selection, self.alignment, step, &self.coordinates);
        Ok((
            QuantizedCanonicalField { field: self, step },
            CanonicalQuantization {
                clamp_count,
                component_count,
            },
        ))
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "canonical coordinates intentionally adopt the persisted f32 representation"
)]
fn persisted_coordinate(row: usize, axis: usize, value: f64) -> Result<f64, EvaluationError> {
    let stored = value as f32;
    if !stored.is_finite() {
        return Err(EvaluationError::CoordinateStorageOverflow { row, axis, value });
    }
    Ok(f64::from(stored))
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

#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform content identities require canonical little-endian scalars"
)]
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

#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform content identities require canonical little-endian scalars"
)]
fn quantized_field_hash(
    selection: CanonicalCondition,
    alignment: Option<SimilarityTransform>,
    step: f64,
    coordinates: &[[f64; 2]],
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.quantized-canonical-field.v1");
    hasher.update(&selection.condition().get().to_bits().to_le_bytes());
    hasher.update(selection.domain_version().as_bytes());
    hasher.update(selection.evidence().as_bytes());
    hasher.update(&[u8::from(alignment.is_some())]);
    hasher.update(&step.to_bits().to_le_bytes());
    for coordinate in coordinates {
        hasher.update(&coordinate[0].to_bits().to_le_bytes());
        hasher.update(&coordinate[1].to_bits().to_le_bytes());
    }
    hasher.finish()
}
