use core::{error::Error, fmt, num::NonZeroUsize};
use std::time::Instant;

use burn::tensor::backend::Backend;

use super::error::GenerationError;
use crate::salt::{
    evaluation::{
        CanonicalField, ConditionDomain, ConditionField, ConditionLadder, ConditionMeasurement,
        ConditionMeasurementConfig, QuantizedCanonicalField, canonical_field,
        measure_condition_ladder,
    },
    graph::{KnnTable, ProjectorEmbeddings},
    hash::{ContentHash, ContentHasher},
    projector::{
        ConditionedProjector, EntityRole, ProjectorTypeContext, RelationEnergy, project_generation,
    },
    relation::AttractionEdge,
};

const MAX_CONDITIONS: usize = 32;

/// Coordinates projected at one global relation-lens condition.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectedCondition {
    condition: f32,
    coordinates: Vec<[f64; 2]>,
    content_hash: ContentHash,
}

/// A borrowed quantized coordinate field submitted for release-quality evaluation.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PersistedCondition<'field> {
    condition: f32,
    coordinates: &'field [[f64; 2]],
    content_hash: ContentHash,
}

impl<'field> PersistedCondition<'field> {
    /// Returns the exact `f32` condition supplied to the projector.
    #[must_use]
    #[inline]
    pub(crate) const fn condition(self) -> f32 {
        self.condition
    }

    /// Borrows coordinates narrowed to their published `f32` values.
    #[must_use]
    #[inline]
    pub(crate) const fn coordinates(self) -> &'field [[f64; 2]] {
        self.coordinates
    }

    /// Returns the identity of the quantized field published to readers.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(self) -> ContentHash {
        self.content_hash
    }
}

impl ProjectedCondition {
    /// Returns the exact `f32` condition supplied to `FiLM`.
    #[must_use]
    #[inline]
    pub(crate) const fn condition(&self) -> f32 {
        self.condition
    }

    /// Borrows coordinates in generation-row order.
    #[must_use]
    #[inline]
    pub(crate) fn coordinates(&self) -> &[[f64; 2]] {
        &self.coordinates
    }

    /// Returns the coordinate-field identity.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// External quality measurements attached to one projected condition.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ConditionQuality {
    projected_field: ContentHash,
    semantic_fidelity_report: ContentHash,
    subgroup_report: ContentHash,
    semantic_fidelity_bits: u64,
    maximum_subgroup_degradation_bits: u64,
}

impl ConditionQuality {
    #[must_use]
    pub(crate) const fn new(
        projected_field: ContentHash,
        semantic_fidelity_report: ContentHash,
        subgroup_report: ContentHash,
        semantic_fidelity: f64,
        maximum_subgroup_degradation: f64,
    ) -> Self {
        Self {
            projected_field,
            semantic_fidelity_report,
            subgroup_report,
            semantic_fidelity_bits: semantic_fidelity.to_bits(),
            maximum_subgroup_degradation_bits: maximum_subgroup_degradation.to_bits(),
        }
    }

    #[must_use]
    #[inline]
    pub(crate) const fn projected_field(self) -> ContentHash {
        self.projected_field
    }

    #[must_use]
    #[inline]
    pub(crate) const fn semantic_fidelity(self) -> f64 {
        f64::from_bits(self.semantic_fidelity_bits)
    }

    #[must_use]
    #[inline]
    pub(crate) const fn semantic_fidelity_report(self) -> ContentHash {
        self.semantic_fidelity_report
    }

    #[must_use]
    #[inline]
    pub(crate) const fn maximum_subgroup_degradation(self) -> f64 {
        f64::from_bits(self.maximum_subgroup_degradation_bits)
    }

    #[must_use]
    #[inline]
    pub(crate) const fn subgroup_report(self) -> ContentHash {
        self.subgroup_report
    }

    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher =
            ContentHasher::new(b"hash.graph.atlas.salt.condition-quality-measurement.v3");
        hasher.update(self.projected_field.as_bytes());
        hasher.update(self.semantic_fidelity_report.as_bytes());
        hasher.update(self.subgroup_report.as_bytes());
        hasher.update(&self.semantic_fidelity_bits.to_le_bytes());
        hasher.update(&self.maximum_subgroup_degradation_bits.to_le_bytes());
        hasher.finish()
    }
}

/// Exact persisted-field measurement and the report bytes behind its identities.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PersistedConditionQuality {
    measurement: ConditionQuality,
    semantic_fidelity_report: Box<[u8]>,
    subgroup_report: Box<[u8]>,
}

impl PersistedConditionQuality {
    /// Binds one measurement to the exact report documents it references.
    ///
    /// # Errors
    ///
    /// Returns an error when either report is empty or its SHA-256 identity
    /// differs from the corresponding measurement field.
    pub(crate) fn new(
        measurement: ConditionQuality,
        semantic_fidelity_report: impl Into<Box<[u8]>>,
        subgroup_report: impl Into<Box<[u8]>>,
    ) -> Result<Self, ConditionQualityEvaluationError> {
        let semantic_fidelity_report = semantic_fidelity_report.into();
        let subgroup_report = subgroup_report.into();
        if semantic_fidelity_report.is_empty()
            || ContentHash::digest(&semantic_fidelity_report)
                != measurement.semantic_fidelity_report()
        {
            return Err(ConditionQualityEvaluationError::new(
                "semantic-fidelity report bytes do not match their measurement identity",
            ));
        }
        if subgroup_report.is_empty()
            || ContentHash::digest(&subgroup_report) != measurement.subgroup_report()
        {
            return Err(ConditionQualityEvaluationError::new(
                "subgroup report bytes do not match their measurement identity",
            ));
        }
        Ok(Self {
            measurement,
            semantic_fidelity_report,
            subgroup_report,
        })
    }

    #[must_use]
    pub(crate) const fn measurement(&self) -> ConditionQuality {
        self.measurement
    }

    #[must_use]
    pub(crate) fn semantic_fidelity_report(&self) -> &[u8] {
        &self.semantic_fidelity_report
    }

    #[must_use]
    pub(crate) fn subgroup_report(&self) -> &[u8] {
        &self.subgroup_report
    }
}

/// Release thresholds applied independently of the quality evaluator.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ConditionQualityPolicy {
    pub minimum_semantic_fidelity: f64,
    pub maximum_subgroup_degradation: f64,
}

impl ConditionQualityPolicy {
    fn validate(self) -> Result<(), GenerationError> {
        if !self.minimum_semantic_fidelity.is_finite()
            || !(0.0..=1.0).contains(&self.minimum_semantic_fidelity)
        {
            return Err(GenerationError::InvalidQualityPolicy {
                field: "minimum-semantic-fidelity",
                value: self.minimum_semantic_fidelity,
            });
        }
        if !self.maximum_subgroup_degradation.is_finite() || self.maximum_subgroup_degradation < 1.0
        {
            return Err(GenerationError::InvalidQualityPolicy {
                field: "maximum-subgroup-degradation",
                value: self.maximum_subgroup_degradation,
            });
        }
        Ok(())
    }

    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.condition-quality-policy.v1");
        hasher.update(&self.minimum_semantic_fidelity.to_bits().to_le_bytes());
        hasher.update(&self.maximum_subgroup_degradation.to_bits().to_le_bytes());
        hasher.finish()
    }
}

/// Re-evaluates quality over the exact quantized field published to readers.
///
/// # Arguments
///
/// * `evaluator` - External suite that measures the complete field
/// * `condition` - Global relation-lens value used to produce the field
/// * `field` - Quantized coordinates and their immutable identity
/// * `policy` - Release thresholds applied to the returned measurement
///
/// # Errors
///
/// This returns an error unless the evaluator emits one field-bound,
/// policy-satisfying measurement for the supplied persisted coordinates.
///
/// # Complexity
///
/// The wrapper uses constant additional space and does not copy coordinates.
/// Evaluation cost is determined by `evaluator`.
pub(crate) fn evaluate_persisted_quality(
    evaluator: &dyn ConditionQualityEvaluator,
    condition: f32,
    field: &QuantizedCanonicalField,
    policy: ConditionQualityPolicy,
) -> Result<PersistedConditionQuality, GenerationError> {
    let persisted = PersistedCondition {
        condition,
        coordinates: field.coordinates(),
        content_hash: field.content_hash(),
    };
    let measurement = evaluator.evaluate_persisted(persisted)?;
    policy.validate()?;
    validate_quality_measurement(
        0,
        persisted.content_hash(),
        measurement.measurement(),
        policy,
    )?;
    Ok(measurement)
}

/// A versioned external suite that measures exact projected fields.
pub(crate) trait ConditionQualityEvaluator: fmt::Debug + Send + Sync {
    /// Returns the canonical version of the external quality suite.
    fn suite_version(&self) -> &str;

    /// Returns the evaluator contract included in generation identity.
    fn contract_hash(&self) -> ContentHash;

    /// Evaluates every field in the supplied canonical order.
    ///
    /// # Errors
    ///
    /// Returns an error when an external suite cannot produce complete report
    /// identities and measurements for the projected fields.
    fn evaluate(
        &self,
        fields: &[ProjectedCondition],
    ) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError>;

    /// Evaluates the exact quantized field considered for publication.
    ///
    /// The returned measurement must bind [`PersistedCondition::content_hash`].
    ///
    /// # Errors
    ///
    /// Returns an error when the external suite cannot evaluate the complete
    /// persisted field or produce immutable report identities.
    fn evaluate_persisted(
        &self,
        field: PersistedCondition<'_>,
    ) -> Result<PersistedConditionQuality, ConditionQualityEvaluationError>;
}

/// Failure reported by an external condition-quality suite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConditionQualityEvaluationError {
    detail: String,
}

impl ConditionQualityEvaluationError {
    #[must_use]
    pub(crate) fn new(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
        }
    }
}

impl fmt::Display for ConditionQualityEvaluationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "condition quality evaluation failed: {}",
            self.detail
        )
    }
}

impl Error for ConditionQualityEvaluationError {}

/// Complete disposable fields for a bounded condition experiment.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectedLadder {
    fields: Vec<ProjectedCondition>,
}

impl ProjectedLadder {
    #[cfg(test)]
    pub(super) fn from_fields(fields: impl IntoIterator<Item = (f32, Vec<[f64; 2]>)>) -> Self {
        Self {
            fields: fields
                .into_iter()
                .map(|(condition, coordinates)| ProjectedCondition {
                    condition,
                    content_hash: projected_hash(condition, &coordinates),
                    coordinates,
                })
                .collect(),
        }
    }

    /// Borrows projected fields in increasing condition order.
    #[must_use]
    #[inline]
    pub(crate) fn fields(&self) -> &[ProjectedCondition] {
        &self.fields
    }

    /// Attaches quality evidence and measures cross-condition behavior.
    ///
    /// # Errors
    ///
    /// This returns an error unless quality evidence is one-for-one with the
    /// projected fields or numerical ladder measurement succeeds.
    pub(crate) fn evaluate(
        self,
        domain: ConditionDomain,
        quality: Vec<ConditionQuality>,
        quality_policy: ConditionQualityPolicy,
        relations: &[AttractionEdge],
        semantic: &KnnTable,
        relation_energy: RelationEnergy,
        config: ConditionMeasurementConfig,
    ) -> Result<EvaluatedGeneration, GenerationError> {
        if quality.len() != self.fields.len() {
            return Err(GenerationError::QualityCount {
                conditions: self.fields.len(),
                quality: quality.len(),
            });
        }
        quality_policy.validate()?;
        for (index, measurement) in quality.iter().copied().enumerate() {
            validate_quality_measurement(
                index,
                self.fields[index].content_hash(),
                measurement,
                quality_policy,
            )?;
        }
        let fields = condition_fields(&self.fields, &quality);
        let (ladder, measurements) = measure_condition_ladder(
            domain,
            &fields,
            relations,
            semantic,
            relation_energy,
            config,
        )?;
        Ok(EvaluatedGeneration {
            projected: self.fields,
            quality,
            ladder,
            measurements,
        })
    }
}

fn validate_quality_measurement(
    index: usize,
    expected_field: ContentHash,
    measurement: ConditionQuality,
    policy: ConditionQualityPolicy,
) -> Result<(), GenerationError> {
    if measurement.projected_field() != expected_field {
        return Err(GenerationError::QualityField {
            index,
            expected: expected_field,
            actual: measurement.projected_field(),
        });
    }
    let semantic_fidelity = measurement.semantic_fidelity();
    let subgroup_degradation = measurement.maximum_subgroup_degradation();
    if !semantic_fidelity.is_finite()
        || !(0.0..=1.0).contains(&semantic_fidelity)
        || !subgroup_degradation.is_finite()
        || subgroup_degradation < 0.0
    {
        return Err(GenerationError::InvalidQualityMeasurement {
            index,
            semantic_fidelity,
            subgroup_degradation,
        });
    }
    if semantic_fidelity < policy.minimum_semantic_fidelity {
        return Err(GenerationError::InsufficientSemanticFidelity {
            index,
            actual: semantic_fidelity,
            minimum: policy.minimum_semantic_fidelity,
        });
    }
    if subgroup_degradation > policy.maximum_subgroup_degradation {
        return Err(GenerationError::ExcessiveSubgroupDegradation {
            index,
            actual: subgroup_degradation,
            maximum: policy.maximum_subgroup_degradation,
        });
    }
    Ok(())
}

/// Projected fields with complete condition-selection evidence.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct EvaluatedGeneration {
    projected: Vec<ProjectedCondition>,
    quality: Vec<ConditionQuality>,
    ladder: ConditionLadder,
    measurements: Vec<ConditionMeasurement>,
}

impl EvaluatedGeneration {
    /// Borrows the validated condition ladder.
    #[must_use]
    #[inline]
    pub(crate) const fn ladder(&self) -> &ConditionLadder {
        &self.ladder
    }

    /// Borrows cross-condition measurements.
    #[must_use]
    #[inline]
    pub(crate) fn measurements(&self) -> &[ConditionMeasurement] {
        &self.measurements
    }

    #[must_use]
    pub(crate) fn quality(&self, value: f64) -> Option<ConditionQuality> {
        self.projected
            .iter()
            .zip(&self.quality)
            .find(|(field, _quality)| f64::from(field.condition).to_bits() == value.to_bits())
            .map(|(_field, quality)| *quality)
    }

    /// Selects and aligns one passing condition for base materialization.
    ///
    /// # Errors
    ///
    /// This returns an error when the condition is absent or any mandatory
    /// selection evidence failed.
    pub(crate) fn select_canonical(&self, value: f64) -> Result<CanonicalField, GenerationError> {
        let fields = condition_fields(&self.projected, &self.quality);
        canonical_field(&self.ladder, &fields, &self.measurements, value).map_err(Into::into)
    }
}

/// Projects every configured relation condition over the complete generation.
///
/// # Errors
///
/// This returns an error unless there are 2–32 finite, strictly increasing
/// conditions or complete-corpus projector inference succeeds.
pub(crate) fn project_condition_ladder<B: Backend>(
    model: &ConditionedProjector<B>,
    representations: ProjectorEmbeddings<'_>,
    roles: &[EntityRole],
    type_context: Option<ProjectorTypeContext<'_>>,
    conditions: &[f32],
    batch_size: NonZeroUsize,
    device: &B::Device,
) -> Result<ProjectedLadder, GenerationError> {
    let started = Instant::now();
    if !(2..=MAX_CONDITIONS).contains(&conditions.len()) {
        return Err(GenerationError::ConditionCount {
            count: conditions.len(),
        });
    }
    if conditions[0].to_bits() != 0.0_f32.to_bits() {
        return Err(GenerationError::MissingSemanticBaseline {
            value: conditions[0],
        });
    }
    let mut previous = None;
    for (index, &condition) in conditions.iter().enumerate() {
        if !condition.is_finite() {
            return Err(GenerationError::NonFiniteCondition {
                index,
                value: condition,
            });
        }
        if let Some(previous) = previous
            && condition <= previous
        {
            return Err(GenerationError::UnorderedCondition {
                index,
                previous,
                value: condition,
            });
        }
        previous = Some(condition);
    }

    let mut fields = Vec::with_capacity(conditions.len());
    for &condition in conditions {
        let coordinates = project_generation(
            model,
            representations,
            roles,
            type_context,
            condition,
            batch_size,
            device,
        )?;
        let content_hash = projected_hash(condition, &coordinates);
        fields.push(ProjectedCondition {
            condition,
            coordinates,
            content_hash,
        });
    }
    tracing::info!(
        target: "hash_graph_atlas::salt",
        rows = representations.len(),
        conditions = fields.len(),
        duration_ms = started.elapsed().as_millis(),
        "projector condition ladder generated"
    );
    Ok(ProjectedLadder { fields })
}

fn condition_fields<'field>(
    projected: &'field [ProjectedCondition],
    quality: &[ConditionQuality],
) -> Vec<ConditionField<'field>> {
    projected
        .iter()
        .zip(quality)
        .map(|(field, quality)| ConditionField {
            condition: f64::from(field.condition),
            coordinates: &field.coordinates,
            upstream_report: combined_report(
                field.content_hash,
                quality.semantic_fidelity_report,
                quality.subgroup_report,
            ),
        })
        .collect()
}

fn projected_hash(condition: f32, coordinates: &[[f64; 2]]) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projected-condition.v1");
    hasher.update(&condition.to_bits().to_le_bytes());
    for coordinate in coordinates {
        hasher.update(&coordinate[0].to_bits().to_le_bytes());
        hasher.update(&coordinate[1].to_bits().to_le_bytes());
    }
    hasher.finish()
}

fn combined_report(
    projection: ContentHash,
    semantic_fidelity: ContentHash,
    task_evidence: ContentHash,
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.condition-upstream-report.v2");
    hasher.update(projection.as_bytes());
    hasher.update(semantic_fidelity.as_bytes());
    hasher.update(task_evidence.as_bytes());
    hasher.finish()
}
