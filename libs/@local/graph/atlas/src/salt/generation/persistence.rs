//! Two-sided persistence comparison against the landmark reference.

#![expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform policy identities require canonical little-endian scalars"
)]

use core::{error::Error, fmt};

use serde::{Deserialize, Serialize};

use crate::salt::{
    analytic::{
        AnalyticError, AnalyticPoint, MergeTree, MergeTreeConfig, RasterConfig, density_raster,
        merge_tree,
    },
    evaluation::QuantizedCanonicalField,
    hash::{ContentHash, ContentHasher},
    landmark::LandmarkSkeleton,
};

/// Approved numerical envelope for candidate/reference persistence.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PersistenceGatePolicy<'policy> {
    pub fixed_thresholds: &'policy [f64],
    pub minimum_ratio: f64,
    pub maximum_ratio: f64,
    pub maximum_low_persistence_ratio: f64,
    pub maximum_noise_ratio: f64,
}

impl PersistenceGatePolicy<'_> {
    /// Computes the versioned policy identity used by generation recipes.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.persistence-policy.v1");
        for threshold in self.fixed_thresholds {
            hasher.update(&threshold.to_bits().to_le_bytes());
        }
        for value in [
            self.minimum_ratio,
            self.maximum_ratio,
            self.maximum_low_persistence_ratio,
            self.maximum_noise_ratio,
        ] {
            hasher.update(&value.to_bits().to_le_bytes());
        }
        hasher.finish()
    }
}

/// Candidate-bound inputs available to a planted-shape and noise evaluator.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PersistenceEvaluationSubject<'subject> {
    pub checkpoint_hash: ContentHash,
    pub field_hash: ContentHash,
    pub candidate_tree: &'subject MergeTree,
    pub reference_tree: &'subject MergeTree,
    pub reference_source_hash: ContentHash,
}

/// Measured diagnostics not derivable from the two corpus merge trees alone.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PersistenceDiagnostics {
    pub candidate_low_persistence_mass: f64,
    pub reference_low_persistence_mass: f64,
    pub candidate_noise_persistence: f64,
    pub reference_noise_persistence: f64,
    pub planted_shape_cases: u64,
    pub planted_shape_failures: u64,
    pub distribution_report_hash: ContentHash,
    pub planted_shape_report_hash: ContentHash,
    pub noise_report_hash: ContentHash,
}

/// Versioned evaluator for persistence distributions and synthetic suites.
pub(crate) trait PersistenceQualityEvaluator: fmt::Debug + Sync {
    fn suite_version(&self) -> &str;

    fn contract_hash(&self) -> ContentHash;

    /// Measures candidate-bound persistence diagnostics.
    ///
    /// # Errors
    ///
    /// This returns an error when the evaluator cannot complete its report.
    fn evaluate(
        &self,
        subject: PersistenceEvaluationSubject<'_>,
    ) -> Result<PersistenceDiagnostics, PersistenceEvaluationError>;
}

/// Complete candidate/reference evidence consumed by the release gate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PersistenceComparisonReport {
    pub suite_version: String,
    pub evaluator_contract_hash: ContentHash,
    pub checkpoint_hash: ContentHash,
    pub candidate_field_hash: ContentHash,
    pub candidate_tree_hash: ContentHash,
    pub reference_tree_hash: ContentHash,
    pub reference_source_hash: ContentHash,
    pub fixed_thresholds: Vec<f64>,
    pub candidate_leaf_counts: Vec<u64>,
    pub reference_leaf_counts: Vec<u64>,
    pub candidate_normalized_total: f64,
    pub reference_normalized_total: f64,
    pub minimum_ratio: f64,
    pub maximum_ratio: f64,
    pub candidate_low_persistence_mass: f64,
    pub reference_low_persistence_mass: f64,
    pub maximum_low_persistence_ratio: f64,
    pub candidate_noise_persistence: f64,
    pub reference_noise_persistence: f64,
    pub maximum_noise_ratio: f64,
    pub planted_shape_cases: u64,
    pub planted_shape_failures: u64,
    pub distribution_report_hash: ContentHash,
    pub planted_shape_report_hash: ContentHash,
    pub noise_report_hash: ContentHash,
}

impl PersistenceComparisonReport {
    /// Validates all measured comparisons and their two-sided envelope.
    ///
    /// # Errors
    ///
    /// This returns an error for incomplete reports, invalid values, synthetic
    /// suite failures, or a candidate outside any approved bound.
    pub(crate) fn validate(&self) -> Result<(), PersistenceComparisonError> {
        if self.suite_version.is_empty() || self.suite_version.trim() != self.suite_version {
            return Err(PersistenceComparisonError::SuiteVersion);
        }
        let thresholds = self.fixed_thresholds.len();
        if thresholds == 0
            || self.candidate_leaf_counts.len() != thresholds
            || self.reference_leaf_counts.len() != thresholds
            || !self
                .fixed_thresholds
                .iter()
                .all(|value| value.is_finite() && *value > 0.0 && *value <= 1.0)
            || !self
                .fixed_thresholds
                .windows(2)
                .all(|pair| pair.first() < pair.last())
        {
            return Err(PersistenceComparisonError::Thresholds);
        }
        if !self.minimum_ratio.is_finite()
            || !self.maximum_ratio.is_finite()
            || self.minimum_ratio <= 0.0
            || self.minimum_ratio > 1.0
            || self.maximum_ratio < 1.0
            || !self.maximum_low_persistence_ratio.is_finite()
            || self.maximum_low_persistence_ratio < 1.0
            || !self.maximum_noise_ratio.is_finite()
            || self.maximum_noise_ratio < 1.0
        {
            return Err(PersistenceComparisonError::Policy);
        }
        if !nonnegative(self.candidate_normalized_total)
            || !nonnegative(self.reference_normalized_total)
            || !nonnegative(self.candidate_low_persistence_mass)
            || !nonnegative(self.reference_low_persistence_mass)
            || !nonnegative(self.candidate_noise_persistence)
            || !nonnegative(self.reference_noise_persistence)
        {
            return Err(PersistenceComparisonError::Measurement);
        }
        if !within(
            self.candidate_normalized_total,
            self.reference_normalized_total,
            self.minimum_ratio,
            self.maximum_ratio,
        ) || self
            .candidate_leaf_counts
            .iter()
            .zip(&self.reference_leaf_counts)
            .any(|(&candidate, &reference)| {
                let (Ok(candidate), Ok(reference)) =
                    (u32::try_from(candidate), u32::try_from(reference))
                else {
                    return true;
                };
                !within(
                    f64::from(candidate),
                    f64::from(reference),
                    self.minimum_ratio,
                    self.maximum_ratio,
                )
            })
        {
            return Err(PersistenceComparisonError::Envelope);
        }
        if !bounded_above(
            self.candidate_low_persistence_mass,
            self.reference_low_persistence_mass,
            self.maximum_low_persistence_ratio,
        ) {
            return Err(PersistenceComparisonError::LowPersistence);
        }
        if !bounded_above(
            self.candidate_noise_persistence,
            self.reference_noise_persistence,
            self.maximum_noise_ratio,
        ) {
            return Err(PersistenceComparisonError::Noise);
        }
        if self.planted_shape_cases == 0 || self.planted_shape_failures != 0 {
            return Err(PersistenceComparisonError::PlantedShapes);
        }
        let zero = ContentHash::from_bytes([0; 32]);
        if [
            self.evaluator_contract_hash,
            self.checkpoint_hash,
            self.candidate_field_hash,
            self.candidate_tree_hash,
            self.reference_tree_hash,
            self.reference_source_hash,
            self.distribution_report_hash,
            self.planted_shape_report_hash,
            self.noise_report_hash,
        ]
        .contains(&zero)
        {
            return Err(PersistenceComparisonError::MissingIdentity);
        }
        Ok(())
    }

    /// Computes the exact report identity signed by release evidence.
    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let bytes = serde_json::to_vec(self)
            .expect("validated persistence report should serialize to canonical JSON");
        let mut hasher =
            ContentHasher::new(b"hash.graph.atlas.salt.persistence-comparison-report.v1");
        hasher.update(&bytes);
        hasher.finish()
    }
}

/// Builds the non-parametric landmark/reference tree over all generation rows.
///
/// # Errors
///
/// This returns an error when reference rasterization or merge-tree analysis
/// fails.
pub(crate) fn landmark_reference_tree(
    skeleton: &LandmarkSkeleton,
    density_mass: &[f64],
    raster: RasterConfig,
    merge_tree_config: MergeTreeConfig,
) -> Result<MergeTree, PersistenceComparisonError> {
    if skeleton.assignment().as_slice().len() != density_mass.len() {
        return Err(PersistenceComparisonError::ReferenceRows {
            assignments: skeleton.assignment().as_slice().len(),
            density_mass: density_mass.len(),
        });
    }
    let points = skeleton
        .assignment()
        .as_slice()
        .iter()
        .zip(density_mass)
        .map(|(&assignment, &mass)| AnalyticPoint {
            coordinate: skeleton.coordinates()[assignment as usize],
            mass,
        })
        .collect::<Vec<_>>();
    let raster = density_raster(&points, raster).map_err(PersistenceComparisonError::Analytic)?;
    merge_tree(&raster, merge_tree_config).map_err(PersistenceComparisonError::Analytic)
}

/// Computes the source identity of a landmark persistence reference.
#[must_use]
pub(crate) fn persistence_reference_source_hash(
    landmark_artifact: ContentHash,
    density_mass: &[f64],
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.persistence-reference-source.v1");
    hasher.update(landmark_artifact.as_bytes());
    hasher.update(
        &u64::try_from(density_mass.len())
            .expect("density-mass length should fit u64")
            .to_le_bytes(),
    );
    for mass in density_mass {
        hasher.update(&mass.to_bits().to_le_bytes());
    }
    hasher.finish()
}

/// Evaluates and validates one candidate/reference persistence comparison.
///
/// # Errors
///
/// This returns an error when diagnostics fail or the resulting report does not
/// satisfy the approved policy.
pub(crate) fn compare_persistence(
    checkpoint_hash: ContentHash,
    field: &QuantizedCanonicalField,
    candidate: &MergeTree,
    reference: &MergeTree,
    reference_source_hash: ContentHash,
    policy: PersistenceGatePolicy<'_>,
    evaluator: &dyn PersistenceQualityEvaluator,
) -> Result<PersistenceComparisonReport, PersistenceComparisonError> {
    let diagnostics = evaluator
        .evaluate(PersistenceEvaluationSubject {
            checkpoint_hash,
            field_hash: field.content_hash(),
            candidate_tree: candidate,
            reference_tree: reference,
            reference_source_hash,
        })
        .map_err(PersistenceComparisonError::Evaluation)?;
    let report = PersistenceComparisonReport {
        suite_version: evaluator.suite_version().to_owned(),
        evaluator_contract_hash: evaluator.contract_hash(),
        checkpoint_hash,
        candidate_field_hash: field.content_hash(),
        candidate_tree_hash: candidate.content_hash(),
        reference_tree_hash: reference.content_hash(),
        reference_source_hash,
        fixed_thresholds: policy.fixed_thresholds.to_vec(),
        candidate_leaf_counts: leaf_counts(candidate, policy.fixed_thresholds),
        reference_leaf_counts: leaf_counts(reference, policy.fixed_thresholds),
        candidate_normalized_total: candidate.normalized_persistence(),
        reference_normalized_total: reference.normalized_persistence(),
        minimum_ratio: policy.minimum_ratio,
        maximum_ratio: policy.maximum_ratio,
        candidate_low_persistence_mass: diagnostics.candidate_low_persistence_mass,
        reference_low_persistence_mass: diagnostics.reference_low_persistence_mass,
        maximum_low_persistence_ratio: policy.maximum_low_persistence_ratio,
        candidate_noise_persistence: diagnostics.candidate_noise_persistence,
        reference_noise_persistence: diagnostics.reference_noise_persistence,
        maximum_noise_ratio: policy.maximum_noise_ratio,
        planted_shape_cases: diagnostics.planted_shape_cases,
        planted_shape_failures: diagnostics.planted_shape_failures,
        distribution_report_hash: diagnostics.distribution_report_hash,
        planted_shape_report_hash: diagnostics.planted_shape_report_hash,
        noise_report_hash: diagnostics.noise_report_hash,
    };
    report.validate()?;
    Ok(report)
}

fn leaf_counts(tree: &MergeTree, thresholds: &[f64]) -> Vec<u64> {
    thresholds
        .iter()
        .map(|threshold| {
            u64::try_from(
                tree.leaves()
                    .iter()
                    .filter(|leaf| leaf.persistence() >= *threshold * tree.density_maximum())
                    .count(),
            )
            .expect("merge-tree leaf count should fit u64")
        })
        .collect()
}

#[inline]
fn within(candidate: f64, reference: f64, minimum: f64, maximum: f64) -> bool {
    if reference == 0.0 {
        candidate == 0.0
    } else {
        candidate >= reference * minimum && candidate <= reference * maximum
    }
}

#[inline]
fn bounded_above(candidate: f64, reference: f64, maximum: f64) -> bool {
    if reference == 0.0 {
        candidate == 0.0
    } else {
        candidate <= reference * maximum
    }
}

#[inline]
fn nonnegative(value: f64) -> bool {
    value.is_finite() && !value.is_sign_negative()
}

/// A failed persistence diagnostic adapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PersistenceEvaluationError {
    detail: Box<str>,
}

impl PersistenceEvaluationError {
    #[must_use]
    pub(crate) fn new(detail: impl Into<Box<str>>) -> Self {
        Self {
            detail: detail.into(),
        }
    }
}

impl fmt::Display for PersistenceEvaluationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)
    }
}

impl Error for PersistenceEvaluationError {}

/// Invalid or failing candidate/reference persistence evidence.
#[derive(Debug)]
pub(crate) enum PersistenceComparisonError {
    SuiteVersion,
    Thresholds,
    Policy,
    Measurement,
    Envelope,
    LowPersistence,
    Noise,
    PlantedShapes,
    MissingIdentity,
    ReferenceRows {
        assignments: usize,
        density_mass: usize,
    },
    Analytic(AnalyticError),
    Evaluation(PersistenceEvaluationError),
}

impl fmt::Display for PersistenceComparisonError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SuiteVersion => formatter.write_str("persistence suite version is not canonical"),
            Self::Thresholds => formatter.write_str("persistence thresholds are invalid"),
            Self::Policy => formatter.write_str("persistence envelope policy is invalid"),
            Self::Measurement => formatter.write_str("persistence measurement is invalid"),
            Self::Envelope => {
                formatter.write_str("candidate persistence is outside the two-sided envelope")
            }
            Self::LowPersistence => {
                formatter.write_str("candidate adds unsupported low-persistence structure")
            }
            Self::Noise => {
                formatter.write_str("candidate fails the no-structure-from-noise differential")
            }
            Self::PlantedShapes => formatter.write_str("planted-shape persistence suite failed"),
            Self::MissingIdentity => {
                formatter.write_str("persistence report has a missing content identity")
            }
            Self::ReferenceRows {
                assignments,
                density_mass,
            } => write!(
                formatter,
                "persistence reference has {assignments} landmark assignments and {density_mass} \
                 density masses",
            ),
            Self::Analytic(error) => error.fmt(formatter),
            Self::Evaluation(error) => error.fmt(formatter),
        }
    }
}

impl Error for PersistenceComparisonError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Analytic(error) => Some(error),
            Self::Evaluation(error) => Some(error),
            Self::SuiteVersion
            | Self::Thresholds
            | Self::Policy
            | Self::Measurement
            | Self::Envelope
            | Self::LowPersistence
            | Self::Noise
            | Self::PlantedShapes
            | Self::MissingIdentity
            | Self::ReferenceRows { .. } => None,
        }
    }
}

#[cfg(test)]
mod tests;
