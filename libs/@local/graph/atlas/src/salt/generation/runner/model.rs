use core::{num::NonZeroUsize, time::Duration};

use camino::{Utf8Path, Utf8PathBuf};

use crate::salt::{
    evaluation::{ConditionDomain, ConditionMeasurementConfig},
    generation::{
        CanonicalMaterializationConfig, ConditionQuality, LegacyCanvasExport, PublishedCandidate,
    },
    graph::{SemanticGraphConfig, USearchConfig},
    landmark::{LandmarkConfig, LandmarkFitConfig},
    manifest::GenerationManifest,
    projector::{
        ProjectorBatchPlanConfig, ProjectorConfig, ProjectorLossConfig, ProjectorOptimizerConfig,
    },
    relation::{AttractionConfig, ProtectionConfig},
    release::{GateEvidencePayload, GateSigner},
};

/// Numerical, publication, and signed-evidence contract for one generation.
pub(crate) struct CanonicalGenerationConfig<'config> {
    pub root: &'config Utf8Path,
    pub manifest: GenerationManifest,
    pub semantic_index: USearchConfig,
    pub semantic_graph: SemanticGraphConfig,
    pub audit_rows: &'config [u32],
    pub attraction: AttractionConfig,
    pub protection: ProtectionConfig,
    pub landmarks: LandmarkConfig,
    pub landmark_assignment: USearchConfig,
    pub landmark_fit: LandmarkFitConfig,
    pub landmark_radius: f64,
    pub landmark_weight: f64,
    pub projector: ProjectorConfig,
    pub projector_batches: ProjectorBatchPlanConfig,
    pub projector_loss: ProjectorLossConfig,
    pub projector_optimizer: ProjectorOptimizerConfig,
    pub conditions: &'config [f32],
    pub condition_domain: ConditionDomain,
    pub condition_quality: Vec<ConditionQuality>,
    pub condition_measurement: ConditionMeasurementConfig,
    pub canonical_condition: f64,
    pub inference_batch_size: NonZeroUsize,
    pub materialization: CanonicalMaterializationConfig<'config>,
    pub legacy_tag: u16,
    /// External suite payloads for gates other than exact ANN recall.
    ///
    /// The runner derives ANN evidence from its own exact audit. An additional
    /// ANN payload is therefore rejected as duplicate evidence.
    pub gate_payloads: Vec<GateEvidencePayload>,
    pub gate_signer: &'config GateSigner,
}

/// Published but inactive output of one complete generation run.
#[derive(Debug, Clone)]
pub(crate) struct CanonicalGenerationOutcome {
    pub candidate: PublishedCandidate,
    pub manifest: GenerationManifest,
    pub legacy: LegacyCanvasExport,
    pub training_wall_time: Duration,
    pub directory: Utf8PathBuf,
}
