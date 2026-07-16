//! Deterministic non-attesting quality values for the deferred assurance mode.
//!
//! This adapter validates row counts and finite coordinates, but deliberately
//! does not claim semantic or subgroup measurements. Its report documents are
//! marked as mock data so they cannot be mistaken for completed evidence.

use serde::Serialize;

use crate::salt::{
    ContentHash,
    salt_fit_boundary::{
        ConditionQuality, ConditionQualityEvaluationError, ConditionQualityEvaluator,
        PersistedCondition, PersistedConditionQuality, ProjectedCondition,
    },
};

const SUITE_VERSION: &str = "salt-deferred-non-attesting-condition-quality-v1";

/// Shape-checking condition evaluator for explicitly deferred evidence.
#[derive(Debug)]
pub(in crate::salt_fit) struct DeferredConditionQualityEvaluator {
    row_count: usize,
    contract_hash: ContentHash,
}

impl DeferredConditionQualityEvaluator {
    /// Creates an evaluator bound to the complete projected population.
    #[must_use]
    pub(in crate::salt_fit) fn new(row_count: usize) -> Self {
        Self {
            row_count,
            contract_hash: ContentHash::digest(
                b"hash.graph.atlas.fit.deferred-non-attesting-condition-quality.v1",
            ),
        }
    }

    fn measurement(
        &self,
        field_hash: ContentHash,
        condition: f32,
    ) -> Result<(ConditionQuality, Box<[u8]>, Box<[u8]>), ConditionQualityEvaluationError> {
        let semantic = mock_report("semantic-fidelity", field_hash, condition, self.row_count)?;
        let subgroup = mock_report("subgroup-behavior", field_hash, condition, self.row_count)?;
        let measurement = ConditionQuality::new(
            field_hash,
            ContentHash::digest(&semantic),
            ContentHash::digest(&subgroup),
            1.0,
            1.0,
        );
        Ok((
            measurement,
            semantic.into_boxed_slice(),
            subgroup.into_boxed_slice(),
        ))
    }

    fn validate_coordinates(
        &self,
        coordinates: &[[f64; 2]],
    ) -> Result<(), ConditionQualityEvaluationError> {
        if coordinates.len() != self.row_count
            || coordinates
                .iter()
                .flatten()
                .any(|component| !component.is_finite())
        {
            return Err(ConditionQualityEvaluationError::new(
                "deferred quality input has the wrong row count or a non-finite coordinate",
            ));
        }
        Ok(())
    }
}

impl ConditionQualityEvaluator for DeferredConditionQualityEvaluator {
    fn suite_version(&self) -> &str {
        SUITE_VERSION
    }

    fn contract_hash(&self) -> ContentHash {
        self.contract_hash
    }

    fn evaluate(
        &self,
        fields: &[ProjectedCondition],
    ) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError> {
        let mut output = Vec::new();
        output.try_reserve_exact(fields.len()).map_err(|_error| {
            ConditionQualityEvaluationError::new(
                "could not reserve deferred condition-quality measurements",
            )
        })?;
        for field in fields {
            self.validate_coordinates(field.coordinates())?;
            output.push(self.measurement(field.content_hash(), field.condition())?.0);
        }
        Ok(output)
    }

    fn evaluate_persisted(
        &self,
        field: PersistedCondition<'_>,
    ) -> Result<PersistedConditionQuality, ConditionQualityEvaluationError> {
        self.validate_coordinates(field.coordinates())?;
        let (measurement, semantic, subgroup) =
            self.measurement(field.content_hash(), field.condition())?;
        PersistedConditionQuality::new(measurement, semantic, subgroup)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MockReport {
    schema_version: u32,
    suite_version: &'static str,
    outcome: &'static str,
    attesting: bool,
    subject: ContentHash,
    condition: f32,
    row_count: usize,
    note: &'static str,
}

fn mock_report(
    subject_kind: &'static str,
    field_hash: ContentHash,
    condition: f32,
    row_count: usize,
) -> Result<Vec<u8>, ConditionQualityEvaluationError> {
    serde_json::to_vec(&MockReport {
        schema_version: 1,
        suite_version: SUITE_VERSION,
        outcome: "deferred",
        attesting: false,
        subject: field_hash,
        condition,
        row_count,
        note: match subject_kind {
            "semantic-fidelity" => {
                "mock semantic-fidelity envelope; no semantic evidence was collected"
            }
            _ => "mock subgroup envelope; no subgroup evidence was collected",
        },
    })
    .map_err(|_error| {
        ConditionQualityEvaluationError::new("could not serialize deferred quality report")
    })
}
