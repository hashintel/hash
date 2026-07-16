//! Immutable recommended numerical recipe for `m0-local-v1`.

use core::{error::Error, fmt, num::NonZeroUsize};

use camino::Utf8Path;

use super::quality_evaluation::{LocalConditionQualityEvaluator, LocalPersistenceQualityEvaluator};
use crate::salt::{
    ContentHash,
    fit_boundary::{
        AttractionConfig, CanonicalGenerationConfig, CanonicalMaterializationConfig,
        ConditionDomain, ConditionMeasurementConfig, ConditionQualityPolicy, CoordinateBounds,
        GradientBudget, HardNegativeConfig, ImportanceConfig, LandmarkConfig, LandmarkFitConfig,
        LossWeights, MergeTreeConfig, PersistenceGatePolicy, Probability, ProjectorBatchPlanConfig,
        ProjectorConfig, ProjectorLossConfig, ProjectorOptimizerConfig, ProtectionConfig,
        RasterConfig, RegionConfig, RelationEnergy, SemanticAffinity, SemanticGraphConfig,
        SupportEnergy, USearchConfig,
    },
};

const CONDITIONS: [f32; 5] = [0.0, 0.25, 0.5, 0.75, 1.0];
const GRID_DEPTHS: [u8; 4] = [4, 8, 12, 16];
const PERSISTENCE_THRESHOLDS: [f64; 4] = [0.01, 0.025, 0.05, 0.1];

#[derive(Debug)]
pub(in crate::fit) struct FitProfileError(String);

impl fmt::Display for FitProfileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for FitProfileError {}

/// Builds the immutable recommended numerical recipe for local M0 fitting.
#[expect(
    clippy::too_many_lines,
    reason = "keeping one profile recipe contiguous makes its release parameters auditable"
)]
pub(in crate::fit) fn m0_local_profile<'config>(
    root: &'config Utf8Path,
    row_count: usize,
    link_count: usize,
    relation_type_count: usize,
    condition_evaluator: &'config LocalConditionQualityEvaluator,
    persistence_evaluator: &'config LocalPersistenceQualityEvaluator,
) -> Result<CanonicalGenerationConfig<'config>, FitProfileError> {
    let semantic_graph = SemanticGraphConfig::default();
    let semantic_neighbors = semantic_graph.neighbors;
    let audit_sample_size = nonzero(row_count.min(1_000), "ANN audit sample")?;
    let landmark_count = nonzero(row_count.min(4_096), "landmark count")?;
    let landmark_neighbors = nonzero(
        landmark_count.get().saturating_sub(1).min(15),
        "landmark neighbors",
    )?;
    let semantic_positive_count = nonzero(
        row_count
            .saturating_mul(semantic_neighbors.get())
            .min(0x8000),
        "semantic positive count",
    )?;
    let relation_type_count = nonzero(relation_type_count, "relation type count")?;
    let relation_per_type_cap = nonzero(
        link_count.div_ceil(relation_type_count.get()).clamp(1, 256),
        "relation per-type cap",
    )?;
    let inference_batch_size = nonzero(row_count.min(4_096), "inference batch size")?;

    Ok(CanonicalGenerationConfig {
        root,
        semantic_index: USearchConfig::default(),
        semantic_graph,
        audit_sample_size,
        audit_seed: 0x5341_4C54_0001,
        attraction: AttractionConfig::default(),
        protection: ProtectionConfig::new(
            Probability::ZERO,
            Probability::ZERO,
            Probability::ZERO,
            Probability::ZERO,
            true,
        )
        .map_err(profile_error)?,
        landmarks: LandmarkConfig {
            maximum_count: landmark_count,
            retained_fraction: 0.0,
            seed: 0x5341_4C54_0002,
        },
        landmark_assignment: USearchConfig::default(),
        landmark_fit: LandmarkFitConfig {
            maximum_neighbors: landmark_neighbors,
            epochs: nonzero(200, "landmark epochs")?,
            initial_learning_rate: 1.0,
            repulsion_strength: 1.0,
            negative_sample_rate: nonzero(5, "landmark negative sample rate")?,
            spread: 1.0,
            minimum_distance: 0.1,
            seed: 0x5341_4C54_0003,
        },
        landmark_radius: 1.0,
        landmark_weight: 1.0,
        projector: ProjectorConfig::default(),
        projector_batches: ProjectorBatchPlanConfig {
            conditions: CONDITIONS.map(f64::from).into(),
            semantic_positive_count,
            ordinary_negative_count: semantic_positive_count.get(),
            ordinary_negative_weight: 1.0,
            relation_type_count,
            relation_per_type_cap,
            anchor_count: 0,
            landmark_count: landmark_count.get(),
            hard_query_count: row_count.min(1_024),
            hard_negative: HardNegativeConfig {
                neighbors: nonzero(16.min(row_count - 1), "hard-negative neighbors")?,
                candidate_multiplier: nonzero(32, "hard-negative candidate multiplier")?,
                connectivity: nonzero(32.min(row_count - 1), "hard-negative connectivity")?,
                expansion_add: nonzero(128, "hard-negative add expansion")?,
                expansion_search: nonzero(128, "hard-negative search expansion")?,
                maximum_weight: 1.0,
                rank_exponent: 1.0,
            },
            refresh_interval: nonzero(100, "hard-negative refresh interval")?,
            refresh_condition: 0.5,
            inference_batch_size,
            type_context_dropout_probability: 0.0,
            seed: 0x5341_4C54_0004,
        },
        projector_loss: projector_loss()?,
        projector_optimizer: ProjectorOptimizerConfig {
            initial_learning_rate: 1.0e-3,
            minimum_learning_rate: 1.0e-5,
            steps: nonzero(2_000, "projector training steps")?,
            seed: 0x5341_4C54_0005,
        },
        conditions: &CONDITIONS,
        condition_domain: ConditionDomain::new(
            0.0,
            1.0,
            ContentHash::digest(b"hash.graph.atlas.fit.m0-local-condition-domain.v1"),
        )
        .map_err(profile_error)?,
        condition_quality_evaluator: condition_evaluator,
        condition_quality_policy: ConditionQualityPolicy {
            minimum_semantic_fidelity: 0.2,
            maximum_subgroup_degradation: 2.0,
        },
        condition_measurement: ConditionMeasurementConfig {
            distinguishability_floor: 1.0e-8,
            monotonicity_tolerance: 0.05,
        },
        canonical_condition: 1.0,
        variant_quantization_step: 1.0e-4,
        inference_batch_size,
        materialization: CanonicalMaterializationConfig {
            importance: ImportanceConfig {
                grid_depths: &GRID_DEPTHS,
                hash_seed: 0x5341_4C54_0006,
                bounds: CoordinateBounds::new([-100.0; 2], [100.0; 2]).map_err(profile_error)?,
            },
            raster: RasterConfig {
                grid_size: 512,
                bandwidth_pixels: 4.0,
            },
            merge_tree: MergeTreeConfig::default(),
            regions: RegionConfig::default(),
            analytic_configuration: ContentHash::digest(
                b"hash.graph.atlas.fit.m0-local-analytic-profile.v1",
            ),
        },
        persistence_policy: PersistenceGatePolicy {
            fixed_thresholds: &PERSISTENCE_THRESHOLDS,
            minimum_ratio: 0.25,
            maximum_ratio: 4.0,
            maximum_low_persistence_ratio: 4.0,
            maximum_noise_ratio: 4.0,
        },
        persistence_evaluator,
        legacy_tag: 0,
    })
}

fn projector_loss() -> Result<ProjectorLossConfig, FitProfileError> {
    ProjectorLossConfig::new(
        SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 2.0).map_err(profile_error)?,
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).map_err(profile_error)?,
        GradientBudget::new(0.25, 0.5, 1.0e-6, 1.0e-12).map_err(profile_error)?,
        SupportEnergy {
            huber_delta: 1.0,
            epsilon: 1.0e-8,
        },
        LossWeights {
            semantic_positive: 1.0,
            ordinary_negative: 1.0,
            hard_negative: 1.0,
            relation: 1.0,
            anchor: 0.0,
            landmark: 1.0,
        },
    )
    .map_err(profile_error)
}

fn nonzero(value: usize, field: &'static str) -> Result<NonZeroUsize, FitProfileError> {
    NonZeroUsize::new(value)
        .ok_or_else(|| FitProfileError(format!("m0-local profile requires non-zero {field}")))
}

fn profile_error(error: impl fmt::Display) -> FitProfileError {
    FitProfileError(error.to_string())
}
