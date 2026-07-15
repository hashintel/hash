use core::num::NonZeroUsize;
use std::time::Instant;

use burn::tensor::backend::Backend;

use super::error::GenerationError;
use crate::salt::{
    evaluation::{
        CanonicalField, ConditionDomain, ConditionField, ConditionLadder, ConditionMeasurement,
        ConditionMeasurementConfig, canonical_field, measure_condition_ladder,
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

impl ProjectedCondition {
    /// Returns the exact `f32` condition supplied to FiLM.
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

/// External quality evidence attached to one projected condition.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ConditionQuality {
    pub semantic_fidelity: bool,
    pub persistence: bool,
    pub task_evidence: bool,
    pub report: ContentHash,
}

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
            semantic_fidelity: quality.semantic_fidelity,
            persistence: quality.persistence,
            task_evidence: quality.task_evidence,
            upstream_report: combined_report(field.content_hash, quality.report),
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

fn combined_report(projection: ContentHash, quality: ContentHash) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.condition-upstream-report.v1");
    hasher.update(projection.as_bytes());
    hasher.update(quality.as_bytes());
    hasher.finish()
}
